---
quick_id: 260616-inn
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/lattice/src/providers/no-public-url.ts
  - packages/lattice/src/providers/no-public-url.test.ts
  - packages/lattice/src/providers/adapters.ts
  - packages/lattice/src/providers/anthropic.ts
  - packages/lattice/src/providers/gemini.ts
  - packages/lattice/src/providers/parity.test.ts
  - packages/lattice/src/index.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "A run with noPublicUrl:true whose artifact carries a public URL in metadata.base64Data throws NoPublicUrlEgressError before the fetch fires"
    - "A run with noPublicUrl:true whose artifact carries a public URL as value (metadata.encoding=base64) throws NoPublicUrlEgressError before the fetch fires"
    - "This behaviour is uniform across OpenAI-compatible (execute+executeStream), Anthropic (execute+stream), and Gemini (execute+stream)"
    - "A noPublicUrl run whose URL artifact was already stripped to a data-URL by packaging does NOT throw"
    - "A run where only policy.gateway.metadata contains a URL (not an artifact) does NOT throw"
    - "A run without noPublicUrl never throws from the assertion, even if artifacts have public URLs"
    - "NoPublicUrlEgressError is exported from the package root so callers can instanceof-check it"
  artifacts:
    - path: "packages/lattice/src/providers/no-public-url.ts"
      provides: "assertNoPublicUrlEgress + NoPublicUrlEgressError"
      exports: ["assertNoPublicUrlEgress", "NoPublicUrlEgressError"]
    - path: "packages/lattice/src/providers/no-public-url.test.ts"
      provides: "unit tests for the assertion module in isolation"
    - path: "packages/lattice/src/providers/parity.test.ts"
      provides: "cross-adapter defense-in-depth parity tests (RED→GREEN)"
  key_links:
    - from: "packages/lattice/src/providers/adapters.ts"
      to: "assertNoPublicUrlEgress"
      via: "import + call before fetchImpl in execute and streamOpenAICompatibleResponse"
    - from: "packages/lattice/src/providers/anthropic.ts"
      to: "assertNoPublicUrlEgress"
      via: "import + call before fetchImpl in execute and streamAnthropicResponse"
    - from: "packages/lattice/src/providers/gemini.ts"
      to: "assertNoPublicUrlEgress"
      via: "import + call before fetchImpl in execute and streamGeminiResponse"
---

<objective>
Add a single shared egress assertion (`assertNoPublicUrlEgress`) that every provider
adapter calls immediately before its run-request `fetch`, serving as a fail-closed
defense-in-depth layer that catches public-URL leakage through any path the per-site
gating missed (mislabeled base64 metadata, custom adapters, future adapter drift).

Purpose: Close the residual gaps surfaced in REVIEW3 (gateway metadata URL path and
base64-string mislabeling path) without fragmenting policy enforcement across six
call sites. Lock the invariant with cross-adapter parity tests that fail RED before
the wiring and turn GREEN after it.

Output: `no-public-url.ts` (module + error class), unit tests, adapter wiring in
adapters.ts/anthropic.ts/gemini.ts, cross-adapter parity block in parity.test.ts,
`NoPublicUrlEgressError` exported from index.ts.
</objective>

<execution_context>
Branch: recon — do NOT switch branches. Feeds release PR #12 for v1.4 / 1.4.0.
No version bump. No .changeset/ edits.

Commit strategy: atomic commits per task.
  Task 1: feat(providers): add assertNoPublicUrlEgress shared chokepoint + unit tests
  Task 2: feat(providers): wire assertNoPublicUrlEgress into all three adapter egress paths + parity tests
  Task 3: chore(ci): run full CI gate for chokepoint
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260616-h31-harden-nopublicurl-enforcement-openai-co/260616-h31-REVIEW3.md

<interfaces>
<!-- Key types and contracts. Extracted from codebase. -->

From packages/lattice/src/providers/provider.ts:
```typescript
export interface ProviderRunRequest {
  readonly task: string;
  readonly artifacts: readonly ArtifactInput[];
  readonly outputs: readonly string[];
  readonly policy?: unknown;  // cast to PolicySpec to read noPublicUrl
  // ... other fields
}
```

From packages/lattice/src/policy/policy.ts:
```typescript
export interface PolicySpec {
  readonly noPublicUrl?: boolean;
  readonly gateway?: GatewayPolicy;
  // ...
}
```

From packages/lattice/src/providers/multimodal.ts:
```typescript
// Already exported — import from here
export function isHttpUrl(value: unknown): value is string;
export async function artifactBase64Data(artifact: ArtifactInput): Promise<string | undefined>;
```

From packages/lattice/src/artifacts/artifact.ts:
```typescript
export interface ArtifactInput {
  readonly value: unknown;
  readonly metadata?: Record<string, unknown>;
  // ...
}
```

Error handling in create-ai.ts (~line 697):
  Every Error thrown by adapter.execute() or inside executeStream() propagates
  through the catch(error) block which:
    1. Extracts error.message
    2. Pushes attemptFailed() to attempts[]
    3. Emits "provider.attempt" event with status:"failed"
    4. Eventually returns RunFailure with kind:"provider_execution"
  Conclusion: THROWING is safe — it produces a clean RunFailure, not a crash.

Key wiring sites (all six are egress calls immediately before fetchImpl):
  adapters.ts ~443: init.body = JSON.stringify(...); await fetchImpl(..., init)  [execute]
  adapters.ts ~538: inline body: JSON.stringify(...) in fetchImpl call           [executeStream]
  anthropic.ts ~533: init.body = JSON.stringify(messagesBody.body); await fetchImpl(..., init)  [execute]
  anthropic.ts ~618: inline body: JSON.stringify(messagesBody.body)              [stream]
  gemini.ts ~505: init.body = JSON.stringify(requestBody); await fetchImpl(url, init)  [execute]
  gemini.ts ~597: inline body: JSON.stringify(requestBody)                       [stream]
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create no-public-url.ts assertion module + unit tests</name>
  <files>
    packages/lattice/src/providers/no-public-url.ts,
    packages/lattice/src/providers/no-public-url.test.ts,
    packages/lattice/src/index.ts
  </files>
  <behavior>
    - When policy?.noPublicUrl is NOT true: assertNoPublicUrlEgress is a no-op (returns void, no throw)
    - When policy?.noPublicUrl is true AND an artifact.value is an http(s) URL string AND that string appears in serializedBody: throws NoPublicUrlEgressError
    - When policy?.noPublicUrl is true AND an artifact.metadata entry value is an http(s) URL string AND that string appears in serializedBody: throws NoPublicUrlEgressError
    - When policy?.noPublicUrl is true but the only artifact value is a data: URL (starts with "data:"): does NOT throw (data URLs are not http(s))
    - When policy?.noPublicUrl is true but the artifact's http(s) URL does NOT appear in serializedBody: does NOT throw (was stripped by packaging)
    - The error message includes: the provider id, the artifact id, and the offending URL
    - NoPublicUrlEgressError extends Error with name "NoPublicUrlEgressError"
  </behavior>
  <action>
    Write packages/lattice/src/providers/no-public-url.ts as a new standalone module.

    Export `NoPublicUrlEgressError extends Error`:
    - Constructor: (providerId: string, artifactId: string, offendingUrl: string)
    - Set this.name = "NoPublicUrlEgressError"
    - Message format: "noPublicUrl policy violated: provider '{providerId}' artifact '{artifactId}' would leak public URL '{offendingUrl}'"

    Export `assertNoPublicUrlEgress(request: ProviderRunRequest, providerId: string, serializedBody: string): void`:
    - Import `isHttpUrl` from "./multimodal.js" (already exported there)
    - Import type `PolicySpec` from "../policy/policy.js"
    - Cast `(request.policy as PolicySpec | undefined)` to read `noPublicUrl`
    - If noPublicUrl is not true: return immediately (zero cost when policy is absent or flag is unset)
    - Build `forbidden`: iterate `request.artifacts`; for each artifact:
        - If `typeof artifact.value === "string" && isHttpUrl(artifact.value)`: add `{ url: artifact.value, id: artifact.id ?? "" }`
        - For each value in `artifact.metadata ?? {}`: if `typeof v === "string" && isHttpUrl(v)`: add `{ url: v, id: artifact.id ?? "" }`
    - For each entry in `forbidden`: if `serializedBody.includes(entry.url)`:
        throw new NoPublicUrlEgressError(providerId, entry.id, entry.url)
    - Important: data: URLs are not http(s) URLs (isHttpUrl rejects them via the URL protocol check), so they are naturally excluded from `forbidden`.
    - Scope note (document in a JSDoc comment): this function governs ARTIFACT-DERIVED URLs. URLs in `policy.gateway.metadata` are NOT artifact-derived and are therefore NOT in scope; they will not be in `request.artifacts` so the loop naturally excludes them.

    Write packages/lattice/src/providers/no-public-url.test.ts:
    - Import { assertNoPublicUrlEgress, NoPublicUrlEgressError } from "./no-public-url.js"
    - Run tests with `describe("assertNoPublicUrlEgress")` containing:
      1. "no-op when noPublicUrl is not set": call with request.policy = undefined, any body; expect no throw
      2. "no-op when noPublicUrl is false": call with policy = { noPublicUrl: false }; expect no throw
      3. "throws when artifact.value is a public URL present in body": artifact value "https://evil.example/x.png", body contains that string; expect throw of NoPublicUrlEgressError matching the URL
      4. "throws when artifact.metadata entry is a public URL present in body": artifact value is opaque data, metadata.base64Data = "https://evil.example/x.png", body contains that string; expect throw
      5. "does not throw for data: URL in artifact.value (not http(s))": value = "data:image/png;base64,abc"; expect no throw
      6. "does not throw when URL has been stripped from body (packaging already removed it)": artifact.value = "https://evil.example/x.png" but serializedBody does NOT contain the URL; expect no throw
      7. "error carries provider id, artifact id, offending URL": verify message contents
      8. "NoPublicUrlEgressError is instanceof Error and instanceof NoPublicUrlEgressError": verify both

    Add to packages/lattice/src/index.ts:
    - Export `NoPublicUrlEgressError` from "./providers/no-public-url.js"
    - This is the only public export; `assertNoPublicUrlEgress` is internal.

    Commit: `feat(providers): add assertNoPublicUrlEgress shared chokepoint + unit tests`
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/lattice/dubai && npx tsc --noEmit -p packages/lattice/tsconfig.json && npx vitest run packages/lattice/src/providers/no-public-url.test.ts</automated>
  </verify>
  <done>
    no-public-url.ts compiles clean; all 8 unit tests pass; NoPublicUrlEgressError is exported from index.ts.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire assertion into all six egress sites + cross-adapter parity tests (RED then GREEN)</name>
  <files>
    packages/lattice/src/providers/adapters.ts,
    packages/lattice/src/providers/anthropic.ts,
    packages/lattice/src/providers/gemini.ts,
    packages/lattice/src/providers/parity.test.ts
  </files>
  <behavior>
    - For each of the three adapter families (OpenAI-compat, Anthropic, Gemini), both the execute and executeStream egress paths call assertNoPublicUrlEgress before fetchImpl
    - A run with noPublicUrl:true and a base64-mislabeled artifact (metadata.base64Data = "https://evil.example/x.png") throws NoPublicUrlEgressError from all three adapter families
    - A run with noPublicUrl:true and a properly stripped artifact (URL not in serialized body) does NOT throw from any adapter
    - A run where only policy.gateway.metadata contains a URL (not an artifact) does NOT throw
    - A run without noPublicUrl:true passes through normally
  </behavior>
  <action>
    STEP A — Write parity tests first (RED gate).

    Append to packages/lattice/src/providers/parity.test.ts a new describe block:
    `describe("noPublicUrl defense-in-depth chokepoint parity (260616-inn)")`.

    The block needs these imports at top of file (add to existing imports if not present):
      import { NoPublicUrlEgressError } from "./no-public-url.js";
      import { createAnthropicProvider } from "./anthropic.js";
      import { createGeminiProvider } from "./gemini.js";
      import { createOpenAICompatibleProvider } from "./adapters.js";

    Shared fixture:
    - PUBLIC_URL = "https://evil.example/x.png"
    - mislabeled artifact: { kind: "image", value: "data:image/png;base64,abc" (clean data URL), metadata: { base64Data: PUBLIC_URL, encoding: "base64" } } — this simulates the mislabeling vector
    - policy: { noPublicUrl: true } on the request

    For each adapter family (openai-compat, anthropic, gemini), write a helper that:
    - Accepts a body-builder that produces a serialized JSON string for the mislabeled artifact
    - Uses a fake fetch that captures body and returns a valid provider response

    Test 1 (RED before wiring, GREEN after): "OpenAI-compat execute throws NoPublicUrlEgressError for base64-mislabeled artifact under noPublicUrl"
    - Build OpenAI-compat adapter with fake fetch returning OPENAI_COMPAT_BODY
    - Call adapter.execute!({ task: "t", artifacts: [mislabeledArtifact], outputs: ["text"], policy: { noPublicUrl: true } })
    - Expect rejects.toBeInstanceOf(NoPublicUrlEgressError)
    - Verify error.message contains PUBLIC_URL

    Test 2 (RED before wiring, GREEN after): "Anthropic execute throws NoPublicUrlEgressError for base64-mislabeled artifact under noPublicUrl"
    - Build Anthropic adapter with fake fetch returning ANTHROPIC_BODY
    - Same call pattern
    - Expect rejects.toBeInstanceOf(NoPublicUrlEgressError)

    Test 3 (RED before wiring, GREEN after): "Gemini execute throws NoPublicUrlEgressError for base64-mislabeled artifact under noPublicUrl"
    - Build Gemini adapter with fake fetch returning GEMINI_BODY
    - Same call pattern
    - Expect rejects.toBeInstanceOf(NoPublicUrlEgressError)

    Test 4 (must be GREEN immediately — no-false-positive): "No throw when noPublicUrl:true but URL was already stripped from body (packaging removed it)"
    - Use an artifact whose value is a public URL but send a serialized body that does NOT contain it (simulate packaging already replacing it with a data URL representation)
    - Because assertNoPublicUrlEgress scans serializedBody for the substring, it will not throw if the body has already been sanitized
    - Build the OpenAI-compat adapter, construct a request with providerPackaging transport "base64", and assert the test resolves (does not throw)
    - This test exercises the no-over-block invariant via the chokepoint directly

    Test 5 (must be GREEN immediately — scope): "No throw when gateway metadata has a URL but no artifact has a public URL under noPublicUrl"
    - Artifact: plain text, no URLs
    - policy: { noPublicUrl: true, gateway: { metadata: { source: "https://gateway.example/route" } } }
    - Call adapter.execute — expect no throw
    - Confirms scope: gateway metadata URLs are not artifact-derived, not in forbidden set

    Test 6 (must be GREEN immediately — positive baseline): "No throw when noPublicUrl is not set even with URL artifact"
    - Artifact: { value: PUBLIC_URL, kind: "url" }
    - policy: undefined (or { noPublicUrl: false })
    - Call adapter.execute — expect no throw

    Run the tests now — Tests 1, 2, 3 should FAIL (RED). Tests 4, 5, 6 should pass. Confirm RED/GREEN split, then proceed to wiring.

    STEP B — Wire assertNoPublicUrlEgress into all six egress sites.

    In each of the six adapter execution paths:
    1. Import `{ assertNoPublicUrlEgress }` from `"./no-public-url.js"` at the top of each file.
    2. Identify the `providerId` (the adapter's `id` field — e.g. "openai", "openai-compatible", "anthropic", "gemini").
    3. Compute the serialized body string (using the existing JSON.stringify call result) into a local `const bodyStr`.
    4. Call `assertNoPublicUrlEgress(request, providerId, bodyStr)` immediately AFTER computing `bodyStr` and BEFORE calling `fetchImpl`.
    5. Pass `bodyStr` as the `body:` field in the fetch init (replace the inline JSON.stringify in fetch init with the captured variable where needed).

    Specific wiring per site:

    adapters.ts execute (~443):
      The `body:` in `init` is currently `JSON.stringify(createOpenAICompatibleRequestBody(...))`.
      Extract: `const bodyStr = JSON.stringify(createOpenAICompatibleRequestBody({ model: options.model, request, ...(metadata !== undefined ? { metadata } : {}) }));`
      Then use `bodyStr` in the init object: `body: bodyStr`
      Call `assertNoPublicUrlEgress(request, id, bodyStr);` after init is built, before `fetchImpl`.
      `id` is the closure variable from the adapter factory (e.g. "openai", "openai-compatible", etc.)

    adapters.ts executeStream / streamOpenAICompatibleResponse (~538):
      Same pattern: extract `const bodyStr = JSON.stringify(createOpenAICompatibleRequestBody({ model: input.model, request: input.request, ...(metadata !== undefined ? { metadata } : {}), stream: true }));`
      Call `assertNoPublicUrlEgress(input.request, input.id, bodyStr);` before `input.fetchImpl`.
      Use `bodyStr` in fetch call's body field.

    anthropic.ts execute (~533):
      `init` already has `body: JSON.stringify(messagesBody.body)`.
      Extract: `const bodyStr = JSON.stringify(messagesBody.body);`
      Replace `body: JSON.stringify(messagesBody.body)` with `body: bodyStr` in init.
      Call `assertNoPublicUrlEgress(request, id, bodyStr);` after init is built, before `fetchImpl`.
      `id` is the closure variable from the Anthropic adapter factory.

    anthropic.ts streamAnthropicResponse (~618):
      Extract: `const bodyStr = JSON.stringify(messagesBody.body);`
      Assign `body: bodyStr` in fetch call.
      Call `assertNoPublicUrlEgress(input.request, input.id, bodyStr);` before `input.fetchImpl`.

    gemini.ts execute (~505):
      `init` already has `body: JSON.stringify(requestBody)`.
      Extract: `const bodyStr = JSON.stringify(requestBody);`
      Replace init body field with `bodyStr`.
      Call `assertNoPublicUrlEgress(request, id, bodyStr);` before `fetchImpl`.
      `id` is the closure variable from the Gemini adapter factory.

    gemini.ts streamGeminiResponse (~597):
      Extract: `const bodyStr = JSON.stringify(requestBody);`
      Assign `body: bodyStr` in fetch call.
      Call `assertNoPublicUrlEgress(input.request, input.id, bodyStr);` before `input.fetchImpl`.

    Do NOT add the assertion to:
    - Model-listing / negotiation fetches (/models, fetchAndNegotiate)
    - Any non-run-request fetch (auth probes, health checks)

    STEP C — Verify RED→GREEN transition and run all parity tests.
    After wiring, run the parity test suite. Tests 1, 2, 3 must now pass (GREEN). Tests 4, 5, 6 must still pass.

    Commit: `feat(providers): wire assertNoPublicUrlEgress into all three adapter egress paths + parity tests`
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/lattice/dubai && npx tsc --noEmit -p packages/lattice/tsconfig.json && npx vitest run packages/lattice/src/providers/parity.test.ts</automated>
  </verify>
  <done>
    Typecheck clean. All existing parity tests (Tests A-E in adapters.test.ts) still pass. New Tests 1-3 are GREEN (were RED before wiring). Tests 4-6 GREEN. The "noPublicUrl defense-in-depth chokepoint parity" describe block shows 6 passing.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full CI mirror</name>
  <files>
    (no new files — validation only)
  </files>
  <action>
    Run the full CI gate in this sequence. Each step must be green before proceeding:

    1. Build: `npm run build -w packages/lattice`
    2. Typecheck: `npm run typecheck -w packages/lattice` (or `npx tsc --noEmit`)
    3. Tests: `npx vitest run --project lattice`
    4. Type tests: `npm run test:types -w packages/lattice` (if this script exists; skip if absent)
    5. Lint: `npm run lint:packages` (or the equivalent lint script for the workspace)
    6. Scripts audit: `node scripts/audit-exports.cjs` and any other scripts/ audit that exists

    Confirm:
    - Total test count increased (new unit tests in no-public-url.test.ts + 6 new parity tests in parity.test.ts)
    - No previously passing tests now fail
    - No new TypeScript errors
    - No lint errors

    No version bump, no changeset edits.

    Commit: `chore(ci): run full CI gate for noPublicUrl chokepoint`
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/lattice/dubai && npm run build -w packages/lattice && npx vitest run --project lattice 2>&1 | tail -20</automated>
  </verify>
  <done>
    Build succeeds, all tests pass (including the 8 unit tests and 6 new parity tests), typecheck clean, lint clean.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| caller → adapter.execute/executeStream | User-supplied artifacts and metadata cross into the serialized request body |
| serialized body → provider network | The body string is what leaves the process to the provider endpoint |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-inn-01 | Information Disclosure | artifact.metadata URL leakage | mitigate | assertNoPublicUrlEgress scans ALL string metadata values with isHttpUrl; mislabeled base64 metadata (REVIEW3 P2) blocked |
| T-inn-02 | Information Disclosure | gateway.metadata URL in scope | accept | Gateway metadata is not artifact-derived; explicitly out of scope by design (documented in JSDoc on assertNoPublicUrlEgress); chokepoint naturally excludes it because it never enters request.artifacts |
| T-inn-03 | Tampering | Adapter bypass (custom adapter) | accept | The chokepoint is per-adapter, not at the transport layer; custom adapters not using the first-party wiring remain unprotected — this is the same risk as all other first-party-only guards and is documented |
| T-inn-04 | Information Disclosure | False-negative when URL appears only in packaging plan metadata | mitigate | Substring scan of serializedBody catches any appearance of the URL string regardless of which JSON field it landed in |
</threat_model>

<verification>
Manual post-task verification checklist:

1. `assertNoPublicUrlEgress` is called exactly 6 times across the codebase (2 in adapters.ts, 2 in anthropic.ts, 2 in gemini.ts) — verify with: `grep -c "assertNoPublicUrlEgress" packages/lattice/src/providers/adapters.ts packages/lattice/src/providers/anthropic.ts packages/lattice/src/providers/gemini.ts`
2. Model-listing fetches are NOT wrapped — verify: no `assertNoPublicUrlEgress` calls in `fetchAndNegotiate` or `/models` handlers
3. `NoPublicUrlEgressError` is in the public exports — verify: `grep "NoPublicUrlEgressError" packages/lattice/src/index.ts`
4. Existing h31 Tests A-E in adapters.test.ts still pass (do NOT remove or weaken them)
5. The 5-test h31 parity block remains intact (it proved per-site gating; the new chokepoint is defense-in-depth layered on top)
</verification>

<success_criteria>
- `no-public-url.ts` exists with `NoPublicUrlEgressError` and `assertNoPublicUrlEgress` exported
- `NoPublicUrlEgressError` is exported from `packages/lattice/src/index.ts`
- All 6 adapter egress paths call the assertion before `fetchImpl`
- 8 new unit tests in `no-public-url.test.ts` all pass
- 6 new cross-adapter parity tests in `parity.test.ts` all pass (3 RED→GREEN for mislabeled-metadata, 3 GREEN-always for scope/positive/no-false-positive)
- All pre-existing tests still pass
- `npm run build` and typecheck clean
- No version bump, no changeset
</success_criteria>

<output>
No SUMMARY file needed for quick tasks. Return result to orchestrator directly.
</output>
