import type {
  ArtifactInput,
  ArtifactPrivacy,
  ArtifactRef,
} from "../artifacts/artifact.js";
import {
  artifact,
  isArtifactPrivacyAtLeast,
  mostRestrictiveArtifactPrivacy,
  toArtifactRef,
} from "../artifacts/artifact.js";
import type { ContextProjectionPlan, SelectedRoute } from "../plan/plan.js";
import type { PolicySpec } from "../policy/policy.js";
import type { ContextMaterializationFailureReason } from "../results/errors.js";
import type { ArtifactLifecycleReport } from "../runtime/artifact-lifecycle.js";
import { persistArtifactLifecycle } from "../runtime/artifact-lifecycle.js";
import type {
  SessionRecord,
  SessionTurn,
} from "../sessions/session.js";
import { fingerprintArtifactValue } from "../storage/fingerprint.js";
import type { ArtifactStore } from "../storage/storage.js";
import type {
  ContextPack,
  ContextSummarizer,
} from "./context-pack.js";

export interface MaterializeContextInput {
  readonly contextPack: ContextPack;
  readonly route: SelectedRoute;
  readonly artifacts: readonly ArtifactInput[];
  readonly policy?: PolicySpec;
  readonly session?: SessionRecord;
  readonly storage?: ArtifactStore;
  readonly summarizer?: ContextSummarizer;
}

export interface MaterializedContext {
  readonly id: string;
  readonly route: {
    readonly providerId: string;
    readonly modelId: string;
  };
  readonly contextPack: ContextPack;
  readonly artifacts: readonly ArtifactInput[];
  readonly artifactRefs: readonly ArtifactRef[];
  readonly summaryArtifactRefs: readonly ArtifactRef[];
  readonly inputHashes: readonly string[];
  readonly omittedArtifactIds: readonly string[];
  readonly warnings: readonly string[];
  readonly summaryLifecycleReports: readonly ArtifactLifecycleReport[];
}

interface ContextMaterializationFailureInput {
  readonly message: string;
  readonly reason: ContextMaterializationFailureReason;
  readonly artifactId?: string;
  readonly sessionId?: string;
  readonly storeId?: string;
  readonly cause?: unknown;
}

export class ContextMaterializationFailure extends Error {
  readonly reason: ContextMaterializationFailureReason;
  readonly artifactId?: string;
  readonly sessionId?: string;
  readonly storeId?: string;

  constructor(input: ContextMaterializationFailureInput) {
    super(
      input.message,
      input.cause !== undefined ? { cause: input.cause } : undefined,
    );
    this.name = "ContextMaterializationFailure";
    this.reason = input.reason;
    if (input.artifactId !== undefined) {
      this.artifactId = input.artifactId;
    }
    if (input.sessionId !== undefined) {
      this.sessionId = input.sessionId;
    }
    if (input.storeId !== undefined) {
      this.storeId = input.storeId;
    }
  }
}

interface ConcreteIdentity {
  readonly fingerprint?: string;
  readonly valueHash: string;
}

interface MaterializationState {
  readonly input: MaterializeContextInput;
  readonly currentArtifacts: ReadonlyMap<string, ArtifactInput>;
  readonly sessionSummaries: ReadonlyMap<string, ArtifactRef>;
  readonly sessionTurns: ReadonlyMap<string, SessionTurn>;
  readonly artifacts: ArtifactInput[];
  readonly inputHashes: string[];
  readonly identities: Map<string, ConcreteIdentity>;
  readonly warnings: string[];
}

export async function materializeContext(
  input: MaterializeContextInput,
): Promise<MaterializedContext> {
  if (input.session !== undefined) {
    validateContextSessionScope(input.session, input.policy);
  }

  const state: MaterializationState = {
    input,
    currentArtifacts: await indexCurrentArtifacts(input.artifacts),
    sessionSummaries: indexSessionSummaries(input.session),
    sessionTurns: indexSessionTurns(input.session),
    artifacts: [],
    inputHashes: [],
    identities: new Map(),
    warnings: [],
  };
  const included = [];
  const summarized = [];
  const omitted = [...input.contextPack.omitted];

  for (const item of input.contextPack.included) {
    const resolved = await resolveIncludedItem(item, state);

    if (resolved === undefined) {
      omitted.push({
        ...item,
        reason: "Selected context item omitted because a stored value was unavailable.",
      });
      continue;
    }

    for (const resolvedArtifact of resolved) {
      await addConcreteArtifact(resolvedArtifact, state);
    }
    included.push(item);
  }

  const summaryLifecycleReports: ArtifactLifecycleReport[] = [];
  const summaryArtifactRefs: ArtifactRef[] = [];

  if (input.summarizer === undefined) {
    for (const item of input.contextPack.summarized) {
      omitted.push({
        ...item,
        reason: "Artifact omitted because no context summarizer is configured.",
      });
      state.warnings.push(
        `Artifact ${item.artifactId ?? "unknown"} omitted because no context summarizer is configured.`,
      );
    }
  } else {
    const summarySources: ArtifactInput[] = [];
    const summaryItems = [];

    for (const item of input.contextPack.summarized) {
      const source = await resolveSummarySource(item.artifactId, state);

      if (source === undefined) {
        omitted.push({
          ...item,
          reason: "Summary source omitted because its stored value was unavailable.",
        });
        continue;
      }

      summarySources.push(source);
      summaryItems.push(item);
    }

    if (summarySources.length > 0) {
      const summaryBudgetTokens = summaryItems.reduce(
        (total, item) => total + item.estimatedTokens,
        0,
      );
      let outputs: readonly (ArtifactInput | ArtifactRef)[];

      try {
        outputs = await input.summarizer.summarize({
          artifacts: summarySources,
          budgetTokens: summaryBudgetTokens,
        });
      } catch (cause) {
        throw failure({
          message: "Context summarizer failed.",
          reason: "summary-failed",
          cause,
        });
      }

      if (outputs.length === 0) {
        throw failure({
          message: "Context summarizer returned no artifacts.",
          reason: "summary-failed",
        });
      }

      const sourcePrivacy = mostRestrictiveArtifactPrivacy(
        ...summarySources.map((source) => source.privacy),
        input.policy?.privacy ?? "standard",
      );
      const sourceRefs = summarySources.map(toArtifactRef);
      const sourceArtifactIds = sourceRefs.map((ref) => ref.id);

      for (const output of outputs) {
        let concreteOutput: ArtifactInput | undefined;

        try {
          concreteOutput = await resolveConcreteArtifact(
            output,
            state,
            sourcePrivacy,
          );
        } catch (cause) {
          throw failure({
            message: "Context summary artifact could not be resolved.",
            reason: "summary-failed",
            artifactId: output.id,
            cause,
          });
        }

        if (concreteOutput === undefined) {
          throw failure({
            message: "Context summary artifact could not be resolved.",
            reason: "summary-failed",
            artifactId: output.id,
          });
        }

        const normalized: ArtifactInput = {
          ...concreteOutput,
          source: "generated",
          privacy: sourcePrivacy,
          metadata: {
            ...concreteOutput.metadata,
            trust: "model-summary",
            sourceArtifactIds,
          },
          lineage: {
            parents: sourceRefs,
            transform: {
              kind: "generated",
              name: "context-summary",
              metadata: { sourceArtifactIds },
            },
          },
        };
        const lifecycle = await persistArtifactLifecycle(
          { artifact: normalized, lifecycle: "summary" },
          {
            ...(input.storage !== undefined ? { storage: input.storage } : {}),
            ...(input.policy !== undefined ? { policy: input.policy } : {}),
          },
        );

        await addConcreteArtifact(lifecycle.artifact, state);
        summaryLifecycleReports.push(lifecycle.report);
        summaryArtifactRefs.push(lifecycle.report.ref);
      }

      const summaryArtifactIds = summaryArtifactRefs.map((ref) => ref.id);
      for (const item of summaryItems) {
        summarized.push({ ...item, summaryArtifactIds });
      }
    }
  }

  const warnings = [...input.contextPack.warnings, ...state.warnings];
  const contextPack: ContextPack = {
    ...input.contextPack,
    included,
    summarized,
    omitted,
    warnings,
  };
  const artifactRefs = state.artifacts.map(toArtifactRef);
  const id = await createProjectionId(
    input.route,
    artifactRefs,
    state.inputHashes,
  );
  const omittedArtifactIds = stableUnique(
    omitted.flatMap((item) => [
      ...(item.artifactId !== undefined ? [item.artifactId] : []),
      ...(item.artifactIds ?? []),
    ]),
  );

  return {
    id,
    route: {
      providerId: input.route.providerId,
      modelId: input.route.modelId,
    },
    contextPack,
    artifacts: state.artifacts,
    artifactRefs,
    summaryArtifactRefs,
    inputHashes: state.inputHashes,
    omittedArtifactIds,
    warnings,
    summaryLifecycleReports,
  };
}

export function toContextProjectionPlan(
  materialized: MaterializedContext,
): ContextProjectionPlan {
  return {
    id: materialized.id,
    providerId: materialized.route.providerId,
    modelId: materialized.route.modelId,
    artifactRefs: materialized.artifactRefs,
    summaryArtifactRefs: materialized.summaryArtifactRefs,
    inputHashes: materialized.inputHashes,
    omittedArtifactIds: materialized.omittedArtifactIds,
    warnings: materialized.warnings,
  };
}

async function resolveIncludedItem(
  item: ContextPack["included"][number],
  state: MaterializationState,
): Promise<readonly ArtifactInput[] | undefined> {
  const resolved: ArtifactInput[] = [];

  if (item.artifactId !== undefined) {
    const candidate =
      state.currentArtifacts.get(item.artifactId) ??
      state.sessionSummaries.get(item.artifactId);

    if (candidate === undefined) {
      return unavailableArtifact(item.artifactId, state);
    }

    const concrete = await resolveConcreteArtifact(candidate, state);
    if (concrete === undefined) {
      return undefined;
    }
    resolved.push(concrete);
  }

  if (item.sessionTurnId !== undefined) {
    const turn = state.sessionTurns.get(item.sessionTurnId);

    if (turn === undefined) {
      return unavailableArtifact(item.sessionTurnId, state);
    }

    validateTurnScope(turn, state.input.session, state.input.policy);
    const refs = indexTurnRefs(turn);
    const turnArtifacts: ArtifactInput[] = [
      createSessionTurnArtifact(turn, state.input.session, state.input.policy),
    ];

    for (const artifactId of item.artifactIds ?? []) {
      const ref = refs.get(artifactId);

      if (ref === undefined) {
        return unavailableArtifact(artifactId, state);
      }

      const concrete = await resolveConcreteArtifact(ref, state);
      if (concrete === undefined) {
        return undefined;
      }
      turnArtifacts.push(concrete);
    }

    resolved.push(...turnArtifacts);
  }

  if (resolved.length === 0) {
    throw failure({
      message: "Context pack contains an unresolvable included item.",
      reason: "missing-reference",
    });
  }

  return resolved;
}

async function resolveSummarySource(
  artifactId: string | undefined,
  state: MaterializationState,
): Promise<ArtifactInput | undefined> {
  if (artifactId === undefined) {
    throw failure({
      message: "Context summary source is missing an artifact identifier.",
      reason: "summary-failed",
    });
  }

  const source = state.currentArtifacts.get(artifactId);
  if (source === undefined) {
    return unavailableArtifact(artifactId, state);
  }

  return resolveConcreteArtifact(source, state);
}

async function resolveConcreteArtifact(
  candidate: ArtifactInput | ArtifactRef,
  state: MaterializationState,
  requiredPrivacy: ArtifactPrivacy = state.input.policy?.privacy ?? "standard",
): Promise<ArtifactInput | undefined> {
  if (candidate.value !== undefined) {
    return {
      ...candidate,
      privacy: mostRestrictiveArtifactPrivacy(
        candidate.privacy,
        requiredPrivacy,
      ),
    };
  }

  const storage = state.input.storage;
  const storageRef = candidate.storage;

  if (storage === undefined || storageRef === undefined) {
    return unavailableArtifact(candidate.id, state);
  }

  validateRefScope(candidate, storage, state.input.policy, requiredPrivacy);
  let loaded: ArtifactInput | undefined;

  try {
    loaded = await storage.load(storageRef.key || candidate.id);
  } catch (cause) {
    if (state.input.policy?.missingArtifactRef === "omit") {
      state.warnings.push(
        `Artifact ${candidate.id} omitted because its stored value is unavailable.`,
      );
      return undefined;
    }

    throw failure({
      message: "Selected artifact reference load failed.",
      reason: "load-failed",
      artifactId: candidate.id,
      storeId: storage.id,
      cause,
    });
  }

  if (loaded === undefined || loaded.value === undefined) {
    return unavailableArtifact(candidate.id, state);
  }

  validateLoadedArtifact(candidate, loaded, storage, state.input.policy, requiredPrivacy);

  return {
    ...candidate,
    privacy: mostRestrictiveArtifactPrivacy(
      candidate.privacy,
      requiredPrivacy,
    ),
    value: loaded.value,
  };
}

function unavailableArtifact(
  artifactId: string,
  state: MaterializationState,
): undefined {
  if (state.input.policy?.missingArtifactRef === "omit") {
    state.warnings.push(
      `Artifact ${artifactId} omitted because its stored value is unavailable.`,
    );
    return undefined;
  }

  throw failure({
    message: "Selected artifact reference is unavailable.",
    reason: "missing-reference",
    artifactId,
    ...(state.input.storage !== undefined
      ? { storeId: state.input.storage.id }
      : {}),
  });
}

export function validateContextSessionScope(
  session: SessionRecord,
  policy: PolicySpec | undefined,
): void {
  if (session.tenantId !== policy?.tenantId) {
    throw policyFailure("Session tenant scope is incompatible.", {
      sessionId: session.id,
    });
  }

  if (
    !isArtifactPrivacyAtLeast(
      session.privacy ?? "standard",
      policy?.privacy ?? "standard",
    )
  ) {
    throw policyFailure("Session privacy scope is incompatible.", {
      sessionId: session.id,
    });
  }

  if ((session.retention ?? "session") !== (policy?.retention ?? "session")) {
    throw policyFailure("Session retention scope is incompatible.", {
      sessionId: session.id,
    });
  }
}

function validateTurnScope(
  turn: SessionTurn,
  session: SessionRecord | undefined,
  policy: PolicySpec | undefined,
): void {
  const sessionId = session?.id;

  if (turn.tenantId !== policy?.tenantId) {
    throw policyFailure("Session turn tenant scope is incompatible.", {
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
  }

  if (
    !isArtifactPrivacyAtLeast(
      turn.privacy ?? session?.privacy ?? "standard",
      policy?.privacy ?? "standard",
    )
  ) {
    throw policyFailure("Session turn privacy scope is incompatible.", {
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
  }

  if (
    (turn.retention ?? session?.retention ?? "session") !==
    (policy?.retention ?? "session")
  ) {
    throw policyFailure("Session turn retention scope is incompatible.", {
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
  }
}

function validateRefScope(
  ref: ArtifactRef,
  storage: ArtifactStore,
  policy: PolicySpec | undefined,
  requiredPrivacy: ArtifactPrivacy,
): void {
  const retention = policy?.retention ?? "session";

  if (retention === "none") {
    throw policyFailure("Artifact retention policy forbids rehydration.", {
      artifactId: ref.id,
      storeId: storage.id,
    });
  }

  if (ref.storage?.storeId !== storage.id) {
    throw policyFailure("Artifact reference store scope is incompatible.", {
      artifactId: ref.id,
      storeId: storage.id,
    });
  }

  if (ref.storage.tenantId !== policy?.tenantId) {
    throw policyFailure("Artifact reference tenant scope is incompatible.", {
      artifactId: ref.id,
      storeId: storage.id,
    });
  }

  if ((ref.storage.retention ?? "session") !== retention) {
    throw policyFailure("Artifact reference retention scope is incompatible.", {
      artifactId: ref.id,
      storeId: storage.id,
    });
  }

  if (!isArtifactPrivacyAtLeast(ref.privacy, requiredPrivacy)) {
    throw policyFailure("Artifact reference privacy is incompatible.", {
      artifactId: ref.id,
      storeId: storage.id,
    });
  }
}

function validateLoadedArtifact(
  requested: ArtifactRef,
  loaded: ArtifactInput,
  storage: ArtifactStore,
  policy: PolicySpec | undefined,
  requiredPrivacy: ArtifactPrivacy,
): void {
  if (loaded.id !== requested.id) {
    throw failure({
      message: "Artifact store loaded a mismatched artifact.",
      reason: "load-failed",
      artifactId: requested.id,
      storeId: storage.id,
    });
  }

  validateRefScope(loaded, storage, policy, requiredPrivacy);

  if (
    requested.fingerprint !== undefined &&
    loaded.fingerprint !== undefined &&
    requested.fingerprint.value !== loaded.fingerprint.value
  ) {
    throw failure({
      message: "Artifact store loaded conflicting fingerprint evidence.",
      reason: "load-failed",
      artifactId: requested.id,
      storeId: storage.id,
    });
  }
}

function policyFailure(
  message: string,
  details: {
    readonly artifactId?: string;
    readonly sessionId?: string;
    readonly storeId?: string;
  },
): ContextMaterializationFailure {
  return failure({
    message,
    reason: "policy-denied",
    ...details,
  });
}

async function indexCurrentArtifacts(
  artifacts: readonly ArtifactInput[],
): Promise<ReadonlyMap<string, ArtifactInput>> {
  const index = new Map<string, ArtifactInput>();
  const identities = new Map<string, ConcreteIdentity>();

  for (const current of artifacts) {
    const existing = index.get(current.id);
    if (existing === undefined) {
      index.set(current.id, current);
      if (current.value !== undefined) {
        identities.set(current.id, await concreteIdentity(current));
      }
      continue;
    }

    if (existing === current) {
      continue;
    }

    const existingIdentity = identities.get(current.id);
    const currentIdentity =
      current.value === undefined ? undefined : await concreteIdentity(current);

    if (!duplicatesCompatible(
      existing,
      current,
      existingIdentity,
      currentIdentity,
    )) {
      throw failure({
        message: "Duplicate artifact identifiers contain conflicting evidence.",
        reason: "load-failed",
        artifactId: current.id,
      });
    }

    if (existingIdentity === undefined && currentIdentity !== undefined) {
      identities.set(current.id, currentIdentity);
    }
  }

  return index;
}

function indexSessionSummaries(
  session: SessionRecord | undefined,
): ReadonlyMap<string, ArtifactRef> {
  const index = new Map<string, ArtifactRef>();

  for (const summary of session?.summaries ?? []) {
    const ref = summary.artifactRef;
    const existing = index.get(ref.id);

    if (existing === undefined) {
      index.set(ref.id, ref);
      continue;
    }

    if (JSON.stringify(toArtifactRef(existing)) !== JSON.stringify(toArtifactRef(ref))) {
      throw failure({
        message: "Session summaries contain conflicting artifact references.",
        reason: "load-failed",
        artifactId: ref.id,
        ...(session !== undefined ? { sessionId: session.id } : {}),
      });
    }
  }

  return index;
}

function indexSessionTurns(
  session: SessionRecord | undefined,
): ReadonlyMap<string, SessionTurn> {
  const index = new Map<string, SessionTurn>();

  for (const turn of session?.turns ?? []) {
    const existing = index.get(turn.id);

    if (existing === undefined) {
      index.set(turn.id, turn);
      continue;
    }

    if (JSON.stringify(existing) !== JSON.stringify(turn)) {
      throw failure({
        message: "Session history contains conflicting turn identifiers.",
        reason: "load-failed",
        ...(session !== undefined ? { sessionId: session.id } : {}),
      });
    }
  }

  return index;
}

async function addConcreteArtifact(
  candidate: ArtifactInput,
  state: MaterializationState,
): Promise<void> {
  if (candidate.value === undefined) {
    throw failure({
      message: "Provider-visible artifact is not concrete.",
      reason: "missing-reference",
      artifactId: candidate.id,
    });
  }

  const identity = await concreteIdentity(candidate);
  const existing = state.identities.get(candidate.id);

  if (existing !== undefined) {
    if (identitiesConflict(existing, identity)) {
      throw failure({
        message: "Duplicate artifact identifiers contain conflicting evidence.",
        reason: "load-failed",
        artifactId: candidate.id,
      });
    }
    return;
  }

  state.identities.set(candidate.id, identity);
  state.artifacts.push(candidate);
  state.inputHashes.push(identity.fingerprint ?? identity.valueHash);
}

async function concreteIdentity(
  input: ArtifactInput,
): Promise<ConcreteIdentity> {
  const valueFingerprint = await fingerprintArtifactValue(input.value);

  if (valueFingerprint === undefined) {
    throw failure({
      message: "Provider-visible artifact could not be fingerprinted.",
      reason: "load-failed",
      artifactId: input.id,
    });
  }

  return {
    ...(input.fingerprint !== undefined
      ? { fingerprint: input.fingerprint.value }
      : {}),
    valueHash: valueFingerprint.value,
  };
}

function identitiesConflict(
  left: ConcreteIdentity,
  right: ConcreteIdentity,
): boolean {
  return (
    left.valueHash !== right.valueHash ||
    (left.fingerprint !== undefined &&
      right.fingerprint !== undefined &&
      left.fingerprint !== right.fingerprint)
  );
}

function duplicatesCompatible(
  left: ArtifactInput,
  right: ArtifactInput,
  leftIdentity: ConcreteIdentity | undefined,
  rightIdentity: ConcreteIdentity | undefined,
): boolean {
  if (leftIdentity !== undefined && rightIdentity !== undefined) {
    return !identitiesConflict(leftIdentity, rightIdentity);
  }

  return JSON.stringify(toArtifactRef(left)) === JSON.stringify(toArtifactRef(right));
}

function indexTurnRefs(turn: SessionTurn): ReadonlyMap<string, ArtifactRef> {
  const refs = new Map<string, ArtifactRef>();

  for (const ref of [...turn.artifactRefs, ...turn.outputArtifactRefs]) {
    const existing = refs.get(ref.id);

    if (
      existing?.fingerprint !== undefined &&
      ref.fingerprint !== undefined &&
      existing.fingerprint.value !== ref.fingerprint.value
    ) {
      throw failure({
        message: "Session turn contains conflicting artifact references.",
        reason: "load-failed",
        artifactId: ref.id,
      });
    }

    if (existing === undefined) {
      refs.set(ref.id, ref);
    }
  }

  return refs;
}

function createSessionTurnArtifact(
  turn: SessionTurn,
  session: SessionRecord | undefined,
  policy: PolicySpec | undefined,
): ArtifactInput {
  const sessionId = session?.id ?? "unknown";
  const taskArtifact = artifact.text(turn.task, {
    id: `artifact:session-turn:${encodeURIComponent(sessionId)}:${encodeURIComponent(turn.id)}`,
    privacy: mostRestrictiveArtifactPrivacy(
      turn.privacy ?? "standard",
      session?.privacy ?? "standard",
      policy?.privacy ?? "standard",
    ),
    metadata: {
      trust: "user",
      contextKind: "session-turn",
      sessionId,
      turnId: turn.id,
    },
  });

  return { ...taskArtifact, source: "generated" };
}

async function createProjectionId(
  route: SelectedRoute,
  refs: readonly ArtifactRef[],
  inputHashes: readonly string[],
): Promise<string> {
  const fingerprint = await fingerprintArtifactValue({
    providerId: route.providerId,
    modelId: route.modelId,
    artifacts: refs.map((ref, index) => ({
      id: ref.id,
      hash: inputHashes[index],
    })),
  });

  if (fingerprint === undefined) {
    throw failure({
      message: "Context projection could not be fingerprinted.",
      reason: "load-failed",
    });
  }

  return `context-projection:${fingerprint.value}`;
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function failure(
  input: ContextMaterializationFailureInput,
): ContextMaterializationFailure {
  return new ContextMaterializationFailure(input);
}
