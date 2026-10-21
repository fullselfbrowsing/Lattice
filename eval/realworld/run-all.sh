#!/usr/bin/env bash
# Re-run the real-model evaluation. Requires Ollama on 127.0.0.1:11434 with
# llama3.2:3b already pulled, Node 24, and the comparison checkouts named in
# scripts/04-compare.py. Dataset texts are cached in $REALWORLD_CACHE and are
# not written into the repository.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="${NODE24:-/home/ubuntu/.nvm/versions/node/v24.22.1/bin}:$HOME/.local/bin:$PATH"
export REALWORLD_CACHE="${REALWORLD_CACHE:-/tmp/realworld-data}"
node eval/realworld/scripts/01-live.mjs
python3 eval/realworld/scripts/02-prepare.py
node eval/realworld/scripts/02-score.mjs
python3 eval/realworld/scripts/04-compare.py
python3 eval/realworld/scripts/05-charts.py
