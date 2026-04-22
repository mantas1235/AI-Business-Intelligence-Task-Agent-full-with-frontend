#!/usr/bin/env bash
# Starts backend + frontend in parallel; streams logs to stdout.
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f backend/.env ]]; then
  echo "ERROR: backend/.env is missing. Copy backend/.env.example and add your OPENAI_API_KEY." >&2
  exit 1
fi

if [[ ! -x backend/venv/bin/python && ! -x backend/venv/Scripts/python.exe ]]; then
  echo "ERROR: backend/venv is missing. Run: python -m venv backend/venv && backend/venv/bin/pip install -r backend/requirements.txt" >&2
  exit 1
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "ERROR: frontend/node_modules is missing. Run: (cd frontend && npm install)" >&2
  exit 1
fi

PY_BIN="backend/venv/bin/python"
[[ -x "$PY_BIN" ]] || PY_BIN="backend/venv/Scripts/python.exe"

pids=()
trap 'echo; echo "Stopping..."; kill "${pids[@]}" 2>/dev/null || true; exit 0' INT TERM

echo "[backend]  starting on http://127.0.0.1:8000"
( cd backend && "../$PY_BIN" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 ) 2>&1 | sed 's/^/[backend]  /' &
pids+=($!)

echo "[frontend] starting on http://localhost:5173"
( cd frontend && npm run dev ) 2>&1 | sed 's/^/[frontend] /' &
pids+=($!)

wait
