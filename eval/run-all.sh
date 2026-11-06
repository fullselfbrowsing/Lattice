#!/usr/bin/env bash
# Reproduce the full Lattice evaluation. Offline: no network, no API keys.
# Requires Node >= 24, pnpm 10, python3 + matplotlib (for plots only).
#
# Two environments are recorded, because latency depends on the machine and the
# functional results depend only on the library:
#   eval/results/env-latency.json     01-overhead, 02-chain
#   eval/results/env-functional.json  03-tamper, 04-replay, 05-policy, 07-v16, vitest counts
# SKIP_LATENCY=1 re-runs only the functional part and keeps the existing latency
# results and env-latency.json.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile </dev/null && pnpm build </dev/null
R=eval/results; mkdir -p $R
PYTHON=${PYTHON:-python3}

if [ "${SKIP_LATENCY:-0}" != "1" ]; then
  node --input-type=module -e 'import { writeJSON, envInfo } from "./eval/scripts/lib.mjs"; import { execSync } from "node:child_process"; const first = execSync("git log --reverse --format=%H%x20%aI", { shell: "/bin/bash" }).toString().split("\n")[0].trim(); await writeJSON("env-latency.json", { ...(await envInfo()), gitCommit: execSync("git rev-parse HEAD").toString().trim(), firstCommit: first });' </dev/null
  TRIALS=${TRIALS:-1000} node --expose-gc eval/scripts/01-overhead.mjs </dev/null
  node eval/scripts/02-chain.mjs </dev/null
fi

node --input-type=module -e 'import { writeJSON, envInfo } from "./eval/scripts/lib.mjs"; import { execSync } from "node:child_process"; const sh = (c) => execSync(c).toString().trim(); await writeJSON("env-functional.json", { ...(await envInfo()), libraryCommit: sh("git log -1 --format=%H -- packages"), usedFor: ["03-tamper", "04-replay", "05-policy", "07-v16", "vitest test counts"] });' </dev/null
# E6 existing test suites. The raw JSON and logs are gitignored; 06-report.py
# copies the counts into tests_summary.json.
pnpm --filter @full-self-browsing/lattice exec vitest run --reporter=json --outputFile="$PWD/$R/tests-lattice.json" > $R/tests-lattice.log 2>&1 </dev/null || true
pnpm --filter @full-self-browsing/lattice-cli exec vitest run --reporter=json --outputFile="$PWD/$R/tests-lattice-cli.json" > $R/tests-lattice-cli.log 2>&1 </dev/null || true
node eval/scripts/03-tamper.mjs > $R/tamper.log </dev/null
node eval/scripts/04-replay.mjs > $R/replay.log </dev/null
node eval/scripts/05-policy.mjs > $R/policy.log </dev/null
bash eval/scripts/prepare-base-verifier.sh
node eval/scripts/07-v16.mjs > $R/v16.log </dev/null
"$PYTHON" eval/scripts/06-report.py
