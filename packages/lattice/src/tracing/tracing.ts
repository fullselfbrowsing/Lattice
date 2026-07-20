export interface TracerLike {
  readonly kind: "tracer";
  readonly span?: <T>(
    name: string,
    fn: () => T | Promise<T>,
    attributes?: Record<string, unknown>,
  ) => T | Promise<T>;
  readonly event?: (name: string, attributes?: Record<string, unknown>) => void;
}

export type RunEventKind =
  | "run.start"
  | "artifact.ingested"
  | "context.packed"
  | "router.candidates"
  | "stage.start"
  | "stage.complete"
  | "provider.attempt"
  | "stream.start"
  | "stream.complete"
  | "stream.failed"
  | "fallback.activated"
  | "validation.complete"
  | "validation.failed"
  | "receipt.issuance"
  | "artifact.created"
  | "run.complete"
  | "run.failed"
  | "tool.call"
  | "replay.offline"
  | "replay.live"
  | "step.transition"
  // Recovery / eviction-resume markers paired with the AgentHost storage seam
  // and SurvivabilityAdapter.
  | "recovery.start"
  | "recovery.complete"
  | "recovery.failed"
  // Capability-negotiation fallback marker. Fires when
  // adapter.negotiateCapabilities() falls back from /models to the static
  // registry due to transient (5xx, network, timeout) failure.
  // Auth errors (401, 403) do NOT fire this event -- they throw
  // NegotiationAuthError instead.
  | "capabilities.negotiation.fallback";

export interface RunEvent {
  readonly kind: RunEventKind;
  readonly timestamp: string;
  readonly runId: string;
  readonly planId?: string;
  readonly stageId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly artifactId?: string;
  readonly metadata?: Record<string, unknown>;
}

export type RunEventSink = (event: RunEvent) => void | Promise<void>;

export function createRunEvent(
  kind: RunEventKind,
  input: Omit<RunEvent, "kind" | "timestamp">,
): RunEvent {
  return {
    kind,
    timestamp: new Date().toISOString(),
    ...input,
  };
}
