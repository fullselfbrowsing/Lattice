#!/usr/bin/env bash
# Reproduce the full Lattice evaluation. Offline: no network, no API keys.
# Requires Node >= 24, pnpm 10, python3 + matplotlib (for plots only).
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile && pnpm build
R=eval/results; mkdir -p $R
node --input-type=module -e 'import { writeJSON, envInfo } from "./eval/scripts/lib.mjs"; import { execSync } from "node:child_process"; const first = execSync("git log --reverse --format=%H%x20%aI", { shell: "/bin/bash" }).toString().split("\n")[0].trim(); await writeJSON("env.json", { ...(await envInfo()), gitCommit: execSync("git rev-parse HEAD").toString().trim(), firstCommit: first });'
# E6 existing test suite
( cd packages/lattice && npx vitest run --reporter=default --reporter=json --outputFile=../../$R/tests-lattice.json ) > $R/tests-lattice.log 2>&1 || true
( cd packages/lattice-cli && npx vitest run --reporter=default --reporter=json --outputFile=../../$R/tests-lattice-cli.json ) > $R/tests-lattice-cli.log 2>&1 || true
TRIALS=${TRIALS:-1000} node --expose-gc eval/scripts/01-overhead.mjs
node eval/scripts/02-chain.mjs
node eval/scripts/03-tamper.mjs > $R/tamper.log
node eval/scripts/04-replay.mjs > $R/replay.log
node eval/scripts/05-policy.mjs > $R/policy.log
node eval/scripts/07-v16.mjs > $R/v16.log
python3 eval/scripts/06-report.py
