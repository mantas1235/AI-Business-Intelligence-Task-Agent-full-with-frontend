@echo off
REM Starts backend + frontend in parallel terminals.
setlocal

if not exist backend\.env (
  echo ERROR: backend\.env is missing. Copy backend\.env.example and add your OPENAI_API_KEY.
  exit /b 1
)

if not exist backend\venv\Scripts\python.exe (
  echo ERROR: backend\venv is missing. Create it with: python -m venv backend\venv ^&^& backend\venv\Scripts\pip install -r backend\requirements.txt
  exit /b 1
)

if not exist frontend\node_modules (
  echo ERROR: frontend\node_modules is missing. Run: cd frontend ^&^& npm install
  exit /b 1
)

start "BI Agent backend" cmd /k "cd backend && venv\Scripts\python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"
start "BI Agent frontend" cmd /k "cd frontend && npm run dev"

echo Both services starting. Backend: http://127.0.0.1:8000   Frontend: http://localhost:5173
endlocal
