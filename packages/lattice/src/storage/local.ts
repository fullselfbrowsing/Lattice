import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import { toArtifactRef } from "../artifacts/artifact.js";
import { fingerprintArtifactValue } from "./fingerprint.js";
import type {
  ArtifactStore,
  StoredArtifactEnvelope,
  StoredArtifactPayloadDescriptor,
} from "./storage.js";

export interface LocalArtifactStoreOptions {
  readonly id?: string;
}

export function createLocalArtifactStore(
  rootDir: string | URL,
  options: LocalArtifactStoreOptions = {},
): ArtifactStore {
  const rootPath = rootDir instanceof URL ? fileURLToPath(rootDir) : rootDir;
  const storeId = options.id ?? "local";

  return {
    kind: "artifact-store",
    id: storeId,

    async put(artifact: ArtifactInput): Promise<ArtifactRef> {
      const artifactDir = artifactDirectory(rootPath, artifact.id);
      const fingerprint =
        artifact.fingerprint ?? await fingerprintArtifactValue(artifact.value);
      const storedArtifact: ArtifactInput = {
        ...artifact,
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

      await rm(artifactDir, { recursive: true, force: true });
      await mkdir(artifactDir, { recursive: true });

      const payload = await writePayload(artifactDir, artifact.value);
      const envelope: StoredArtifactEnvelope = {
        version: 1,
        ref,
        ...(payload !== undefined ? { payload } : {}),
      };

      await writeFile(
        metadataPath(rootPath, artifact.id),
        `${JSON.stringify(envelope, null, 2)}\n`,
        "utf8",
      );

      return ref;
    },

    async get(id: string): Promise<ArtifactRef | undefined> {
      const envelope = await readEnvelope(rootPath, id);

      return envelope?.ref;
    },

    async load(id: string): Promise<ArtifactInput | undefined> {
      const envelope = await readEnvelope(rootPath, id);

      if (envelope === undefined) {
        return undefined;
      }

      if (envelope.payload === undefined) {
        return envelope.ref;
      }

      const value = await readPayload(artifactDirectory(rootPath, id), envelope.payload);

      return {
        ...envelope.ref,
        value,
      };
    },

    async has(id: string): Promise<boolean> {
      try {
        await stat(metadataPath(rootPath, id));

        return true;
      } catch (error) {
        if (isNotFoundError(error)) {
          return false;
        }

        throw error;
      }
    },

    async delete(id: string): Promise<boolean> {
      const exists = await this.has(id);

      if (!exists) {
        return false;
      }

      await rm(artifactDirectory(rootPath, id), { recursive: true, force: true });

      return true;
    },

    async list(): Promise<readonly ArtifactRef[]> {
      const artifactsPath = join(rootPath, "artifacts");
      let entries: readonly { isDirectory(): boolean; name: string }[];

      try {
        entries = await readdir(artifactsPath, { withFileTypes: true });
      } catch (error) {
        if (isNotFoundError(error)) {
          return [];
        }

        throw error;
      }

      const refs = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const envelope = await readEnvelopeByDirectory(
              join(artifactsPath, entry.name),
            );

            return envelope.ref;
          }),
      );

      return refs.sort((left, right) => left.id.localeCompare(right.id));
    },
  };
}

async function writePayload(
  artifactDir: string,
  value: unknown,
): Promise<StoredArtifactPayloadDescriptor | undefined> {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer || isBlobLike(value)) {
    await writeFile(join(artifactDir, "payload.bin"), await toBinaryPayload(value));

    return {
      kind: "binary",
      path: "payload.bin",
    };
  }

  const serialized = JSON.stringify(value, null, 2);

  if (serialized === undefined) {
    return undefined;
  }

  await writeFile(join(artifactDir, "payload.json"), `${serialized}\n`, "utf8");

  return {
    kind: "json",
    path: "payload.json",
  };
}

async function readPayload(
  artifactDir: string,
  payload: StoredArtifactPayloadDescriptor,
): Promise<unknown> {
  const payloadPath = join(artifactDir, payload.path);

  if (payload.kind === "binary") {
    const bytes = await readFile(payloadPath);

    return new Uint8Array(bytes);
  }

  return JSON.parse(await readFile(payloadPath, "utf8"));
}

async function readEnvelope(
  rootPath: string,
  id: string,
): Promise<StoredArtifactEnvelope | undefined> {
  try {
    return JSON.parse(await readFile(metadataPath(rootPath, id), "utf8"));
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function readEnvelopeByDirectory(
  artifactDir: string,
): Promise<StoredArtifactEnvelope> {
  return JSON.parse(await readFile(join(artifactDir, "metadata.json"), "utf8"));
}

async function toBinaryPayload(
  value: Blob | ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new Uint8Array(await value.arrayBuffer());
}

function artifactDirectory(rootPath: string, id: string): string {
  return join(rootPath, "artifacts", encodeURIComponent(id));
}

function metadataPath(rootPath: string, id: string): string {
  return join(artifactDirectory(rootPath, id), "metadata.json");
}

function isBlobLike(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
