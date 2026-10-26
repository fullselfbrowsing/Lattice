#!/usr/bin/env bash
# Build the released 1.6.0 verifier that eval/scripts/07-v16.mjs imports.
#
# 07-v16.mjs loads ../../.context/base/packages/lattice/dist/index.js and checks
# two things a clean clone cannot check without it: a crew chain minted by the
# current library still verifies on the released 1.6.0 verifier, and that
# verifier does not enforce chain closure. The directory is a detached
# worktree of the v1.6.0 tag (override with BASE_VERIFIER_REF). It is gitignored.
# run-all.sh calls this script before 07-v16.mjs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$ROOT/.context/base"
REF="${BASE_VERIFIER_REF:-v1.6.0}"
DIST="$DEST/packages/lattice/dist/index.js"

if [ -f "$DIST" ]; then
  exit 0
fi

cd "$ROOT"
git fetch --tags origin >/dev/null 2>&1 || true
if [ -d "$DEST" ] && [ ! -f "$DEST/.git" ] && [ ! -e "$DEST/.git" ]; then
  echo "prepare-base-verifier: $DEST exists and is not a worktree" >&2
  exit 1
fi
if [ ! -d "$DEST" ]; then
  git worktree add --detach "$DEST" "$REF"
fi

cd "$DEST"
if [ -f "$DIST" ]; then
  exit 0
fi
pnpm install --frozen-lockfile
pnpm --filter @full-self-browsing/lattice build
test -f "$DIST"
echo "prepare-base-verifier: built $REF at $DIST"
