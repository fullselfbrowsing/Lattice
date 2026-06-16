import { describe, expect, it } from "vitest";
import { artifact } from "../artifacts/artifact.js";
import { assertNoPublicUrlEgress, NoPublicUrlEgressError } from "./no-public-url.js";

const PROVIDER_ID = "test-provider";
const ARTIFACT_ID = "art-1";
const PUBLIC_URL = "https://evil.example/x.png";

describe("assertNoPublicUrlEgress", () => {
  it("no-op when noPublicUrl is not set", () => {
    expect(() =>
      assertNoPublicUrlEgress(
        { task: "t", artifacts: [artifact.url(PUBLIC_URL, { id: ARTIFACT_ID })], outputs: ["text"], policy: undefined },
        PROVIDER_ID,
        JSON.stringify({ url: PUBLIC_URL }),
      ),
    ).not.toThrow();
  });

  it("no-op when noPublicUrl is false", () => {
    expect(() =>
      assertNoPublicUrlEgress(
        {
          task: "t",
          artifacts: [artifact.url(PUBLIC_URL, { id: ARTIFACT_ID })],
          outputs: ["text"],
          policy: { noPublicUrl: false },
        },
        PROVIDER_ID,
        JSON.stringify({ url: PUBLIC_URL }),
      ),
    ).not.toThrow();
  });

  it("throws when artifact.value is a public URL present in body", () => {
    const body = JSON.stringify({ url: PUBLIC_URL });
    expect(() =>
      assertNoPublicUrlEgress(
        {
          task: "t",
          artifacts: [artifact.url(PUBLIC_URL, { id: ARTIFACT_ID })],
          outputs: ["text"],
          policy: { noPublicUrl: true },
        },
        PROVIDER_ID,
        body,
      ),
    ).toThrow(NoPublicUrlEgressError);

    expect(() =>
      assertNoPublicUrlEgress(
        {
          task: "t",
          artifacts: [artifact.url(PUBLIC_URL, { id: ARTIFACT_ID })],
          outputs: ["text"],
          policy: { noPublicUrl: true },
        },
        PROVIDER_ID,
        body,
      ),
    ).toThrow(PUBLIC_URL);
  });

  it("throws when artifact.metadata entry is a public URL present in body", () => {
    // The artifact value is opaque (non-URL data URI), metadata.base64Data = PUBLIC_URL.
    const imgArtifact = artifact.image("data:image/png;base64,abc", {
      id: ARTIFACT_ID,
      metadata: { base64Data: PUBLIC_URL, encoding: "base64" },
    });
    const body = JSON.stringify({ url: PUBLIC_URL });

    expect(() =>
      assertNoPublicUrlEgress(
        {
          task: "t",
          artifacts: [imgArtifact],
          outputs: ["text"],
          policy: { noPublicUrl: true },
        },
        PROVIDER_ID,
        body,
      ),
    ).toThrow(NoPublicUrlEgressError);
  });

  it("does not throw for data: URL in artifact.value (not http(s))", () => {
    const dataUrl = "data:image/png;base64,abc";
    const imgArtifact = artifact.image(dataUrl, { id: ARTIFACT_ID });
    const body = JSON.stringify({ data: dataUrl });

    expect(() =>
      assertNoPublicUrlEgress(
        {
          task: "t",
          artifacts: [imgArtifact],
          outputs: ["text"],
          policy: { noPublicUrl: true },
        },
        PROVIDER_ID,
        body,
      ),
    ).not.toThrow();
  });

  it("does not throw when URL has been stripped from body (packaging already removed it)", () => {
    // Artifact carries a public URL in value, but serializedBody does NOT contain it
    // (packaging replaced it with a data: representation).
    const body = JSON.stringify({ data: "data:image/png;base64,abc123" });

    expect(() =>
      assertNoPublicUrlEgress(
        {
          task: "t",
          artifacts: [artifact.url(PUBLIC_URL, { id: ARTIFACT_ID })],
          outputs: ["text"],
          policy: { noPublicUrl: true },
        },
        PROVIDER_ID,
        body,
      ),
    ).not.toThrow();
  });

  it("error carries provider id, artifact id, offending URL", () => {
    const body = JSON.stringify({ url: PUBLIC_URL });
    let caught: unknown;
    try {
      assertNoPublicUrlEgress(
        {
          task: "t",
          artifacts: [artifact.url(PUBLIC_URL, { id: ARTIFACT_ID })],
          outputs: ["text"],
          policy: { noPublicUrl: true },
        },
        PROVIDER_ID,
        body,
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(NoPublicUrlEgressError);
    const e = caught as NoPublicUrlEgressError;
    expect(e.message).toContain(PROVIDER_ID);
    expect(e.message).toContain(ARTIFACT_ID);
    expect(e.message).toContain(PUBLIC_URL);
    expect(e.providerId).toBe(PROVIDER_ID);
    expect(e.artifactId).toBe(ARTIFACT_ID);
    expect(e.offendingUrl).toBe(PUBLIC_URL);
  });

  it("NoPublicUrlEgressError is instanceof Error and instanceof NoPublicUrlEgressError", () => {
    const body = JSON.stringify({ url: PUBLIC_URL });
    let caught: unknown;
    try {
      assertNoPublicUrlEgress(
        {
          task: "t",
          artifacts: [artifact.url(PUBLIC_URL, { id: ARTIFACT_ID })],
          outputs: ["text"],
          policy: { noPublicUrl: true },
        },
        PROVIDER_ID,
        body,
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(NoPublicUrlEgressError);
    expect((caught as Error).name).toBe("NoPublicUrlEgressError");
  });
});
