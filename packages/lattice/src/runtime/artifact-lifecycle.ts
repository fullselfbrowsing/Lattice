import type {
  ArtifactInput,
  ArtifactRef,
} from "../artifacts/artifact.js";
import {
  isArtifactPrivacyAtLeast,
  mostRestrictiveArtifactPrivacy,
  toArtifactRef,
} from "../artifacts/artifact.js";
import type { PolicySpec } from "../policy/policy.js";
import type { PersistenceLifecycleKind } from "../results/errors.js";
import { fingerprintArtifactValue } from "../storage/fingerprint.js";
import type { ArtifactStore } from "../storage/storage.js";

export type ArtifactLifecycleKind = Exclude<
  PersistenceLifecycleKind,
  "session"
>;

export type ArtifactLifecycleSkipReason = "unconfigured" | "policy";

interface ArtifactLifecycleReportBase {
  readonly lifecycle: ArtifactLifecycleKind;
  readonly artifactId: string;
  readonly ref: ArtifactRef;
  readonly inputHash?: string;
}

export interface StoredArtifactLifecycleReport
  extends ArtifactLifecycleReportBase {
  readonly status: "stored";
}

export interface PreservedArtifactLifecycleReport
  extends ArtifactLifecycleReportBase {
  readonly status: "preserved";
}

export interface SkippedArtifactLifecycleReport
  extends ArtifactLifecycleReportBase {
  readonly status: "skipped";
  readonly reason: ArtifactLifecycleSkipReason;
}

export type ArtifactLifecycleReport =
  | StoredArtifactLifecycleReport
  | PreservedArtifactLifecycleReport
  | SkippedArtifactLifecycleReport;

export interface ArtifactLifecycleResult {
  readonly artifact: ArtifactInput;
  readonly report: ArtifactLifecycleReport;
}

export interface ArtifactLifecycleEntry {
  readonly artifact: ArtifactInput;
  readonly lifecycle: ArtifactLifecycleKind;
}

export interface PersistArtifactLifecycleOptions {
  readonly storage?: ArtifactStore;
  readonly policy?: PolicySpec;
  readonly postProvider?: boolean;
}

interface ArtifactLifecycleFailureInput {
  readonly message: string;
  readonly lifecycle: ArtifactLifecycleKind;
  readonly artifactId: string;
  readonly storeId?: string;
  readonly postProvider: boolean;
  readonly cause?: unknown;
}

export class ArtifactLifecycleFailure extends Error {
  readonly operation = "write" as const;
  readonly lifecycle: ArtifactLifecycleKind;
  readonly artifactId: string;
  readonly storeId?: string;
  readonly postProvider: boolean;

  constructor(input: ArtifactLifecycleFailureInput) {
    super(
      input.message,
      input.cause !== undefined ? { cause: input.cause } : undefined,
    );
    this.name = "ArtifactLifecycleFailure";
    this.lifecycle = input.lifecycle;
    this.artifactId = input.artifactId;
    this.postProvider = input.postProvider;
    if (input.storeId !== undefined) {
      this.storeId = input.storeId;
    }
  }
}

export async function persistArtifactLifecycle(
  entry: ArtifactLifecycleEntry,
  options: PersistArtifactLifecycleOptions = {},
): Promise<ArtifactLifecycleResult> {
  const { artifact, lifecycle } = entry;
  const effectivePrivacy = mostRestrictiveArtifactPrivacy(
    artifact.privacy,
    options.policy?.privacy ?? "standard",
  );
  const scopedArtifact: ArtifactInput = {
    ...artifact,
    privacy: effectivePrivacy,
  };

  if (options.storage === undefined) {
    return createLocalResult(scopedArtifact, lifecycle, "unconfigured");
  }

  const retention = options.policy?.retention ?? "session";

  if (retention === "none") {
    return createLocalResult(scopedArtifact, lifecycle, "policy");
  }

  if (artifact.value === undefined && artifact.storage !== undefined) {
    const ref = toArtifactRef(artifact);
    validateReferenceScope(ref, {
      artifact: scopedArtifact,
      lifecycle,
      storage: options.storage,
      ...(options.policy !== undefined ? { policy: options.policy } : {}),
      retention,
      postProvider: options.postProvider ?? false,
    });

    return {
      artifact,
      report: {
        status: "preserved",
        lifecycle,
        artifactId: artifact.id,
        ref,
        ...(ref.fingerprint?.value !== undefined
          ? { inputHash: ref.fingerprint.value }
          : {}),
      },
    };
  }

  const storageHint = {
    storeId: options.storage.id,
    key: artifact.id,
    ...(options.policy?.tenantId !== undefined
      ? { tenantId: options.policy.tenantId }
      : {}),
    retention,
  };
  const artifactForStorage: ArtifactInput = {
    ...scopedArtifact,
    storage: storageHint,
  };
  let ref: ArtifactRef;

  try {
    ref = await options.storage.put(artifactForStorage);
  } catch (cause) {
    throw lifecycleFailure({
      message: "Artifact lifecycle write failed.",
      lifecycle,
      artifactId: artifact.id,
      storeId: options.storage.id,
      postProvider: options.postProvider ?? false,
      cause,
    });
  }

  validateReturnedReference(ref, {
    artifact: artifactForStorage,
    lifecycle,
    storage: options.storage,
    ...(options.policy !== undefined ? { policy: options.policy } : {}),
    retention,
    postProvider: options.postProvider ?? false,
  });

  const inputHash =
    ref.fingerprint?.value ??
    artifact.fingerprint?.value ??
    (await fingerprintArtifactValue(artifact.value))?.value;
  const preparedArtifact: ArtifactInput = {
    ...ref,
    ...(artifact.value !== undefined ? { value: artifact.value } : {}),
  };

  return {
    artifact: preparedArtifact,
    report: {
      status: "stored",
      lifecycle,
      artifactId: artifact.id,
      ref,
      ...(inputHash !== undefined ? { inputHash } : {}),
    },
  };
}

export async function persistArtifactLifecycleBatch(
  entries: readonly ArtifactLifecycleEntry[],
  options: PersistArtifactLifecycleOptions = {},
): Promise<readonly ArtifactLifecycleResult[]> {
  const results: ArtifactLifecycleResult[] = [];

  for (const entry of entries) {
    results.push(await persistArtifactLifecycle(entry, options));
  }

  return results;
}

async function createLocalResult(
  artifact: ArtifactInput,
  lifecycle: ArtifactLifecycleKind,
  reason: ArtifactLifecycleSkipReason,
): Promise<ArtifactLifecycleResult> {
  const fingerprint =
    artifact.fingerprint ?? await fingerprintArtifactValue(artifact.value);
  const preparedArtifact: ArtifactInput = {
    ...artifact,
    ...(fingerprint !== undefined ? { fingerprint } : {}),
  };
  const ref = toArtifactRef(preparedArtifact);

  return {
    artifact: preparedArtifact,
    report: {
      status: "skipped",
      reason,
      lifecycle,
      artifactId: artifact.id,
      ref,
      ...(fingerprint?.value !== undefined
        ? { inputHash: fingerprint.value }
        : {}),
    },
  };
}

interface ReferenceValidationInput {
  readonly artifact: ArtifactInput;
  readonly lifecycle: ArtifactLifecycleKind;
  readonly storage: ArtifactStore;
  readonly policy?: PolicySpec;
  readonly retention: "session" | "durable";
  readonly postProvider: boolean;
}

function validateReturnedReference(
  ref: ArtifactRef,
  input: ReferenceValidationInput,
): void {
  if ("value" in ref) {
    throw lifecycleFailureFor(input, "Artifact store returned a payload-bearing reference.");
  }

  if (ref.id !== input.artifact.id) {
    throw lifecycleFailureFor(input, "Artifact store returned a mismatched artifact reference.");
  }

  validateReferenceScope(ref, input);
}

function validateReferenceScope(
  ref: ArtifactRef,
  input: ReferenceValidationInput,
): void {
  if (ref.storage?.storeId !== input.storage.id) {
    throw lifecycleFailureFor(input, "Artifact reference does not match the configured store.");
  }

  if (ref.storage.tenantId !== input.policy?.tenantId) {
    throw lifecycleFailureFor(input, "Artifact reference tenant scope is incompatible.");
  }

  const returnedRetention = ref.storage.retention ?? "session";
  if (returnedRetention !== input.retention) {
    throw lifecycleFailureFor(input, "Artifact reference retention scope is incompatible.");
  }

  if (!isArtifactPrivacyAtLeast(ref.privacy, input.artifact.privacy)) {
    throw lifecycleFailureFor(input, "Artifact reference privacy is incompatible.");
  }
}

function lifecycleFailureFor(
  input: ReferenceValidationInput,
  message: string,
): ArtifactLifecycleFailure {
  return lifecycleFailure({
    message,
    lifecycle: input.lifecycle,
    artifactId: input.artifact.id,
    storeId: input.storage.id,
    postProvider: input.postProvider,
  });
}

function lifecycleFailure(
  input: ArtifactLifecycleFailureInput,
): ArtifactLifecycleFailure {
  return new ArtifactLifecycleFailure(input);
}
