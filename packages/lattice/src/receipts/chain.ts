import { receiptCid } from "./cid.js";
import type {
  CapabilityReceiptBody,
  KeySet,
  ReceiptEnvelope,
  VerifyAdvisory,
  VerifyChainError,
  VerifyChainOptions,
  VerifyChainResult,
  VerifyOptions,
} from "./types.js";
import { receiptVerifyAdvisories, verifyReceipt } from "./verify.js";

interface ChainNode {
  readonly cid: string;
  readonly body: CapabilityReceiptBody;
}

function fail(error: VerifyChainError): VerifyChainResult {
  return { ok: false, error };
}

async function safeCid(envelope: ReceiptEnvelope): Promise<string | undefined> {
  try {
    return await receiptCid(envelope);
  } catch {
    return undefined;
  }
}

/**
 * Verify a set of receipts as a TREE linked by `parentReceiptCid`.
 *
 * Lattice receipts chain as a tree, not a list: a crew root has no parent
 * and every child completion receipt points at the root's CID (see
 * agent/crew/run-crew.ts). This verifier is therefore order-independent.
 * Input order only decides which error is reported first and the order of
 * `cids` in a successful result.
 *
 * Checks, in order:
 *   1. every envelope passes `verifyReceipt(envelope, keySet, options)`;
 *      the first failure is returned as `link-invalid` with `cause`
 *   2. CIDs are unique (`duplicate-cid`)
 *   3. every body shares one runId, equal to `expectedRunId` when given
 *      (`run-id-mismatch`)
 *   4. exactly one receipt has no `parentReceiptCid` (`no-root`,
 *      `multiple-roots`)
 *   5. every parent CID is present in the set and every receipt is reachable
 *      from the root (`orphan-link`)
 *   6. `expectedCount` and `expectedRootCid` match when given
 *      (`count-mismatch`, `root-mismatch`)
 *   7. chain closure, when any receipt declares `chainClosure` or
 *      `requireClosure` is set (`count-mismatch`, see below)
 *
 * Tail truncation: dropping LEAF receipts leaves a smaller tree that is
 * still fully linked. Two commitments catch it. Pass `expectedCount`, or
 * mint the root with `chainClosure: "member-cids"` and a closing receipt
 * whose `chainMemberCids` lists every other member (crew runs do this).
 * With closure declared, exactly one closing receipt must be present and
 * its list must equal the other presented CIDs, so a dropped or added
 * member fails. Only the root may declare closure; a declaration on any
 * other receipt fails. `partial: true` relaxes the list check to "every
 * presented receipt is listed" for selective disclosure; the closer is
 * still required, and unpresented members are reported as a
 * `closure-partial` warning.
 * `requireClosure: true` rejects a chain that declares no closure at all.
 * Without either commitment a chain still verifies, and the result carries
 * a `tail-truncation-unchecked` advisory. `expectedRootCid` detects a
 * replaced root, not a missing leaf. Dropping the root or an interior node
 * is detected (`no-root`, `orphan-link`).
 *
 * A successful result also carries structured `advisories` (see
 * `receiptVerifyAdvisories`) for bindings that were not checked and
 * optional checks the receipts do not use. Those checks stay opt-in so
 * older receipts keep verifying.
 *
 * No replay cache is kept; dedupe on `receiptCid()` if a receipt must only
 * be accepted once. Invalid caller options (unknown `minVersion`,
 * unparseable `now`) throw a TypeError exactly as `verifyReceipt` does.
 */
export async function verifyChain(
  envelopes: readonly ReceiptEnvelope[],
  keySet: KeySet,
  options: VerifyChainOptions = {},
): Promise<VerifyChainResult> {
  const {
    expectedRunId,
    expectedCount,
    expectedRootCid,
    requireClosure,
    partial,
    ...verifyOptions
  } = options;
  const linkOptions: VerifyOptions = verifyOptions;

  if (envelopes.length === 0) {
    return fail({ kind: "no-root", message: "chain is empty: no receipts to verify" });
  }

  // Step 1 and 2: verify every link and collect CIDs.
  const nodes: ChainNode[] = [];
  const byCid = new Map<string, CapabilityReceiptBody>();
  for (const [index, envelope] of envelopes.entries()) {
    const result = await verifyReceipt(envelope, keySet, linkOptions);
    if (!result.ok) {
      const cid = await safeCid(envelope);
      return fail({
        kind: "link-invalid",
        message: `receipt[${index}] failed verification: ${result.error.kind}: ${result.error.message}`,
        ...(cid !== undefined ? { cid } : {}),
        cause: result.error,
      });
    }
    // verifyReceipt now rejects non-canonical base64, so this cannot throw
    // for a verified envelope; the guard keeps the never-throws contract if
    // the two decoders ever drift again.
    let cid: string;
    try {
      cid = await receiptCid(envelope);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail({
        kind: "link-invalid",
        message: `receipt[${index}] verified but its payload cannot be content-addressed: ${message}`,
        cause: { kind: "envelope-malformed", message },
      });
    }
    if (byCid.has(cid)) {
      return fail({
        kind: "duplicate-cid",
        cid,
        message: `receipt[${index}] duplicates CID ${cid}`,
      });
    }
    byCid.set(cid, result.body);
    nodes.push({ cid, body: result.body });
  }

  // Step 3: one runId for the whole tree.
  const first = nodes[0]!;
  const runId = first.body.runId;
  if (expectedRunId !== undefined && runId !== expectedRunId) {
    return fail({
      kind: "run-id-mismatch",
      cid: first.cid,
      message: `chain runId "${runId}" does not match expected "${expectedRunId}"`,
    });
  }
  for (const node of nodes) {
    if (node.body.runId !== runId) {
      return fail({
        kind: "run-id-mismatch",
        cid: node.cid,
        message: `receipt ${node.cid} has runId "${node.body.runId}" but the chain has "${runId}"`,
      });
    }
  }

  // Step 4: exactly one root. Checked before orphan detection so a dropped
  // root reads as no-root rather than as a pile of orphans.
  const roots = nodes.filter((node) => node.body.parentReceiptCid === undefined);
  if (roots.length === 0) {
    return fail({
      kind: "no-root",
      message: "no receipt without parentReceiptCid; the root receipt is missing",
    });
  }
  if (roots.length > 1) {
    return fail({
      kind: "multiple-roots",
      cid: roots[1]!.cid,
      message: `expected exactly one root receipt, found ${roots.length}: ${roots.map((root) => root.cid).join(", ")}`,
    });
  }
  const root = roots[0]!;

  // Step 5: parent linkage and reachability.
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    const parent = node.body.parentReceiptCid;
    if (parent === undefined) continue;
    if (!byCid.has(parent)) {
      return fail({
        kind: "orphan-link",
        cid: node.cid,
        message: `receipt ${node.cid} references parent ${parent}, which is not in the chain`,
      });
    }
    const siblings = children.get(parent) ?? [];
    siblings.push(node.cid);
    children.set(parent, siblings);
  }

  const depthByCid = new Map<string, number>([[root.cid, 0]]);
  const queue: string[] = [root.cid];
  let depth = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depthByCid.get(current) ?? 0;
    for (const child of children.get(current) ?? []) {
      if (depthByCid.has(child)) continue;
      depthByCid.set(child, currentDepth + 1);
      depth = Math.max(depth, currentDepth + 1);
      queue.push(child);
    }
  }
  for (const node of nodes) {
    if (!depthByCid.has(node.cid)) {
      return fail({
        kind: "orphan-link",
        cid: node.cid,
        message: `receipt ${node.cid} is not reachable from the root ${root.cid}`,
      });
    }
  }

  // Step 6: out-of-band commitments.
  if (expectedCount !== undefined && nodes.length !== expectedCount) {
    return fail({
      kind: "count-mismatch",
      message: `chain has ${nodes.length} receipts; expected ${expectedCount}`,
    });
  }
  if (expectedRootCid !== undefined && root.cid !== expectedRootCid) {
    return fail({
      kind: "root-mismatch",
      cid: root.cid,
      message: `chain root is ${root.cid}; expected ${expectedRootCid}`,
    });
  }

  // Step 7: chain closure.
  const closure = checkChainClosure(nodes, {
    requireClosure: requireClosure === true,
    partial: partial === true,
  });
  if (!closure.ok) return fail(closure.error);

  const advisories = chainAdvisories(nodes, {
    closed: closure.closed,
    expectedCount,
    verifyOptions,
    ...(closure.unpresented !== undefined ? { unpresented: closure.unpresented } : {}),
  });
  return {
    ok: true,
    rootCid: root.cid,
    count: nodes.length,
    depth,
    cids: nodes.map((node) => node.cid),
    ...(advisories.length > 0 ? { advisories } : {}),
  };
}

type ClosureCheck =
  | {
      readonly ok: true;
      readonly closed: boolean;
      /** Listed members that a `partial` verification did not see. */
      readonly unpresented?: number;
    }
  | { readonly ok: false; readonly error: VerifyChainError };

/**
 * Enforce `chainClosure`. Every failure is `count-mismatch` (the kind is
 * shared with `expectedCount` on purpose; see VerifyChainErrorKind). Never
 * throws: asReceiptBody already rejected malformed fields, and the
 * Array.isArray guard keeps that true if the two drift.
 */
function checkChainClosure(
  nodes: readonly ChainNode[],
  mode: { readonly requireClosure: boolean; readonly partial: boolean },
): ClosureCheck {
  // Only the root may declare closure. A declaration further down could be
  // dropped together with its closer, leaving an unclosed chain that
  // verifies, so it fails even when every member is present.
  const misplaced = nodes.find(
    (node) => node.body.chainClosure !== undefined && node.body.parentReceiptCid !== undefined,
  );
  if (misplaced !== undefined) {
    return countMismatch(
      misplaced.cid,
      `receipt ${misplaced.cid} declares chainClosure but is not the root; only the root receipt may declare closure`,
    );
  }
  const declared = nodes.some((node) => node.body.chainClosure === "member-cids");
  const listed = nodes.filter((node) => node.body.chainMemberCids !== undefined);
  if (!declared && listed.length === 0) {
    if (mode.requireClosure) {
      return countMismatch(
        undefined,
        "requireClosure is set but no receipt declares chainClosure, so dropped leaves cannot be detected",
      );
    }
    return { ok: true, closed: false };
  }
  if (!declared) {
    return countMismatch(
      undefined,
      "a receipt lists chainMemberCids but no receipt declared chainClosure",
    );
  }
  if (listed.length !== 1) {
    return countMismatch(
      undefined,
      `chainClosure requires exactly one receipt with chainMemberCids, found ${listed.length}`,
    );
  }
  const closer = listed[0]!;
  const members: unknown = closer.body.chainMemberCids;
  if (!Array.isArray(members) || !members.every((cid) => typeof cid === "string")) {
    return countMismatch(closer.cid, "chainMemberCids must be an array of CID strings");
  }
  const declaredSet = new Set<string>(members);
  if (declaredSet.size !== members.length) {
    return countMismatch(closer.cid, "chainMemberCids lists a CID more than once");
  }
  const presented = nodes.filter((node) => node.cid !== closer.cid);
  const unlisted = presented.find((node) => !declaredSet.has(node.cid));
  if (unlisted !== undefined) {
    return countMismatch(
      unlisted.cid,
      `receipt ${unlisted.cid} is not listed in the closing receipt's chainMemberCids; a member was added`,
    );
  }
  if (mode.partial) {
    return { ok: true, closed: true, unpresented: declaredSet.size - presented.length };
  }
  if (presented.length !== declaredSet.size) {
    return countMismatch(
      closer.cid,
      `chainMemberCids lists ${declaredSet.size} members but the chain has ${presented.length} besides the closer; a member was dropped`,
    );
  }
  return { ok: true, closed: true };
}

function countMismatch(cid: string | undefined, message: string): ClosureCheck {
  return {
    ok: false,
    error: { kind: "count-mismatch", message, ...(cid !== undefined ? { cid } : {}) },
  };
}

function chainAdvisories(
  nodes: readonly ChainNode[],
  input: {
    readonly closed: boolean;
    readonly expectedCount: number | undefined;
    readonly verifyOptions: VerifyOptions;
    readonly unpresented?: number;
  },
): readonly VerifyAdvisory[] {
  const notes: VerifyAdvisory[] = [];
  if (input.expectedCount === undefined && !input.closed) {
    notes.push({
      code: "tail-truncation-unchecked",
      severity: "warn",
      message:
        "dropped leaf receipts are not detected; pass expectedCount or verify a chain whose root declares chainClosure",
    });
  }
  if (input.unpresented !== undefined && input.unpresented > 0) {
    notes.push({
      code: "closure-partial",
      severity: "warn",
      message: `partial verification: ${input.unpresented} member(s) listed by the closing receipt were not presented and were not checked`,
    });
  }
  const seen = new Set<string>();
  for (const node of nodes) {
    for (const note of receiptVerifyAdvisories(node.body, input.verifyOptions)) {
      const key = `${note.code}\u0000${note.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        notes.push(note);
      }
    }
  }
  return notes;
}
