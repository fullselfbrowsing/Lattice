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
    const { status, stdout, stderr } = runBin(["--help"]);
    // TEMP DEBUG (PR #2): if status is not 0, surface stderr in the message
    // so we can see what the spawned bin actually output.
    if (status !== 0) {
      throw new Error(`Got status=${status}\nstdout=${stdout.slice(0,500)}\nstderr=${stderr.slice(0,1500)}\nbinPath=${binPath}\nexecPath=${process.execPath}\nNODE_OPTIONS=${process.env.NODE_OPTIONS ?? "(unset)"}`);
    }
    expect(status).toBe(0);
    expect(stdout).toMatch(/repro/);
    expect(stdout).toMatch(/verify/);
    expect(stdout).toMatch(/eval/);
  });

  // Plan 11-03 replaced the repro stub with the real handler. Calling repro
  // with a bare id against an empty cwd exercises the load-failure branch
  // (exit 2) with a `FAIL kind=...-load-failed` message — distinct from the
  // earlier not-implemented stub. The default fixtures dir / receipts dir
  // are usually absent during CI, so receipt-load-failed (or keyset-load-failed
  // if the default keyset path happens to exist) is the most common outcome;
  // any *-load-failed kind is acceptable here. Exit code 2 is still the
  // contract.
  it("repro subcommand exits 2 with a FAIL load-failed message when paths are absent", () => {
    const { status, stderr } = runBin(["repro", "abc"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/^FAIL kind=(receipt|keyset)-load-failed reason=/m);
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

  // Plan 12-03 adds the `eval` subcommand. Running it in an empty cwd
  // (no .lattice/, no keyset) MUST exit 2 with a FAIL kind=... message —
  // any of receipt-/keyset-/baseline-/session- prefixed kinds with
  // -missing/-malformed/-failed suffix is acceptable; the contract is the
  // exit code and the FAIL line shape.
  it("eval subcommand exits 2 with a FAIL load-failed message when paths are absent", () => {
    const { status, stderr } = runBin(["eval"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(
      /^FAIL kind=(receipt|keyset|baseline|session)-(missing|malformed|failed)/m,
    );
  });
});
