import { spawn, type SpawnOptions } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

async function runProc(
  cmd: string,
  args: readonly string[],
  opts: SpawnOptions = {},
): Promise<SpawnResult> {
  return await new Promise<SpawnResult>((resolveProc) => {
    const child = spawn(cmd, [...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, NO_COLOR: "1" },
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString();
    });
    child.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    child.on("close", (code) => {
      resolveProc({ stdout, stderr, code: code ?? -1 });
    });
    child.on("error", (err) => {
      resolveProc({ stdout, stderr: `${stderr}${err.message}`, code: -1 });
    });
  });
}

describe("v1.4 validation showcase", () => {
  let result: SpawnResult;

  beforeAll(async () => {
    const build = await runProc("pnpm", [
      "--filter",
      "@full-self-browsing/lattice",
      "build",
    ]);
    if (build.code !== 0) {
      throw new Error(
        `pnpm --filter @full-self-browsing/lattice build failed (code=${build.code}): ${build.stderr}`,
      );
    }

    result = await runProc("node", ["examples/v14-validation/index.mjs"]);
  });

  it("runs every offline v1.4 validation scenario", () => {
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("scenario=v14-streaming ok=true");
    expect(result.stdout).toContain("scenario=v14-gateway ok=true");
    expect(result.stdout).toContain("scenario=v14-observability ok=true");
    expect(result.stdout).toContain("scenario=v14-failure ok=true");
    expect(result.stdout).toMatch(/scenario=v14-package ok=true latticeVersion=(?!0\.0\.0)\S+/u);
  });
});
