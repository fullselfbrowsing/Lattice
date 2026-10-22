import { assertType, expectTypeOf, test } from "vitest";
import { z } from "zod";

import {
  artifact,
  createAI,
  createLocalArtifactStore,
  createMemoryArtifactStore,
  inv,
  output,
  type ArtifactFingerprint,
  type ArtifactInput,
  type ArtifactLineage,
  type ArtifactOptions,
  type ArtifactParentRef,
  type ArtifactPrivacy,
  type ArtifactRef,
  type ArtifactSize,
  type ArtifactSource,
  type ArtifactStorageRef,
  type ArtifactStore,
  type ArtifactTransformDescriptor,
  type ArtifactTransformKind,
  type InvariantDeclaration,
  type MustCiteInvariant,
  type MustCiteOptions,
  type RunResult,
  type StorageLike,
  type StoredArtifactEnvelope,
} from "../src/index.js";

test("source public API infers named run outputs", async () => {
  const ai = createAI();
  const session = ai.session("support-case-1");
  expectTypeOf(session.id).toEqualTypeOf<string>();
  expectTypeOf(session.kind).toEqualTypeOf<"session-ref" | undefined>();

  const schema = z.object({
    kind: z.literal("refund"),
    reason: z.string(),
  });
  const result = await ai.run({
    task: "Resolve case",
    session,
    artifacts: [artifact.text("support case")],
    outputs: {
      answer: "text",
      action: schema,
      evidence: output.citations(),
      generated: output.artifacts(),
    },
  });

  assertType<
    RunResult<{
      answer: "text";
      action: typeof schema;
      evidence: ReturnType<typeof output.citations>;
      generated: ReturnType<typeof output.artifacts>;
    }>
  >(result);

  if (result.ok) {
    expectTypeOf(result.outputs.answer).toEqualTypeOf<string>();
    expectTypeOf(result.outputs.action).toEqualTypeOf<{
      kind: "refund";
      reason: string;
    }>();
  }
});

test("source public API exposes artifact lifecycle and store types", async () => {
  const privacy = "restricted" satisfies ArtifactPrivacy;
  const size = { bytes: 42, characters: 42 } satisfies ArtifactSize;
  const fingerprint = {
    algorithm: "sha256",
    value: "abc123",
  } satisfies ArtifactFingerprint;
  const storage = {
    storeId: "memory",
    key: "artifact:text:case",
  } satisfies ArtifactStorageRef;
  const source = "generated" satisfies ArtifactSource;
  const transformKind = "transcription" satisfies ArtifactTransformKind;
  const transform = {
    kind: transformKind,
    name: "fixture-transcript",
  } satisfies ArtifactTransformDescriptor;
  const options = {
    privacy,
    size,
    fingerprint,
    storage,
  } satisfies ArtifactOptions;

  const text = artifact.text("support case", options);
  const data = artifact.json({ action: "refund" });
  const image = artifact.image("package.png");
  const audio = artifact.audio("call.mp3");
  const document = artifact.document("manual.pdf");
  const link = artifact.url(new URL("https://example.com/manual"));
  const tool = artifact.toolResult(
    { approved: true },
    {
      toolName: "refundPolicyCheck",
      callId: "call_123",
    },
  );
  const transcript = artifact.derive({
    id: "artifact:text:transcript",
    kind: "text",
    source,
    value: "caller transcript",
    parents: [audio],
    transform,
  });

  assertType<ArtifactInput>(text);
  assertType<ArtifactInput>(data);
  assertType<ArtifactInput>(image);
  assertType<ArtifactInput>(document);
  assertType<ArtifactInput>(link);
  assertType<ArtifactInput>(tool);
  assertType<ArtifactInput>(transcript);
  assertType<ArtifactLineage | undefined>(transcript.lineage);
  assertType<ArtifactParentRef | undefined>(transcript.lineage?.parents[0]);

  const memoryStore = createMemoryArtifactStore();
  assertType<ArtifactStore>(memoryStore);
  assertType<StorageLike>(memoryStore);

  const ref = await memoryStore.put(text);
  const metadataOnly = await memoryStore.get(ref.id);
  const loaded = await memoryStore.load(ref.id);

  assertType<ArtifactRef>(ref);
  assertType<ArtifactRef | undefined>(metadataOnly);
  assertType<ArtifactInput | undefined>(loaded);

  const localStore = createLocalArtifactStore("/tmp/lattice-artifacts");
  assertType<ArtifactStore>(localStore);

  const envelope = {
    version: 1,
    ref,
  } satisfies StoredArtifactEnvelope;
  expectTypeOf(envelope.ref).toEqualTypeOf<ArtifactRef>();
});

test("source public API types the must-cite opt-in flags", () => {
  const options = {
    path: "result.refs",
    keys: ["artifactId"],
    caseInsensitive: true,
    inline: true,
    rejectUncited: true,
  } satisfies MustCiteOptions;
  const decl = inv.mustCite("policy-refund", options);
  expectTypeOf(decl).toEqualTypeOf<MustCiteInvariant>();
  expectTypeOf(decl.inline).toEqualTypeOf<boolean | undefined>();
  expectTypeOf(decl.rejectUncited).toEqualTypeOf<boolean | undefined>();
  assertType<InvariantDeclaration>(decl);
});
