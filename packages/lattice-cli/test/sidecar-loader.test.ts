/**
 * Tests for `sidecar-loader.ts`.
 *
 * Covers every `SidecarLoadError.kind` discriminator plus the happy paths
 * for `loadSidecar` and `applySidecar` (literal "text" preserved verbatim,
 * `{ kind: "citations" }` rehydrated via `output.citations()`, and
 * `{ kind: "artifacts" }` rehydrated via `output.artifacts()`).
 *
 * Each test uses an isolated tmpdir (mkdtemp) so cases never observe each other.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySidecar,
  isSidecarLoadError,
  loadSidecar,
  type SidecarFile,
} from "../src/io/sidecar-loader.js";

const validPolicy = { privacy: "sensitive" } as const;
const validContract = {
  kind: "capability-contract",
  invariants: [],
} as const;

function makeValidSidecar(): unknown {
  return {
    version: "lattice-sidecar/v1",
    task: "Summarize the inbox",
    outputs: { answer: "text" },
    policy: validPolicy,
    contract: validContract,
  };
}

describe("sidecar-loader.ts", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-sidecar-loader-"));
  });

  afterEach(() => {
    // tmpdir is isolated per case; node will clean automatically on suite end
  });

  it("Test 1: happy path — valid sidecar with literal text output loads as SidecarFile", async () => {
    const path = join(sandbox, "ok.json");
    await writeFile(path, JSON.stringify(makeValidSidecar()), "utf8");

    const sidecar = await loadSidecar(path);
    expect(sidecar.version).toBe("lattice-sidecar/v1");
    expect(sidecar.task).toBe("Summarize the inbox");
    expect(sidecar.outputs).toEqual({ answer: "text" });
    expect(sidecar.policy).toEqual(validPolicy);
    expect(sidecar.contract).toEqual(validContract);
  });

  it("Test 2: happy path — citations + artifacts sentinels round-trip", async () => {
    const path = join(sandbox, "ok-mixed.json");
    const file = {
      version: "lattice-sidecar/v1",
      task: "",
      outputs: {
        evidence: { kind: "citations" },
        generated: { kind: "artifacts" },
      },
      policy: validPolicy,
      contract: validContract,
    };
    await writeFile(path, JSON.stringify(file), "utf8");

    const sidecar = await loadSidecar(path);
    expect(sidecar.outputs).toEqual({
      evidence: { kind: "citations" },
      generated: { kind: "artifacts" },
    });
  });

  it("Test 3: file-not-found — non-existent path throws kind=file-not-found", async () => {
    const missing = join(sandbox, "does-not-exist.json");
    expect.assertions(4);
    try {
      await loadSidecar(missing);
    } catch (err) {
      expect(isSidecarLoadError(err)).toBe(true);
      if (isSidecarLoadError(err)) {
        expect(err.kind).toBe("file-not-found");
        expect(err.path).toBe(missing);
        expect(typeof err.message).toBe("string");
      }
    }
  });

  it("Test 4: malformed — invalid JSON throws kind=malformed", async () => {
    const bad = join(sandbox, "bad.json");
    await writeFile(bad, "not json", "utf8");
    expect.assertions(3);
    try {
      await loadSidecar(bad);
    } catch (err) {
      expect(isSidecarLoadError(err)).toBe(true);
      if (isSidecarLoadError(err)) {
        expect(err.kind).toBe("malformed");
        expect(err.path).toBe(bad);
      }
    }
  });

  it("Test 5: malformed — JSON missing the required `task` field throws kind=malformed and message names the field", async () => {
    const bad = join(sandbox, "missing-task.json");
    const file = {
      version: "lattice-sidecar/v1",
      // task intentionally missing
      outputs: {},
      policy: validPolicy,
      contract: validContract,
    };
    await writeFile(bad, JSON.stringify(file), "utf8");

    expect.assertions(3);
    try {
      await loadSidecar(bad);
    } catch (err) {
      expect(isSidecarLoadError(err)).toBe(true);
      if (isSidecarLoadError(err)) {
        expect(err.kind).toBe("malformed");
        expect(err.message).toContain("task");
      }
    }
  });

  it("Test 6: version-mismatch — wrong version throws kind=version-mismatch with received field", async () => {
    const bad = join(sandbox, "v2.json");
    const file = {
      version: "lattice-sidecar/v2",
      task: "",
      outputs: {},
      policy: {},
      contract: {},
    };
    await writeFile(bad, JSON.stringify(file), "utf8");

    expect.assertions(4);
    try {
      await loadSidecar(bad);
    } catch (err) {
      expect(isSidecarLoadError(err)).toBe(true);
      if (isSidecarLoadError(err)) {
        expect(err.kind).toBe("version-mismatch");
        if (err.kind === "version-mismatch") {
          expect(err.received).toBe("lattice-sidecar/v2");
        }
        expect(err.path).toBe(bad);
      }
    }
  });

  it("Test 7: unsupported-output-shape — Standard Schema marker throws with outputKey and v1.2 hint", async () => {
    const bad = join(sandbox, "stdschema.json");
    const file = {
      version: "lattice-sidecar/v1",
      task: "",
      outputs: { answer: { "~standard": { vendor: "zod", version: 1 } } },
      policy: validPolicy,
      contract: validContract,
    };
    await writeFile(bad, JSON.stringify(file), "utf8");

    expect.assertions(4);
    try {
      await loadSidecar(bad);
    } catch (err) {
      expect(isSidecarLoadError(err)).toBe(true);
      if (isSidecarLoadError(err)) {
        expect(err.kind).toBe("unsupported-output-shape");
        if (err.kind === "unsupported-output-shape") {
          expect(err.outputKey).toBe("answer");
        }
        expect(err.message).toContain("v1.2");
      }
    }
  });

  it("Test 8: unsupported-output-shape — any string other than 'text' throws unsupported-output-shape", async () => {
    const bad = join(sandbox, "json-out.json");
    const file = {
      version: "lattice-sidecar/v1",
      task: "",
      outputs: { x: "json" },
      policy: validPolicy,
      contract: validContract,
    };
    await writeFile(bad, JSON.stringify(file), "utf8");

    expect.assertions(3);
    try {
      await loadSidecar(bad);
    } catch (err) {
      expect(isSidecarLoadError(err)).toBe(true);
      if (isSidecarLoadError(err)) {
        expect(err.kind).toBe("unsupported-output-shape");
        if (err.kind === "unsupported-output-shape") {
          expect(err.outputKey).toBe("x");
        }
      }
    }
  });

  it("Test 9: applySidecar — literal text output passes through verbatim", async () => {
    const sidecar: SidecarFile = {
      version: "lattice-sidecar/v1",
      task: "Hello",
      outputs: { answer: "text" },
      policy: validPolicy,
      contract: validContract,
    };
    const applied = applySidecar(sidecar);
    expect(applied.task).toBe("Hello");
    expect(applied.outputs).toEqual({ answer: "text" });
    expect(applied.policy).toEqual(validPolicy);
    expect(applied.contract).toEqual(validContract);
  });

  it("Test 10: applySidecar — citation/artifact sentinels rehydrate to output.citations()/output.artifacts() shapes", async () => {
    const sidecar: SidecarFile = {
      version: "lattice-sidecar/v1",
      task: "",
      outputs: {
        evidence: { kind: "citations" },
        generated: { kind: "artifacts" },
      },
      policy: validPolicy,
      contract: validContract,
    };
    const applied = applySidecar(sidecar);
    expect(applied.outputs["evidence"]).toEqual({ kind: "citations" });
    expect(applied.outputs["generated"]).toEqual({ kind: "artifacts" });
  });

  it("Test 11: applySidecar — empty task string is preserved verbatim", () => {
    const sidecar: SidecarFile = {
      version: "lattice-sidecar/v1",
      task: "",
      outputs: {},
      policy: validPolicy,
      contract: validContract,
    };
    const applied = applySidecar(sidecar);
    expect(applied.task).toBe("");
  });

  it("Test 12: isSidecarLoadError — returns false for plain Errors, null, undefined, wrong-kind", () => {
    expect(isSidecarLoadError(new Error("nope"))).toBe(false);
    expect(isSidecarLoadError(null)).toBe(false);
    expect(isSidecarLoadError(undefined)).toBe(false);
    expect(
      isSidecarLoadError({ kind: "wrong-kind", path: "p", message: "m" }),
    ).toBe(false);
    expect(isSidecarLoadError("string")).toBe(false);
  });

  it("Test 13: isSidecarLoadError — returns true for each of the four valid kinds", () => {
    expect(
      isSidecarLoadError({
        kind: "file-not-found",
        path: "p",
        message: "m",
      }),
    ).toBe(true);
    expect(
      isSidecarLoadError({ kind: "malformed", path: "p", message: "m" }),
    ).toBe(true);
    expect(
      isSidecarLoadError({
        kind: "version-mismatch",
        path: "p",
        message: "m",
        received: "x",
      }),
    ).toBe(true);
    expect(
      isSidecarLoadError({
        kind: "unsupported-output-shape",
        path: "p",
        message: "m",
        outputKey: "k",
      }),
    ).toBe(true);
  });
});
