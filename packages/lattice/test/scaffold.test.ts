import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { latticeVersion } from "../src/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };
const staleScaffoldVersion = "0.0.0";

describe("lattice scaffold", () => {
  it("exports the package version", () => {
    expect(latticeVersion).toBe(pkg.version);
    expect(latticeVersion).not.toBe(staleScaffoldVersion);
  });
});
