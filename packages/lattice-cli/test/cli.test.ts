import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const binPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function runBin(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    encoding: "utf8",
    timeout: 10_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("lattice CLI bin smoke test", () => {
  it("prints help and exits 0 for --help", () => {
    const { status, stdout } = runBin(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/repro/);
    expect(stdout).toMatch(/verify/);
  });

  it("repro stub exits 2 with a not-implemented message", () => {
    const { status, stderr } = runBin(["repro", "abc"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/not-implemented/);
  });

  it("verify stub exits 2 with a not-implemented message", () => {
    const { status, stderr } = runBin(["verify", "./fixture.json"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/not-implemented/);
  });
});
