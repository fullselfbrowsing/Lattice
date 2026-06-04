import { expectType } from "tsd";
import { z } from "zod";

import {
  artifact,
  createAI,
  createLocalArtifactStore,
  createMemoryArtifactStore,
  output,
} from "@fullselfbrowsing/lattice";
import type {
  ArtifactFingerprint,
  ArtifactInput,
  ArtifactLineage,
  ArtifactPrivacy,
  ArtifactRef,
  ArtifactSize,
  ArtifactStorageRef,
  ArtifactStore,
  ArtifactTransformDescriptor,
  RunSuccess,
  SessionRef,
  StorageLike,
  StoredArtifactEnvelope,
} from "@fullselfbrowsing/lattice";

const schema = z.object({
  kind: z.literal("refund"),
  reason: z.string(),
});

async function verifyPackageTypes(): Promise<void> {
  const ai = createAI();
  const session = ai.session("support-case-1");
  expectType<SessionRef>(session);

  const privacy = "sensitive" satisfies ArtifactPrivacy;
  const size = { bytes: 512 } satisfies ArtifactSize;
  const fingerprint = {
    algorithm: "sha256",
    value: "abc123",
  } satisfies ArtifactFingerprint;
  const storage = {
    storeId: "memory",
    key: "artifact:document:manual",
  } satisfies ArtifactStorageRef;

  const document = artifact.document("manual.pdf", {
    id: "artifact:document:manual",
    privacy,
    size,
    fingerprint,
    storage,
  });
  const tool = artifact.toolResult(
    { status: "ok" },
    {
      id: "artifact:tool-result:refund",
      toolName: "refundPolicyCheck",
    },
  );
  const transcript = artifact.derive({
    id: "artifact:text:transcript",
    kind: "text",
    value: "call transcript",
    parents: [document],
    transform: {
      kind: "transcription",
      name: "fixture-transcript",
    } satisfies ArtifactTransformDescriptor,
  });
  expectType<ArtifactInput>(document);
  expectType<ArtifactInput>(tool);
  expectType<ArtifactInput>(transcript);
  expectType<ArtifactLineage | undefined>(transcript.lineage);

  const memoryStore = createMemoryArtifactStore();
  expectType<ArtifactStore>(memoryStore);
  expectType<StorageLike>(memoryStore);

  const ref = await memoryStore.put(document);
  const metadataOnly = await memoryStore.get(ref.id);
  const loaded = await memoryStore.load(ref.id);
  expectType<ArtifactRef>(ref);
  expectType<ArtifactRef | undefined>(metadataOnly);
  expectType<ArtifactInput | undefined>(loaded);

  const localStore = createLocalArtifactStore("/tmp/lattice-artifacts");
  expectType<ArtifactStore>(localStore);

  const envelope: StoredArtifactEnvelope = {
    version: 1,
    ref,
  };
  expectType<StoredArtifactEnvelope>(envelope);

  const result = await ai.run({
    task: "Resolve case",
    session,
    artifacts: [document, tool, transcript],
    outputs: {
      answer: "text",
      action: schema,
      evidence: output.citations(),
      generated: output.artifacts({ artifactKind: "text" }),
    },
  });

  if (result.ok) {
    expectType<RunSuccess<{
      answer: "text";
      action: typeof schema;
      evidence: ReturnType<typeof output.citations>;
      generated: ReturnType<typeof output.artifacts>;
    }>>(result);
    expectType<string>(result.outputs.answer);
    expectType<string>(result.outputs.action.reason);
    expectType<readonly ArtifactRef[]>(result.outputs.generated);
  }
}

void verifyPackageTypes;
