# AI Business Intelligence — Frontend

A React + TypeScript + Tailwind + Axios frontend for the FastAPI backend in `../backend`.

## Features

- CSV upload with client-side validation (extension, MIME, size ≤ 5 MB, path-traversal guard)
- Upload progress bar (via `axios` `onUploadProgress`)
- Chat interface that calls the intent-routing `/chat` endpoint
- Automatic rendering of chart images when the backend returns `chart_url`
- Sidebar with file history from `GET /files` + upload button
- Active `file_id` + per-file transcript persisted in `localStorage` (survives refresh)
- Markdown rendering (sanitized with DOMPurify) for AI text
- Responsive layout (mobile drawer sidebar, desktop sidebar, tablet/desktop chat pane)
- Accessible: ARIA labels, roles, focus rings, keyboard send (Enter / Shift+Enter)
- Unit + component + integration tests via Vitest + Testing Library
- CSP meta tag hardening

## Backend endpoints used

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/upload-csv` | multipart upload (field: `file`) |
| `GET` | `/files` | list uploaded files |
| `POST` | `/chat` | intent-routed chat (analyze / chart / general) |
| `GET` | `/static/*.png` | rendered charts |

The backend also exposes `/analyze` and `/generate-chart`, but `/chat` already routes to them internally, so the frontend only calls `/chat`.

## Setup

```bash
cd frontend
cp .env.example .env        # optional — default points at 127.0.0.1:8000
npm install
npm run dev
```

App opens at http://localhost:5173.

### One-time backend change required: CORS

The backend does not enable CORS yet. Add this near the top of `backend/main.py` (after `app = FastAPI(...)`):

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Scripts

```bash
npm run dev        # dev server
npm run build      # type-check + production build
npm run preview    # serve the built bundle
npm run test       # run the full Vitest suite once
npm run test:watch # watch mode
```

## Project structure

```
src/
├── api/          axios client + endpoint wrappers
├── components/   presentational + UI components
├── hooks/        useChat, useFiles, useSession
├── pages/        Home (single page for MVP)
├── types/        shared TS interfaces
├── utils/        validators, URL helpers, localStorage
├── test/         vitest + RTL suites
├── App.tsx       root
└── main.tsx      React entry
```

## Known backend quirks (not modified)

- `/analyze` references an undefined `categorical_samples` — requests that reach the analyze path will 500 until it's defined.
- `/generate-chart` references an undefined `chart_filename` when building the response URL — chart requests will 500 until a filename is assigned before `plt.savefig`.
- Only the `/chat` entrypoint is used from the frontend.

## Security notes

- All assistant markdown is sanitized with DOMPurify (scripts, event handlers, inline styles stripped).
- Chart `<img src>` values are restricted to the API origin and `/static/` path.
- Upload input is locked to `.csv` and validated by extension, MIME, size, and name safety.
- CSP meta tag restricts `script-src`, `connect-src`, and `img-src` to local + API origin.
- `axios` has no `withCredentials` (backend has no auth yet) so cookies are not sent cross-origin.
- Rate-limit (`429`) errors from the backend are surfaced with a clear message.

## SEO

- `<title>`, `<meta name="description">`, Open Graph, Twitter card, and `theme-color` included in `index.html`.
- Semantic `<main>`, `<aside>`, `<section>`, `<header>`, `<nav>`, `<form>` landmarks.
