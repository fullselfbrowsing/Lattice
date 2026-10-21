import { receiptCid } from "./cid.js";
import type {
  CapabilityReceiptBody,
  KeySet,
  ReceiptEnvelope,
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
 *
 * Tail truncation: dropping LEAF receipts leaves a smaller tree that is
 * still fully linked. Two commitments catch it. Pass `expectedCount`, or
 * mint the root with `chainClosure: "member-cids"` and a closing receipt
 * whose `chainMemberCids` lists every other member (crew runs do this).
 * A chain that has neither still verifies, and the result carries an
 * advisory saying so. `expectedRootCid` detects a replaced root, not a
 * missing leaf. Dropping the root or an interior node is detected
 * (`no-root`, `orphan-link`).
 *
 * A successful result also carries `advisories` when audience, nonce,
 * expiry, or a raised `minVersion` were left unset. Those checks stay
 * opt-in so older receipts keep verifying.
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
  const { expectedRunId, expectedCount, expectedRootCid, ...verifyOptions } = options;
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

  const closure = checkChainClosure(nodes);
  if (closure !== undefined) return fail(closure);

  const advisories = chainAdvisories(nodes, options, verifyOptions);
  return {
    ok: true,
    rootCid: root.cid,
    count: nodes.length,
    depth,
    cids: nodes.map((node) => node.cid),
    ...(advisories.length > 0 ? { advisories } : {}),
  };
}

function checkChainClosure(nodes: readonly ChainNode[]): VerifyChainError | undefined {
  const closers = nodes.filter((node) => node.body.chainClosure === "member-cids");
  const listed = nodes.filter((node) => node.body.chainMemberCids !== undefined);
  if (closers.length === 0 && listed.length === 0) return undefined;
  if (closers.length === 0) {
    return {
      kind: "count-mismatch",
      message: "a receipt lists chainMemberCids but no receipt declared chainClosure",
    };
  }
  if (listed.length !== 1) {
    return {
      kind: "count-mismatch",
      message: `chainClosure requires exactly one receipt with chainMemberCids, found ${listed.length}`,
    };
  }
  const closer = listed[0]!;
  const declared = closer.body.chainMemberCids;
  if (declared === undefined || declared.some((cid) => typeof cid !== "string")) {
    return {
      kind: "count-mismatch",
      cid: closer.cid,
      message: "chainMemberCids must be an array of CID strings",
    };
  }
  const actual = new Set(nodes.filter((node) => node.cid !== closer.cid).map((node) => node.cid));
  const declaredSet = new Set(declared);
  const same =
    declaredSet.size === actual.size &&
    declaredSet.size === declared.length &&
    [...declaredSet].every((cid) => actual.has(cid));
  if (!same) {
    return {
      kind: "count-mismatch",
      cid: closer.cid,
      message: `chainMemberCids lists ${declared.length} members but the chain has ${actual.size} receipts besides the closer; a member was added or dropped`,
    };
  }
  return undefined;
}

function chainAdvisories(
  nodes: readonly ChainNode[],
  options: VerifyChainOptions,
  verifyOptions: VerifyOptions,
): readonly string[] {
  const notes: string[] = [];
  const closed = nodes.some((node) => node.body.chainClosure === "member-cids");
  if (options.expectedCount === undefined && !closed) {
    notes.push(
      "tail truncation of leaf receipts is not checked; pass expectedCount or mint a chainClosure receipt",
    );
  }
  const seen = new Set<string>();
  for (const node of nodes) {
    for (const note of receiptVerifyAdvisories(node.body, verifyOptions)) {
      if (!seen.has(note)) {
        seen.add(note);
        notes.push(note);
      }
    }
  }
  return notes;
}
