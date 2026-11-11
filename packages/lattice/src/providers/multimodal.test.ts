import { describe, expect, it } from "vitest";
import { artifact, type ArtifactInput } from "../artifacts/artifact.js";
import { fc } from "../test-support/fast-check.js";
import { artifactText, UnsupportedArtifactTransportError } from "./multimodal.js";
import type { ProviderRunRequest } from "./provider.js";

function request(artifacts: readonly ArtifactInput[]): ProviderRunRequest {
  return { task: "t", artifacts, outputs: ["answer"] };
}

function jsonArtifact(value: unknown): ArtifactInput {
  // Built directly: the artifact factory itself rejects some of these values.
  return { id: "a1", kind: "json", value } as unknown as ArtifactInput;
}

function failure(input: ArtifactInput, transport = "json"): UnsupportedArtifactTransportError {
  try {
    artifactText(request([input]), input);
  } catch (error) {
    expect(error).toBeInstanceOf(UnsupportedArtifactTransportError);
    const typed = error as UnsupportedArtifactTransportError;
    expect(typed.message.startsWith(`Artifact ${input.id} cannot be delivered using transport ${transport}`)).toBe(true);
    return typed;
  }
  throw new Error("expected artifactText to throw");
}

class Custom { readonly x = 1; }

function circular(): unknown {
  const root: Record<string, unknown> = { child: {} };
  (root.child as Record<string, unknown>).back = root;
  return root;
}

function withSymbolKey(): unknown {
  return { [Symbol("k")]: 1 };
}

function withThrowingGetter(): unknown {
  return Object.defineProperty({}, "boom", { enumerable: true, get() { throw new Error("no"); } });
}

// eslint-disable-next-line no-sparse-arrays
const sparse: unknown[] = [1, , 3];

describe("artifactText rejections", () => {
  it.each<[string, () => unknown, string, string]>([
    ["Date", () => ({ createdAt: new Date(0) }), "$.createdAt is a Date", "$.createdAt"],
    ["undefined property", () => ({ a: undefined }), "$.a is undefined", "$.a"],
    ["undefined array element", () => ({ items: [1, undefined] }), "$.items[1] is undefined", "$.items[1]"],
    ["sparse array hole", () => ({ items: sparse }), "$.items[1] is undefined", "$.items[1]"],
    ["NaN", () => ({ n: NaN }), "$.n is NaN", "$.n"],
    ["Infinity", () => [Infinity], "$[0] is Infinity", "$[0]"],
    ["-Infinity", () => ({ n: -Infinity }), "$.n is -Infinity", "$.n"],
    ["BigInt", () => ({ n: 1n }), "$.n is a bigint", "$.n"],
    ["Map", () => ({ m: new Map() }), "$.m is a Map", "$.m"],
    ["Set", () => ({ s: new Set() }), "$.s is a Set", "$.s"],
    ["nested Uint8Array", () => ({ a: { bytes: new Uint8Array(2) } }), "$.a.bytes is a Uint8Array", "$.a.bytes"],
    ["class instance", () => ({ c: new Custom() }), "$.c is a Custom", "$.c"],
    ["function", () => ({ f: () => 1 }), "$.f is a function", "$.f"],
    ["symbol value", () => ({ s: Symbol("x") }), "$.s is a symbol", "$.s"],
    ["symbol key", withSymbolKey, "$ is an object with symbol-keyed properties", "$"],
    ["top-level undefined", () => undefined, "$ is undefined", "$"],
    ["circular reference", circular, "$.child.back is a circular reference", "$.child.back"],
    ["throwing getter", withThrowingGetter, "$.boom is a property that could not be read", "$.boom"],
    ["non-identifier key", () => ({ "key with space": new Date(0) }), "$[\"key with space\"] is a Date", "$[\"key with space\"]"],
  ])("%s", (_name, make, reason, path) => {
    const error = failure(jsonArtifact(make()));
    expect(error.reason).toContain(reason);
    expect(error.reason).toContain("not plain JSON");
    expect(error.path).toBe(path);
  });

  it("hints how to fix a Date", () => {
    expect(failure(jsonArtifact(new Date(0))).reason).toContain("toISOString()");
  });

  it.each([
    ["Blob", new Blob(["x"])],
    ["ArrayBuffer", new ArrayBuffer(2)],
    ["ArrayBufferView", new Uint8Array(2)],
  ])("rejects binary %s as text without a path", (kind, value) => {
    const error = failure(artifact.document(value as never, { id: "a1" }), "inline");
    expect(error.reason).toContain(`binary ${kind} content cannot be sent as text`);
    expect(error.path).toBeUndefined();
  });

  it("explains a url transport that has no http(s) URL to send", () => {
    const input = artifact.url("not a url", { id: "a1" });
    const planned: ProviderRunRequest = {
      ...request([input]),
      providerPackaging: {
        providerId: "p", modelId: "m", warnings: [],
        artifacts: [{ artifactId: "a1", transport: "url", lineageTransform: "provider-packaging", warnings: [] }],
      },
    };
    expect(() => artifactText(planned, input)).toThrow(UnsupportedArtifactTransportError);
    try {
      artifactText(planned, input);
    } catch (error) {
      expect((error as UnsupportedArtifactTransportError).reason).toBe("the artifact has no http(s) URL");
      expect((error as UnsupportedArtifactTransportError).path).toBeUndefined();
    }
  });

  it("reports nesting too deep to scan without overflowing the caller", () => {
    let deep: unknown = 1;
    for (let depth = 0; depth < 100_000; depth += 1) deep = { d: deep };
    expect(failure(jsonArtifact(deep)).reason).toBe("the value is nested too deeply to inspect");
  });

  it("reports a value whose keys cannot be listed", () => {
    const hostile = new Proxy({}, { ownKeys() { throw new Error("no keys"); } });
    expect(failure(jsonArtifact({ h: hostile })).reason).toBe("the value could not be inspected");
  });

  it("rejects URL artifacts without the url transport", () => {
    const error = failure(artifact.url("not a url", { id: "a1" }), "inline");
    expect(error.reason).toBe("URL artifacts can only be sent with the url transport");
  });
});

describe("artifactText acceptance", () => {
  it.each<[string, () => unknown]>([
    ["nested", () => ({ a: [1, { b: [true, null, "x"] }] })],
    ["null", () => null],
    ["booleans", () => [true, false]],
    ["numbers", () => [0, -1.5, 1e21]],
    ["null prototype", () => Object.assign(Object.create(null) as object, { a: 1 })],
    ["shared reference", () => { const shared = { v: 1 }; return { a: shared, b: shared }; }],
    ["unicode keys", () => ({ "é": 1, "日本": [2] })],
  ])("accepts %s", (_name, make) => {
    const value = make();
    const input = jsonArtifact(value);
    const parsed = JSON.parse(artifactText(request([input]), input)) as { value: unknown };
    expect(parsed.value).toEqual(JSON.parse(JSON.stringify(value)));
  });
});

describe("artifactText properties", () => {
  it("accepts every JSON value and preserves it", () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => {
      const input = jsonArtifact(value);
      const parsed = JSON.parse(artifactText(request([input]), input)) as { value: unknown };
      expect(parsed.value).toEqual(JSON.parse(JSON.stringify(value)));
    }));
  });

  it("reports the path of a Date at a generated key", () => {
    const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
    fc.assert(fc.property(fc.dictionary(fc.string(), fc.jsonValue()), fc.string(), (base, key) => {
      const container: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(base)) {
        Object.defineProperty(container, k, { value: v, enumerable: true, writable: true, configurable: true });
      }
      Object.defineProperty(container, key, {
        value: new Date(0), enumerable: true, writable: true, configurable: true,
      });
      const expected = identifier.test(key) ? `$.${key}` : `$[${JSON.stringify(key)}]`;
      const error = failure(jsonArtifact({ outer: container }));
      expect(error.path).toBe(`$.outer${expected.slice(1)}`);
    }));
  });
});
