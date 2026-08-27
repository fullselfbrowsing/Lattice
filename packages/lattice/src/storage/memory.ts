import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import { toArtifactRef } from "../artifacts/artifact.js";
import { fingerprintArtifactValue } from "./fingerprint.js";
import type { ArtifactStore } from "./storage.js";

export interface MemoryArtifactStoreOptions {
  readonly id?: string;
}

interface MemoryArtifactRecord {
  readonly ref: ArtifactRef;
  readonly artifact: ArtifactInput;
}

export function createMemoryArtifactStore(
  options: MemoryArtifactStoreOptions = {},
): ArtifactStore {
  const storeId = options.id ?? "memory";
  const artifacts = new Map<string, MemoryArtifactRecord>();

  return {
    kind: "artifact-store",
    id: storeId,

    async put(artifact) {
      const fingerprint =
        artifact.fingerprint ?? await fingerprintArtifactValue(artifact.value);
      const storedArtifact: ArtifactInput = {
        ...cloneArtifactInput(artifact),
        storage: {
          storeId,
          key: artifact.id,
          ...(artifact.storage?.tenantId !== undefined
            ? { tenantId: artifact.storage.tenantId }
            : {}),
          ...(artifact.storage?.retention !== undefined
            ? { retention: artifact.storage.retention }
            : {}),
        },
        ...(fingerprint !== undefined ? { fingerprint } : {}),
      };
      const ref = toArtifactRef(storedArtifact);

      artifacts.set(artifact.id, {
        ref: cloneArtifactRef(ref),
        artifact: cloneArtifactInput(storedArtifact),
      });

      return cloneArtifactRef(ref);
    },

    async get(id) {
      const record = artifacts.get(id);

      return record === undefined ? undefined : cloneArtifactRef(record.ref);
    },

    async load(id) {
      const record = artifacts.get(id);

      return record === undefined ? undefined : cloneArtifactInput(record.artifact);
    },

    async has(id) {
      return artifacts.has(id);
    },

    async delete(id) {
      return artifacts.delete(id);
    },

    async list() {
      return Array.from(artifacts.values(), (record) =>
        cloneArtifactRef(record.ref),
      );
    },
  };
}

function cloneArtifactInput(artifact: ArtifactInput): ArtifactInput {
  return cloneValue(artifact);
}

function cloneArtifactRef(ref: ArtifactRef): ArtifactRef {
  return cloneValue(ref);
}

function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}
