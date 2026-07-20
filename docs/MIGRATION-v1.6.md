# Migrating to Lattice SDK v1.6

Lattice 1.6 is an additive SDK release with one runtime support change: both
`@full-self-browsing/lattice` and `@full-self-browsing/lattice-cli` now require Node.js
24 or newer. The release is validated on Node 24 LTS and Node 26 Current.

```bash
pnpm add @full-self-browsing/lattice@^1.6.0
pnpm add -g @full-self-browsing/lattice-cli@^1.6.0
```

SDK version 1.6.0 and receipt schema versions are independent. New receipts still use
the corrected `lattice-receipt/v1.4` body with the signed
`signatureProfile: "dsse-v1"` field. There is no `lattice-receipt/v1.6` body.

## Upgrade Checklist

1. Run production and CI consumers on Node 24 or Node 26.
2. Upgrade the runtime and CLI together to 1.6.0.
3. Decide whether each receipt read boundary needs compatibility mode or strict mode.
4. Review persistence and session policies before enabling storage for tenant-scoped data.
5. Treat unknown pricing as distinct from free pricing anywhere a hard cost ceiling is set.
6. Read agent and crew receipts directly from returned results; do not reconstruct or remint them.
7. Run the packed-consumer and release gates before publishing or deploying.

## Receipt Bridge

All 1.6 issuance paths mint only standard DSSE receipts:

```ts
import {
  createInMemorySigner,
  createMemoryKeySet,
  createReceipt,
  generateEd25519KeyPairJwk,
  verifyReceipt,
} from "@full-self-browsing/lattice";

const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
const signer = createInMemorySigner(privateKeyJwk, {
  kid: "migration-key",
  publicKeyJwk,
});
const keySet = createMemoryKeySet([
  { kid: signer.kid, publicKeyJwk, state: "active" },
]);

const envelope = await createReceipt(
  {
    runId: "migration-run",
    model: { requested: "example-model", observed: "example-model" },
    route: {
      providerId: "example",
      capabilityId: "chat",
      attemptNumber: 1,
    },
    usage: { promptTokens: 1, completionTokens: 1, costUsd: null },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
  },
  signer,
);

const compatible = await verifyReceipt(envelope, keySet);
const strict = await verifyReceipt(envelope, keySet, {
  legacyPolicy: "reject",
});

if (compatible.ok) {
  console.log(compatible.verificationProfile, compatible.deprecated);
}
if (strict.ok) {
  console.log(strict.body.version); // lattice-receipt/v1.4
}
```

Omitting `legacyPolicy` keeps the v1.6 compatibility default, which attempts standard
DSSE first and permits the deprecated historical base64-text PAE path only for v1.1-v1.3
bodies. `legacyPolicy: "reject"` disables that fallback. It does not reject an older body
whose standard DSSE signature verifies. A v1.4 body is always standard-only, and no public
API can mint a legacy signature.

The CLI uses the same distinction:

```bash
lattice verify receipt.json --key keyset.json
lattice verify receipt.json --key keyset.json --standard-only
lattice repro receipt.json --standard-only
```

Successful verification and replay output includes `profile=` and `deprecated=`. See the
[receipt v1.4 protocol migration](../spec/MIGRATION-v1.4.md) for algorithms, verdicts,
cross-language behavior, and conformance corpora.

## Authoritative Context and Persistence

The provider request, input hashes, receipt inputs, attempt evidence, and replay plan now
share one route-specific materialized context projection. Each fallback route is packed
again against that route's limits. Archived items, raw sources replaced by summaries, and
unselected session references are excluded before provider execution.

Storage and session policy is explicit:

```ts
import {
  artifact,
  createAI,
  createFakeProvider,
  createMemoryArtifactStore,
  createMemorySessionStore,
} from "@full-self-browsing/lattice";

const sessions = createMemorySessionStore();
await sessions.create({
  id: "migration-session",
  tenantId: "tenant-example",
  privacy: "standard",
  retention: "session",
});

const ai = createAI({
  providers: [
    createFakeProvider({ response: { rawOutputs: { answer: "stored" } } }),
  ],
  storage: createMemoryArtifactStore(),
  sessions,
});

const result = await ai.run({
  task: "Store and summarize this tenant-scoped note",
  artifacts: [artifact.text("A bounded example")],
  outputs: { answer: "text" },
  session: ai.session("migration-session"),
  policy: {
    tenantId: "tenant-example",
    privacy: "standard",
    retention: "session",
    missingArtifactRef: "error",
  },
});

if (!result.ok) throw new Error(result.error.message);
console.log(result.plan.contextProjection?.id);
```

`missingArtifactRef: "error"` is the default and fails before a provider call when a
selected stored reference cannot be loaded. Use `"omit"` only when an explicit omission
with a content-free warning is acceptable. Tenant-scoped loads fail closed on missing or
conflicting tenant scope. Store-returned references, privacy, and retention metadata are
authoritative.

## Audit, Evaluation, and Cost

Receipt issuance has three modes:

```ts
const auditedAI = createAI({
  providers: [createFakeProvider({ response: { rawOutputs: { answer: "ok" } } })],
  signer,
  receiptMode: "required",
});
```

- `off` disables automatic issuance even when a signer exists.
- `best-effort` is the compatibility behavior when a signer is configured without an
  explicit mode. Signing failure preserves execution and exposes only bounded diagnostics.
- `required` fails before provider work when no signer is available and returns a typed
  terminal audit failure if post-execution signing fails. It does not repeat provider work.

The shared cost estimator keeps known zero pricing distinct from missing pricing. A hard
`maxCostUsd` rejects unknown cost and accepts exact budget equality. Provider-reported cost
remains the post-execution billing authority when available.

`lattice eval` now retains a row for every load, verification, materialization, replay, and
unevaluable-output failure. Invalid input exits 2 after emitting the complete report, and
`--init-baseline` does not write a partial baseline.

## Agent and Crew Evidence

When automatic receipts are enabled, iteration and terminal results carry the exact issued
envelopes:

```ts
const agentResult = await ai.runAgent({
  task: "Return a final answer",
  tools: [],
  signer,
  receiptMode: "required",
});

for (const iteration of agentResult.iterations) {
  console.log(iteration.iterationId, iteration.receipt);
}
console.log(agentResult.receipt);
```

New agent snapshots retain a stable execution ID and completed iteration ledger under the
existing `agent-snapshot/v1` literal. Resume reuses stored envelopes and does not remint
completed iterations. Invalid present snapshots fail before provider work.

Crew results reuse member terminal envelopes rather than creating replacement evidence.
`CrewResult.receipts` is ordered as the crew root, serial child completions, then the parent
terminal envelope. `CrewAgentResult.receiptCids` points to those same envelopes.

## Release Validation

Run these commands from the repository root:

```bash
pnpm typecheck
pnpm lint:packages
pnpm test
pnpm test:types
pnpm build
pnpm check:package-version
pnpm check:tarball
pnpm check:core-boundary
pnpm check:module-boundaries
pnpm check:packed-consumer
pnpm check:comment-hygiene
node scripts/check-workflow-safety.mjs
node --test scripts/operational-interop.test.mjs scripts/provider-canary.test.mjs scripts/check-comment-hygiene.test.mjs
```

`pnpm check:packed-consumer` is the distribution authority: it packs both packages,
installs their tarballs into an isolated ESM consumer, rejects unresolved workspace links,
and exercises standard and historical receipt plus CLI behavior. The optional live provider
canary is a separate scheduled/manual operational signal; see
[Provider canaries](./provider-canaries.md).
