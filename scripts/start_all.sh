#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found; please install Python 3" >&2
  exit 1
fi

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate

pip install -r scripts/requirements-pythainlp.txt >/dev/null

TOKENIZER_HOST=${TOKENIZER_HOST:-127.0.0.1}
TOKENIZER_PORT=${TOKENIZER_PORT:-3000}
export TOKENIZER_URL="http://${TOKENIZER_HOST}:${TOKENIZER_PORT}${TOKENIZER_PATH:-/tokenize}"

UVICORN_CMD=(uvicorn scripts.pythainlp_tokenizer_service:app --host "$TOKENIZER_HOST" --port "$TOKENIZER_PORT")

"${UVICORN_CMD[@]}" &
UVICORN_PID=$!

cleanup() {
  if kill -0 "$UVICORN_PID" >/dev/null 2>&1; then
    kill "$UVICORN_PID"
  fi
}
trap cleanup EXIT INT TERM

echo "PyThaiNLP tokenizer running at ${TOKENIZER_URL}" >&2
echo "Starting Node backend..." >&2
node server.js
