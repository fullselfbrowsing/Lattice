import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import * as agents from "../src/agents.js";
import * as artifacts from "../src/artifacts.js";
import * as audit from "../src/audit.js";
import * as context from "../src/context.js";
import * as core from "../src/core.js";
import * as evals from "../src/eval.js";
import * as providers from "../src/providers.js";
import * as routing from "../src/routing.js";
import * as storage from "../src/storage.js";
import * as tools from "../src/tools.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as {
  readonly exports: Record<string, Record<string, string>>;
  readonly lattice?: {
    readonly modules?: Record<string, {
      readonly compatibility?: string;
      readonly description?: string;
    }>;
  };
};

const REQUIRED_MODULES = [
  "./providers",
  "./audit",
  "./context",
  "./artifacts",
  "./routing",
  "./tools",
  "./storage",
  "./eval",
  "./agents",
  "./core",
] as const;

const COMPATIBILITY_LABELS = [
  "node20-compatible",
  "node24-runtime",
  "adapter-specific",
] as const;

describe("modular package entrypoints", () => {
  it("exposes representative source-level values for every module facade", () => {
    expect(typeof providers.createOpenAICompatibleProvider).toBe("function");
    expect(typeof providers.parseToolUseEnvelope).toBe("function");
    expect(typeof audit.createReceipt).toBe("function");
    expect(typeof context.buildContextPack).toBe("function");
    expect(typeof artifacts.artifact.text).toBe("function");
    expect(typeof routing.routeDeterministically).toBe("function");
    expect(typeof tools.defineTool).toBe("function");
    expect(typeof storage.createMemoryArtifactStore).toBe("function");
    expect(typeof evals.evalAgentRun).toBe("function");
    expect(typeof agents.runAgent).toBe("function");
    expect(typeof core.artifact.text).toBe("function");
    expect(typeof core.routeDeterministically).toBe("function");
  });

  it("declares package exports and compatibility metadata for every module", () => {
    for (const modulePath of REQUIRED_MODULES) {
      expect(packageJson.exports[modulePath]).toMatchObject({
        types: `./dist/${modulePath.slice(2)}.d.ts`,
        import: `./dist/${modulePath.slice(2)}.js`,
        default: `./dist/${modulePath.slice(2)}.js`,
      });
      expect(COMPATIBILITY_LABELS).toContain(
        packageJson.lattice?.modules?.[modulePath]?.compatibility,
      );
      expect(packageJson.lattice?.modules?.[modulePath]?.description).toEqual(
        expect.any(String),
      );
    }
  });

  it("keeps provider, audit, and core facades separate from agent APIs", () => {
    expect("runAgent" in providers).toBe(false);
    expect("runAgentCrew" in providers).toBe(false);
    expect("runAgent" in audit).toBe(false);
    expect("runAgentCrew" in audit).toBe(false);
    expect("runAgent" in core).toBe(false);
    expect("runAgentCrew" in core).toBe(false);

    expect(packageJson.lattice?.modules?.["./providers"]?.compatibility).not.toBe(
      "node24-runtime",
    );
    expect(packageJson.lattice?.modules?.["./audit"]?.compatibility).not.toBe(
      "node24-runtime",
    );
    expect(packageJson.lattice?.modules?.["./core"]?.compatibility).not.toBe(
      "node24-runtime",
    );
    expect(packageJson.lattice?.modules?.["./agents"]?.compatibility).toBe(
      "node24-runtime",
    );
  });
});
