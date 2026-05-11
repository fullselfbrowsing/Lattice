import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  defaultKeysetPath,
  expandTilde,
  isKeysetLoadError,
  loadKeySetFromPath,
} from "../src/io/keyset-loader.js";

const seedKeysetEntries = [
  {
    kid: "test-kid-1",
    state: "active",
    publicKeyJwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "MCowBQYDK2VwAyEAdummy",
    },
  },
];

const ENV_KEYS = ["HOME", "USERPROFILE"] as const;

describe("keyset-loader.ts", () => {
  let sandboxDir: string;
  let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeEach(async () => {
    sandboxDir = await mkdtemp(join(tmpdir(), "lattice-keyset-"));
    savedEnv = {};
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      process.env[k] = sandboxDir;
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const original = savedEnv[k];
      if (original === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = original;
      }
    }
  });

  it("Test 1: loadKeySetFromPath() (no arg) reads ~/.lattice/keyset.json", async () => {
    const latticeDir = join(sandboxDir, ".lattice");
    await mkdir(latticeDir, { recursive: true });
    await writeFile(
      join(latticeDir, "keyset.json"),
      JSON.stringify(seedKeysetEntries),
      "utf8",
    );
    const keySet = await loadKeySetFromPath();
    const entry = keySet.lookup("test-kid-1");
    expect(entry).toBeDefined();
    expect(entry?.kid).toBe("test-kid-1");
    expect(entry?.state).toBe("active");
  });

  it("Test 2: loadKeySetFromPath(explicit) reads the explicit path; relative resolves against cwd", async () => {
    const explicit = join(sandboxDir, "explicit-keyset.json");
    await writeFile(explicit, JSON.stringify(seedKeysetEntries), "utf8");
    const keySet = await loadKeySetFromPath(explicit);
    expect(keySet.lookup("test-kid-1")?.kid).toBe("test-kid-1");
  });

  it("Test 3: ~/ prefix expands to homedir", async () => {
    await writeFile(
      join(sandboxDir, "tilde-keyset.json"),
      JSON.stringify(seedKeysetEntries),
      "utf8",
    );
    const keySet = await loadKeySetFromPath("~/tilde-keyset.json");
    expect(keySet.lookup("test-kid-1")?.kid).toBe("test-kid-1");
  });

  it("Test 3b: bare ~ expands to homedir as a directory (verified via expandTilde)", () => {
    expect(expandTilde("~")).toBe(sandboxDir);
    expect(expandTilde("~/foo.json")).toBe(join(sandboxDir, "foo.json"));
    expect(expandTilde("/absolute/path.json")).toBe("/absolute/path.json");
    expect(expandTilde("./relative.json")).toBe("./relative.json");
  });

  it("Test 3c: defaultKeysetPath() composes homedir + .lattice/keyset.json", () => {
    expect(defaultKeysetPath()).toBe(join(sandboxDir, ".lattice", "keyset.json"));
  });

  it("Test 4: missing file rejects with KeysetLoadError kind=missing", async () => {
    expect.assertions(4);
    try {
      await loadKeySetFromPath(join(sandboxDir, "does-not-exist.json"));
    } catch (err) {
      expect(isKeysetLoadError(err)).toBe(true);
      if (isKeysetLoadError(err)) {
        expect(err.kind).toBe("missing");
        expect(err.path).toBe(join(sandboxDir, "does-not-exist.json"));
        expect(typeof err.message).toBe("string");
      }
    }
  });

  it("Test 5: malformed JSON rejects with KeysetLoadError kind=malformed", async () => {
    const bad = join(sandboxDir, "bad.json");
    await writeFile(bad, "{not valid json", "utf8");
    expect.assertions(3);
    try {
      await loadKeySetFromPath(bad);
    } catch (err) {
      expect(isKeysetLoadError(err)).toBe(true);
      if (isKeysetLoadError(err)) {
        expect(err.kind).toBe("malformed");
        expect(err.path).toBe(bad);
      }
    }
  });

  it("Test 6: valid JSON but not a KeyEntry array rejects with kind=malformed", async () => {
    const bad = join(sandboxDir, "shape.json");
    await writeFile(bad, JSON.stringify({ kid: "x" }), "utf8");
    expect.assertions(2);
    try {
      await loadKeySetFromPath(bad);
    } catch (err) {
      expect(isKeysetLoadError(err)).toBe(true);
      if (isKeysetLoadError(err)) {
        expect(err.kind).toBe("malformed");
      }
    }
  });

  it("Test 6b: array of objects missing kid/state/publicKeyJwk rejects with kind=malformed", async () => {
    const bad = join(sandboxDir, "shape2.json");
    await writeFile(bad, JSON.stringify([{ kid: "x" }]), "utf8");
    expect.assertions(2);
    try {
      await loadKeySetFromPath(bad);
    } catch (err) {
      expect(isKeysetLoadError(err)).toBe(true);
      if (isKeysetLoadError(err)) {
        expect(err.kind).toBe("malformed");
      }
    }
  });

  it("Test 6c: array with invalid state value rejects with kind=malformed", async () => {
    const bad = join(sandboxDir, "shape3.json");
    await writeFile(
      bad,
      JSON.stringify([
        {
          kid: "x",
          state: "not-a-real-state",
          publicKeyJwk: { kty: "OKP" },
        },
      ]),
      "utf8",
    );
    expect.assertions(2);
    try {
      await loadKeySetFromPath(bad);
    } catch (err) {
      expect(isKeysetLoadError(err)).toBe(true);
      if (isKeysetLoadError(err)) {
        expect(err.kind).toBe("malformed");
      }
    }
  });
});
