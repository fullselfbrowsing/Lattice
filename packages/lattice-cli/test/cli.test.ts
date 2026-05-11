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

  // Plan 11-02 replaces the verify stub with the real handler. Pointing at a
  // non-existent receipt path now exercises the load-failure branch (exit 2)
  // with a `FAIL kind=...-load-failed` message — distinct from the
  // not-implemented stub. The default keyset path is usually absent during
  // CI, so keyset-load-failed is the most common outcome; either *-load-failed
  // kind is acceptable here. Exit code 2 is still the contract.
  it("verify subcommand exits 2 with a FAIL load-failed message when paths are absent", () => {
    const { status, stderr } = runBin(["verify", "./fixture.json"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/^FAIL kind=(keyset|receipt)-load-failed reason=/m);
  });
});
