# Backend — AI Business Intelligence Agent

FastAPI service that accepts CSV uploads and answers questions about the data using an LLM. Intent-routed chat internally dispatches to numeric analysis or chart generation.

## Stack

- **FastAPI** + **Uvicorn**
- **pandas** for tabular analysis, **matplotlib** for charts
- **SQLAlchemy + SQLite** for session persistence
- **OpenAI** (`gpt-4o-mini`) for code generation + natural-language answers
- **SlowAPI** for per-IP rate limiting
- **CORS** enabled for `http://localhost:5173` / `127.0.0.1:5173`

## Requirements

- Python 3.11+ (tested on 3.13)
- An OpenAI API key

## Setup

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env       # then edit .env and add your OPENAI_API_KEY
```

## Run

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

API base: `http://127.0.0.1:8000`
Interactive docs: `http://127.0.0.1:8000/docs`

## Endpoints

| Method | Path | Body / Params | Returns |
|---|---|---|---|
| `POST` | `/upload-csv` | multipart form, field `file` (CSV, ≤5 MB) | `{ status, file_id, info: { name, total_rows } }` |
| `GET` | `/files` | — | `[{ file_id, original_name, created_at }]` |
| `POST` | `/chat` | `{ file_id, question }` (3–200 chars) | `{ ai_answer, history_depth?, chart_url? }` |
| `POST` | `/analyze` | `{ file_id, question }` | `{ ai_answer, history_depth }` |
| `POST` | `/generate-chart` | `{ file_id, question }` | `{ chart_url, ai_answer, history_depth }` |
| `POST` | `/test-code` | query `file_id`, `code` | `{ result }` — debug only |
| `GET` | `/static/*.png` | — | generated chart image |

`/chat` is the production entrypoint. It classifies the user's intent as `CHART` / `ANALYZE` / `GENERAL` and routes internally — the client never needs to hit `/analyze` or `/generate-chart` directly.

## Rate limits

- `POST /upload-csv` — 5 requests / minute / IP
- `POST /chat` — 5 requests / minute / IP

Both return HTTP `429` when exceeded.

## Security

- File name is sanitized against path traversal (`..`, `/`).
- Only `.csv` extension is accepted; max size 5 MB.
- LLM-generated Python runs inside a locked-down `exec` sandbox — no `open`, no `eval`, no `os`/`shutil`, only a fixed set of safe builtins + `pd`, `plt`.
- Sessions auto-expire after 1 hour via `cleanup_old_sessions()` (fires on every upload as a background task).
- CORS is explicitly allow-listed; no wildcard origins.
- No secrets in source — all config comes from `.env`.

## Directory layout

```
backend/
├── main.py              # all routes + DB models (kept as one file for MVP clarity)
├── requirements.txt
├── .env                 # local only, NEVER commit
├── .env.example         # template
├── sessions.db          # SQLite — created at runtime, gitignored
├── uploads/             # user CSVs — created at runtime, gitignored
├── static/              # generated chart PNGs — created at runtime, gitignored
└── venv/                # local virtualenv, gitignored
```

## Known limitations

- SQLite is single-node only. For multi-instance deploys, swap `DATABASE_URL` to Postgres.
- Uploaded CSVs live on the local filesystem; for cloud deploys move `uploads/` and `static/` to object storage (S3/GCS).
- `/test-code` is a debug endpoint — remove or lock down before production exposure.
- The chart generator asks the LLM to emit `plt.savefig(<path>)`. If the LLM disobeys the path, the endpoint returns HTTP 500 with a clear message.
