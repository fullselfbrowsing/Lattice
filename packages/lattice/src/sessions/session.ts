import type {
  ArtifactPrivacy,
  ArtifactRef,
} from "../artifacts/artifact.js";
import type { ArtifactRetentionPolicy } from "../policy/policy.js";

export interface SessionRef {
  readonly id: string;
  readonly kind?: "session-ref";
}

export interface SessionTurn {
  readonly id: string;
  readonly task: string;
  readonly artifactRefs: readonly ArtifactRef[];
  readonly planId?: string;
  readonly tenantId?: string;
  readonly privacy?: ArtifactPrivacy;
  readonly retention?: ArtifactRetentionPolicy;
  readonly outputArtifactRefs: readonly ArtifactRef[];
  readonly createdAt: string;
}

export interface SessionSummary {
  readonly id: string;
  readonly artifactRef: ArtifactRef;
  readonly sourceTurnIds: readonly string[];
  readonly trust: "model-summary";
  readonly createdAt: string;
}

export interface SessionRecord extends SessionRef {
  readonly kind: "session-ref";
  readonly parentId?: string;
  readonly branchPointRunId?: string;
  readonly tenantId?: string;
  readonly privacy?: ArtifactPrivacy;
  readonly retention?: ArtifactRetentionPolicy;
  readonly turns: readonly SessionTurn[];
  readonly summaries: readonly SessionSummary[];
  readonly artifactRefs: readonly ArtifactRef[];
  readonly planIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSessionOptions {
  readonly id?: string;
  readonly parentId?: string;
  readonly branchPointRunId?: string;
  readonly tenantId?: string;
  readonly privacy?: ArtifactPrivacy;
  readonly retention?: ArtifactRetentionPolicy;
}

export interface AppendSessionTurnInput {
  readonly sessionId: string;
  readonly task: string;
  readonly artifactRefs: readonly ArtifactRef[];
  readonly outputArtifactRefs?: readonly ArtifactRef[];
  readonly planId?: string;
  readonly tenantId?: string;
  readonly privacy?: ArtifactPrivacy;
  readonly retention?: ArtifactRetentionPolicy;
}

export interface SessionStore {
  readonly kind: "session-store";
  readonly id: string;
  create(options?: CreateSessionOptions): Promise<SessionRecord>;
  load(id: string): Promise<SessionRecord | undefined>;
  save(session: SessionRecord): Promise<SessionRecord>;
  branch(parentId: string, options?: Omit<CreateSessionOptions, "parentId">): Promise<SessionRecord>;
  appendTurn(input: AppendSessionTurnInput): Promise<SessionRecord>;
}

export interface MemorySessionStoreOptions {
  readonly id?: string;
}

export function createMemorySessionStore(
  options: MemorySessionStoreOptions = {},
): SessionStore {
  const storeId = options.id ?? "memory-sessions";
  const sessions = new Map<string, SessionRecord>();

  return {
    kind: "session-store",
    id: storeId,

    async create(createOptions = {}) {
      const now = new Date().toISOString();
      const session: SessionRecord = {
        id: createOptions.id ?? createSessionId(),
        kind: "session-ref",
        ...(createOptions.parentId !== undefined ? { parentId: createOptions.parentId } : {}),
        ...(createOptions.branchPointRunId !== undefined
          ? { branchPointRunId: createOptions.branchPointRunId }
          : {}),
        ...sessionScopeFields(createOptions),
        turns: [],
        summaries: [],
        artifactRefs: [],
        planIds: [],
        createdAt: now,
        updatedAt: now,
      };

      sessions.set(session.id, clone(session));

      return clone(session);
    },

    async load(id) {
      const session = sessions.get(id);

      return session === undefined ? undefined : clone(session);
    },

    async save(session) {
      sessions.set(session.id, clone(session));

      return clone(session);
    },

    async branch(parentId, branchOptions = {}) {
      const parent = sessions.get(parentId);

      if (parent === undefined) {
        return this.create({
          ...branchOptions,
          parentId,
        });
      }

      assertCompatibleSessionScope(parent, branchOptions, "branch");
      const branched = await this.create({
        ...(branchOptions.id !== undefined ? { id: branchOptions.id } : {}),
        ...(branchOptions.branchPointRunId !== undefined
          ? { branchPointRunId: branchOptions.branchPointRunId }
          : {}),
        parentId,
        ...sessionScopeFields(parent),
      });

      const inherited: SessionRecord = {
        ...branched,
        turns: clone(parent.turns),
        summaries: clone(parent.summaries),
        artifactRefs: clone(parent.artifactRefs),
        planIds: clone(parent.planIds),
      };

      sessions.set(inherited.id, clone(inherited));

      return clone(inherited);
    },

    async appendTurn(input) {
      const stored = sessions.get(input.sessionId);
      const existing = stored ?? await this.create({
        id: input.sessionId,
        ...sessionScopeFields(input),
      });

      if (stored !== undefined) {
        assertCompatibleSessionScope(existing, input, "append");
      }

      const turn: SessionTurn = {
        id: createTurnId(),
        task: input.task,
        artifactRefs: clone(input.artifactRefs),
        outputArtifactRefs: clone(input.outputArtifactRefs ?? []),
        ...(input.planId !== undefined ? { planId: input.planId } : {}),
        ...sessionScopeFields(existing),
        createdAt: new Date().toISOString(),
      };
      const artifactRefs = mergeArtifactRefs(
        existing.artifactRefs,
        input.artifactRefs,
        input.outputArtifactRefs ?? [],
      );
      const planIds =
        input.planId === undefined
          ? existing.planIds
          : [...existing.planIds, input.planId];
      const next: SessionRecord = {
        ...existing,
        turns: [...existing.turns, turn],
        artifactRefs,
        planIds,
        updatedAt: new Date().toISOString(),
      };

      sessions.set(next.id, clone(next));

      return clone(next);
    },
  };
}

type SessionScope = Pick<
  SessionRecord,
  "tenantId" | "privacy" | "retention"
>;

function sessionScopeFields(scope: SessionScope): SessionScope {
  return {
    ...(scope.tenantId !== undefined ? { tenantId: scope.tenantId } : {}),
    ...(scope.privacy !== undefined ? { privacy: scope.privacy } : {}),
    ...(scope.retention !== undefined ? { retention: scope.retention } : {}),
  };
}

function assertCompatibleSessionScope(
  current: SessionScope,
  requested: SessionScope,
  operation: "append" | "branch",
): void {
  for (const field of ["tenantId", "privacy", "retention"] as const) {
    const requestedValue = requested[field];

    if (requestedValue !== undefined && requestedValue !== current[field]) {
      throw new Error(`Session ${operation} scope conflicts on ${field}.`);
    }
  }
}

function mergeArtifactRefs(
  current: readonly ArtifactRef[],
  ...groups: readonly (readonly ArtifactRef[])[]
): readonly ArtifactRef[] {
  const byId = new Map(current.map((artifact) => [artifact.id, artifact]));

  for (const group of groups) {
    for (const artifact of group) {
      byId.set(artifact.id, artifact);
    }
  }

  return [...byId.values()];
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `session:${crypto.randomUUID()}`;
  }

  return `session:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function createTurnId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `turn:${crypto.randomUUID()}`;
  }

  return `turn:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}
