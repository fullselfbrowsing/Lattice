import type { PolicySpec } from "../policy/policy.js";
import type { ProviderRunRequest } from "./provider.js";
import { isHttpUrl } from "./multimodal.js";

/**
 * Thrown when a run with `policy.noPublicUrl: true` is about to dispatch a
 * request whose serialized body still contains a public http(s) URL derived
 * from `request.artifacts` (including nested JSON values and metadata).
 *
 * This is the single shared egress error class for all three adapter families
 * (OpenAI-compatible, Anthropic, Gemini).  Callers may `instanceof`-check it.
 */
export class NoPublicUrlEgressError extends Error {
  constructor(
    readonly providerId: string,
    readonly artifactId: string,
    readonly offendingUrl: string,
  ) {
    super(
      `noPublicUrl policy violated: provider '${providerId}' artifact '${artifactId}' would leak public URL '${offendingUrl}'`,
    );
    this.name = "NoPublicUrlEgressError";
    // Maintain correct prototype chain in environments that transpile classes.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Shared egress assertion called immediately before every run-request `fetch`.
 *
 * When `policy.noPublicUrl` is not `true` this function is a zero-cost no-op.
 *
 * When the policy IS active it builds a forbidden-URL set from ARTIFACT-DERIVED
 * sources only:
 *   - HTTP(S) strings inside `artifact.value`, including nested JSON
 *   - HTTP(S) strings inside `artifact.metadata`
 *
 * URLs in `policy.gateway.metadata` are NOT artifact-derived and are therefore
 * NOT in scope.  They are naturally excluded because they never appear in
 * `request.artifacts`.
 *
 * A URL is considered "leaked" only if the string is present in `serializedBody`.
 * If packaging already replaced the URL with a `data:` URL, `serializedBody`
 * will not contain the original http(s) URL and this function will not throw.
 * `data:` URLs are never forbidden because `isHttpUrl` rejects the `data:` scheme.
 *
 * @throws {NoPublicUrlEgressError} if any forbidden URL appears in `serializedBody`
 */
export function assertNoPublicUrlEgress(
  request: ProviderRunRequest,
  providerId: string,
  serializedBody: string,
): void {
  const policy = request.policy as PolicySpec | undefined;
  if (policy?.noPublicUrl !== true) {
    return;
  }

  const forbidden: Array<{ url: string; id: string }> = [];

  for (const artifact of request.artifacts) {
    const artifactId = (artifact.id as string | undefined) ?? "";

    for (const url of [...artifactUrls(artifact.value), ...artifactUrls(artifact.metadata)]) {
      forbidden.push({ url, id: artifactId });
    }
  }

  for (const entry of forbidden) {
    const escaped = JSON.stringify(entry.url).slice(1, -1);
    const nestedEscaped = JSON.stringify(escaped).slice(1, -1);
    if ([entry.url, escaped, nestedEscaped].some((value) => serializedBody.includes(value))) {
      throw new NoPublicUrlEgressError(providerId, entry.id, entry.url);
    }
  }
}

function artifactUrls(value: unknown, visited = new Set<object>()): string[] {
  if (isHttpUrl(value)) return [value];
  if (value === null || typeof value !== "object" || visited.has(value) ||
    value instanceof ArrayBuffer || ArrayBuffer.isView(value) ||
    (typeof Blob !== "undefined" && value instanceof Blob)) return [];
  visited.add(value);
  return Object.values(value).flatMap((nested) => artifactUrls(nested, visited));
}
