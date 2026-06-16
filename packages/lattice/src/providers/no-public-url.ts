import type { PolicySpec } from "../policy/policy.js";
import type { ProviderRunRequest } from "./provider.js";
import { isHttpUrl } from "./multimodal.js";

/**
 * Thrown when a run with `policy.noPublicUrl: true` is about to dispatch a
 * request whose serialized body still contains a public http(s) URL derived
 * from `request.artifacts` (value or string metadata entry).
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
 *   - `artifact.value` (if it is a string and `isHttpUrl(value)` is true)
 *   - Every `string` value inside `artifact.metadata` (if `isHttpUrl(v)` is true)
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

    // Check artifact.value
    if (typeof artifact.value === "string" && isHttpUrl(artifact.value)) {
      forbidden.push({ url: artifact.value, id: artifactId });
    }

    // Check all string metadata values
    const metadata = artifact.metadata ?? {};
    for (const v of Object.values(metadata)) {
      if (typeof v === "string" && isHttpUrl(v)) {
        forbidden.push({ url: v, id: artifactId });
      }
    }
  }

  for (const entry of forbidden) {
    if (serializedBody.includes(entry.url)) {
      throw new NoPublicUrlEgressError(providerId, entry.id, entry.url);
    }
  }
}
