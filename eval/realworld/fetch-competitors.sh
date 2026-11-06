#!/usr/bin/env bash
# Clone the comparison systems at the commits recorded in results/compare.json.
# 04-compare.py, 03-wrap.mjs, and 09-tamper-classes.py import or run code from
# these checkouts, so keep them in a directory only you can write to.
#
# CMP_DIR defaults to eval/realworld/.cache/cmp (gitignored). Override a
# repository URL with AFR_REPO, NOVAFABRIC_REPO, SELLO_REPO, or JANUS_REPO.
#
# Not fetched here:
#   cosign v2.5.3 (gitCommit in compare.json). Put it on PATH or set COSIGN_BIN.
#   The nova CLI. The recorded run used novafabric 0.105.0 from the NovaFabric
#     checkout.
#   Go. 04-compare.py builds the Janus shim with GOTOOLCHAIN=go1.26.8 and runs
#     go mod tidy, because integrations/janus/go.mod and go.sum are gitignored.
set -euo pipefail
cd "$(dirname "$0")"
CMP_DIR="${CMP_DIR:-$PWD/.cache/cmp}"
mkdir -p "$CMP_DIR"
chmod 700 "$CMP_DIR"

commit() {
  python3 - "$1" <<'PY'
import json, sys
doc = json.load(open("results/compare.json"))
name = sys.argv[1]
if name == "sello":
    print(doc["node"]["sello"]["commit"])
else:
    print(next(t["commit"] for t in doc["tools"] if t.get("tool") == name))
PY
}

fetch() {
  local dir="$1" url="$2" rev="$3"
  if [ ! -d "$CMP_DIR/$dir/.git" ]; then
    git clone --quiet "$url" "$CMP_DIR/$dir"
  fi
  git -C "$CMP_DIR/$dir" fetch --quiet origin
  git -C "$CMP_DIR/$dir" -c advice.detachedHead=false checkout --quiet "$rev"
  echo "$dir $(git -C "$CMP_DIR/$dir" rev-parse HEAD)"
}

fetch agent-flight-recorder "${AFR_REPO:-https://github.com/mpi-dsg/agent-flight-recorder}" "$(commit agent-flight-recorder)"
fetch novafabric "${NOVAFABRIC_REPO:-https://github.com/MSKazemi/novafabric}" "$(commit novafabric-capture)"
fetch sello "${SELLO_REPO:-https://github.com/juanfiguera/sello}" "$(commit sello)"
fetch janus "${JANUS_REPO:-https://github.com/mustafarslan/janus}" "$(commit janus)"
