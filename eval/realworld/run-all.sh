#!/usr/bin/env bash
# Re-run the real-model evaluation. Every step re-measures; nothing here is a
# mock. Dataset texts are cached in $REALWORLD_CACHE and are not written into
# the repository. Build the library first (pnpm build) so packages/lattice/dist
# exists.
#
# Steps and what each needs:
#   01-live.mjs             Ollama on 127.0.0.1:11434 with llama3.2:3b pulled.
#   02-prepare.py           pyarrow. With --download, huggingface_hub and network;
#                           otherwise the three source files already in the cache.
#   02-score.mjs            The cache written by 02-prepare.py.
#   03-wrap.mjs             Run by 04-compare.py. Needs the Sello checkout.
#   04-compare.py           fetch-competitors.sh checkouts in $CMP_DIR, cosign on
#                           PATH or $COSIGN_BIN, the nova CLI, Go for Janus, and
#                           opentelemetry-sdk, in-toto, securesystemslib.
#   05-charts.py            matplotlib and numpy. Offline; reads results/*.json.
#   06-lattice-spans.mjs    Run by 06-pii-tools.py. The dataset cache.
#   06-pii-tools.py         The dataset cache, presidio-analyzer, spaCy with
#                           en_core_web_sm, gliner. PII_SKIP_LLM_GUARD=1 leaves LLM
#                           Guard to the next step.
#   06-llm-guard-only.py    llm-guard. Windows long documents, one process per batch.
#   07-cite.py              The dataset cache. --nli also needs transformers and torch.
#   08-gateways.py          Ollama, litellm, langchain-openai, traceloop-sdk, and a
#                           Portkey gateway on 127.0.0.1:8787.
#   09-tamper-classes.py    $CMP_DIR checkouts and node. Reads compare.json.
#   09-lattice-mutations.mjs Run by 09-tamper-classes.py.
#   10-openrouter.mjs       OPENROUTER_API_KEY or OPENROUTER_KEY_FILE. Calls only
#                           :free models.
#   11-rescore-lattice.py   Optional. Re-scores the Lattice row of pii-tools.json
#                           from the span file without re-running other detectors.
#   12-charts.py            matplotlib and numpy. Offline; reads results/*.json.
#
# By default this runs 01-05. RUN_BROAD=1 also runs 06-12 (10 only when an
# OpenRouter key is set). Python packages: requirements-realworld.txt.
set -euo pipefail
cd "$(dirname "$0")/../.."

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [ -z "$NODE_BIN" ]; then
  echo "node not found; set NODE_BIN" >&2
  exit 1
fi
export NODE_BIN
export PATH="$(dirname "$NODE_BIN"):$HOME/.local/bin:$PATH"
PYTHON="${PYTHON:-python3}"
export REALWORLD_CACHE="${REALWORLD_CACHE:-/tmp/realworld-data}"
export CMP_DIR="${CMP_DIR:-$PWD/eval/realworld/.cache/cmp}"
S=eval/realworld/scripts

"$NODE_BIN" "$S/01-live.mjs"
"$PYTHON" "$S/02-prepare.py" ${PREPARE_ARGS:-}
"$NODE_BIN" "$S/02-score.mjs"
"$PYTHON" "$S/04-compare.py"
"$PYTHON" "$S/05-charts.py"

if [ "${RUN_BROAD:-0}" = "1" ]; then
  PII_SKIP_LLM_GUARD=1 "$PYTHON" "$S/06-pii-tools.py"
  "$PYTHON" "$S/06-llm-guard-only.py"
  "$PYTHON" "$S/07-cite.py" --nli
  "$PYTHON" "$S/08-gateways.py"
  "$PYTHON" "$S/09-tamper-classes.py"
  if [ -n "${OPENROUTER_API_KEY:-}${OPENROUTER_KEY_FILE:-}" ]; then
    "$NODE_BIN" "$S/10-openrouter.mjs"
  fi
  "$PYTHON" "$S/12-charts.py"
fi
