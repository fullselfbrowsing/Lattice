export type GatewayMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly GatewayMetadataValue[]
  | { readonly [key: string]: GatewayMetadataValue };

export interface GatewayPolicy {
  readonly routeTags?: readonly string[];
  readonly providerPreferences?: readonly string[];
  readonly metadata?: Record<string, GatewayMetadataValue>;
  readonly allowFallbacks?: boolean;
}

export interface PolicySpec {
  readonly maxCostUsd?: number;
  readonly latency?: "interactive" | "batch";
  readonly privacy?: "standard" | "sensitive" | "restricted";
  readonly providerAllowList?: readonly string[];
  readonly providerDenyList?: readonly string[];
  readonly noUpload?: boolean;
  readonly noPublicUrl?: boolean;
  readonly noLogging?: boolean;
  readonly gateway?: GatewayPolicy;
  readonly metadata?: Record<string, unknown>;
}

export function mergePolicy(
  defaultPolicy?: PolicySpec,
  runPolicy?: PolicySpec,
): PolicySpec | undefined {
  if (defaultPolicy === undefined && runPolicy === undefined) {
    return undefined;
  }

  return {
    ...defaultPolicy,
    ...runPolicy,
  };
}
