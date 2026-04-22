# AI Business Intelligence & Task Agent

Chat with your CSV data. Upload a spreadsheet, ask questions in natural language, and get instant numeric answers or auto-generated charts.

![Stack: FastAPI + React + OpenAI](https://img.shields.io/badge/stack-FastAPI%20%7C%20React%20%7C%20OpenAI-blue)

---

## What's inside

| Path | What it is |
|---|---|
| [backend/](./backend/) | FastAPI service — CSV upload, sandboxed Python execution, OpenAI-powered analysis + chart generation, SQLite session store |
| [frontend/](./frontend/) | React 18 + TypeScript + Tailwind + Axios UI — chat window, sidebar file history, upload with progress, markdown rendering, inline charts |

Both services are fully documented in their own READMEs.

---

## Quick start

### 1. Prerequisites

- **Python 3.11+**
- **Node.js 18+** and **npm**
- An **OpenAI API key**

### 2. Clone & configure

```bash
git clone <this-repo>
cd AI-Business-Intelligence-Task-Agent
```

Create the backend env file:

```bash
cp backend/.env.example backend/.env
# edit backend/.env and paste your OPENAI_API_KEY
```

### 3. Install

```bash
# backend
cd backend
python -m venv venv
# Windows: venv\Scripts\activate       macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cd ..

# frontend
cd frontend
npm install
cd ..
```

### 4. Run (two terminals)

**Terminal A — backend**
```bash
cd backend
# Windows: venv\Scripts\activate       macOS/Linux: source venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal B — frontend**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173.

### One-command startup

If you want both services up with a single command:

- Windows (PowerShell/cmd): `./start.bat`
- macOS/Linux: `./start.sh`

Both scripts start the backend + frontend in parallel and stream their logs.

---

## How it works

```
┌──────────────┐      multipart upload        ┌────────────────────────────┐
│              │ ─────────────────────────▶   │ POST /upload-csv           │
│              │                              │  → validates + stores CSV  │
│              │                              │  → returns file_id         │
│   Browser    │                              └────────────────────────────┘
│  (React +    │
│   Tailwind)  │      { file_id, question }   ┌────────────────────────────┐
│              │ ─────────────────────────▶   │ POST /chat                 │
│              │                              │  1. intent classify        │
│              │                              │  2. dispatch to            │
│              │                              │     • /analyze  (numbers)  │
│              │                              │     • /generate-chart (png)│
│              │  ◀───── text + optional      └────────────────────────────┘
│              │         chart_url                    │
└──────────────┘                                      ▼
                                              ┌────────────────────────────┐
                                              │ OpenAI gpt-4o-mini         │
                                              │  (generates pandas/plt     │
                                              │   code, then natural-      │
                                              │   language answer)         │
                                              └────────────────────────────┘
                                                      │
                                              ┌────────────────────────────┐
                                              │ Sandboxed exec()           │
                                              │ (locked builtins, df+pd+   │
                                              │  plt only)                 │
                                              └────────────────────────────┘
```

---

## Security

- **CORS** allow-list locked to localhost dev ports — update for production.
- **Rate limits**: 5/min on upload + chat per IP.
- **Sandboxed code execution** — no `open`, `eval`, `exec`, `os`, `shutil`; only `pd`, `plt`, `df`, and a fixed set of safe builtins.
- **File validation** (both client + server): `.csv` only, ≤5 MB, no path-traversal names.
- **Front-end sanitization** — all markdown is DOMPurified; chart `<img>` sources are origin-pinned to the API.
- **CSP meta** tag restricts script/connect/image origins.
- **Secrets** are read from `backend/.env` (git-ignored); example file in `backend/.env.example`.

### Before handing off to a client

- [ ] Rotate your OpenAI API key and put the new one in `backend/.env`.
- [ ] Confirm `backend/.env` is not in any commit (`git ls-files | grep .env`).
- [ ] Purge `backend/sessions.db`, `backend/uploads/`, `backend/static/*.png` if they contain real user data.
- [ ] Review CORS allow-list in [backend/main.py](./backend/main.py) — add your production origin.
- [ ] Remove or protect `/test-code` (debug endpoint).

---

## Testing

Backend (integration, uses mocked OpenAI):
```bash
cd backend
./venv/Scripts/python -m pytest     # if you add tests
```

Frontend (Vitest + Testing Library):
```bash
cd frontend
npm run test
```

---

## Deployment notes

- **SQLite is dev-only**. Swap `DATABASE_URL` for Postgres when you go multi-instance.
- **`uploads/` and `static/`** live on local disk. In cloud deploys, move them to S3/GCS and serve via signed URLs.
- **Frontend** is fully static after `npm run build` — drop `frontend/dist/` onto any static host (Vercel, Netlify, S3+CloudFront, nginx).
- **Backend** runs well under `uvicorn --workers N` behind nginx. For containerization, a minimal `Dockerfile` can be added on request.

---

## License

Proprietary — client delivery.
# AI-Business-Intelligence-Task-Agent-full-with-frontend
