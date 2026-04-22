import os
import shutil
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, BackgroundTasks
import pandas as pd
from pydantic import BaseModel, Field, field_validator
from dotenv import load_dotenv
import openai
import io
import contextlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import logging
import time
from sqlalchemy import Column, String, Text, Float, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, declarative_base
import json
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request


DATABASE_URL = "sqlite:///./sessions.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# DB lentelės modelis
class SessionModel(Base):
    __tablename__ = "sessions"
    file_id = Column(String, primary_key=True, index=True)
    original_name = Column(String)
    storage_path = Column(String)
    columns_json = Column(Text) # Saugosime kaip JSON tekstą
    history_json = Column(Text) # Saugosime kaip JSON tekstą
    created_at = Column(Float)

# Sukuriame lentelę, jei jos nėra
Base.metadata.create_all(bind=engine)

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="AI Business Intelligence Agent")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("BI-Agent")




# 1. Užkrauname konfigūraciją
load_dotenv()
client = openai.OpenAI()

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB riba

# 2. Sukuriame programėlę (Geriausia rašyti čia, viršuje)


SESSION_TTL_SECONDS = 3600  # 1 hour


def cleanup_old_sessions():
    """Ištrina DB sesijas ir failus, senesnius nei SESSION_TTL_SECONDS."""
    now = time.time()
    db = SessionLocal()
    try:
        stale = (
            db.query(SessionModel)
            .filter(SessionModel.created_at < now - SESSION_TTL_SECONDS)
            .all()
        )
        for s in stale:
            try:
                if s.storage_path and os.path.exists(s.storage_path):
                    os.remove(s.storage_path)
                    logger.info(f"Ištrintas senas failas: {s.storage_path}")
            except OSError as exc:
                logger.warning(f"Nepavyko pašalinti {s.storage_path}: {exc}")
            db.delete(s)
            logger.info(f"Sesija {s.file_id} pašalinta iš DB.")
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"cleanup_old_sessions klaida: {exc}")
    finally:
        db.close()

def run_python_code(code_string, df):
    output = io.StringIO()
    
    # 1. Sukuriame "Saugų žodyną" bazinėms funkcijoms
    # Mes leidžiame tik nekaltas funkcijas (print, len, range, ir t.t.)
    # Bet mes NELEIDŽIAME 'import', 'open', 'eval', 'exec', 'getattr'
    safe_builtins = {
        'print': print,
        'len': len,
        'range': range,
        'str': str,
        'int': int,
        'float': float,
        'list': list,
        'dict': dict,
        'sum': sum,
        'min': min,
        'max': max,
        'round': round,
        '__import__': __import__,  # BŪTINA, kad veiktų matplotlib/pandas vidiniai procesai
        'getattr': getattr,        # Reikalinga objektų savybėms pasiekti
        'setattr': setattr         # Reikalinga kai kuriems grafikų nustatymams
    }

    # 2. Apibrėžiame, ką AI gali matyti (tik df ir pd)
    # Mes griežtai pasakome: jokių 'os', 'shutil' ar kitų modulių
    local_vars = {
        "df": df, 
        "pd": pd,
        "plt": plt # Dabar AI galės naudoti plt.plot(), plt.bar() ir t.t.
    }
    
    # 3. 'globals' žodynas bus tuščias, išskyrus mūsų saugius 'builtins'
    safe_globals = {
        "__builtins__": safe_builtins
    }
    
    try:
        with contextlib.redirect_stdout(output):
            # Naudojame standartinius builtins, kad veiktų metodų iškvietimai (kaip plt.savefig)
            # Bet AI vis tiek neturi 'import' galimybės, nes mes neperduodame 'os' ar 'shutil'
            exec(code_string, {"__builtins__": safe_builtins}, local_vars)
        return output.getvalue()
    except Exception as e:
        # Štai čia pridėk print, kad matytum klaidą terminale, jei kodas nepavyks
        print(f"KLAIDA VYKDANT KODĄ: {e}")
        return f"Saugumo klaida arba kodo klaida: {str(e)}"

# 3. Modelis užklausoms
class AnalysisRequest(BaseModel):
    file_id: str
    question: str = Field(..., min_length=1, max_length=200) # Apribojame iki 200 simbolių

    @field_validator('question')
    @classmethod
    def sanitize_question(cls, v):
        # Pašaliname galimai pavojingus simbolius arba tiesiog išvalome tarpus
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Klausimas per trumpas.")
        return v


STATIC_DIR = "static"
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR)

# Pasakome FastAPI, kad šis aplankas yra viešas (per naršyklę)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# 4. Konfigūracija failams
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)


@app.post("/upload-csv")
@limiter.limit("5/minute")
async def upload_csv(
    request: Request, file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    # 1. Patikriname failo dydį prieš jį apdorodami
    if background_tasks:
        background_tasks.add_task(cleanup_old_sessions)
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Failas per didelis. Maksimalus dydis - 5MB.")

    # 2. Sanitizuojame failo pavadinimą (apsauga nuo Path Traversal)
    if ".." in file.filename or "/" in file.filename:
         raise HTTPException(status_code=400, detail="Nesaugus failo pavadinimas.")
    # IŠTAISYTA: HTTPException (buvo be 'c')
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="You can only use CSV type files")
    
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.csv")

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        df = pd.read_csv(file_path)
        df.columns = [c.lower() for c in df.columns]

        db = SessionLocal()
        new_session = SessionModel(
            file_id=file_id,
            original_name=file.filename,
            storage_path=file_path,
            columns_json=json.dumps(df.columns.tolist()),
            history_json=json.dumps([]),
            created_at=time.time()
        )
        db.add(new_session)
        db.commit()
        db.close()
        
        logger.info(f"Sėkmingai apdorotas failas: {file.filename}, ID: {file_id}")
        
        return {
            "status": "Success",
            "file_id": file_id,
            "info": { "name": file.filename, "total_rows": len(df) }
        }
    except Exception as e:
        # --- IR ČIA (Klaidų gaudymui) ---
        logger.error(f"KLAIDA apdorojant {file.filename}: {str(e)}")
        
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail="Serverio klaida apdorojant failą")

@app.get("/files")
async def list_files():
    db = SessionLocal()
    # Paimame visus įrašus iš DB
    db_sessions = db.query(SessionModel).all()
    db.close()
    
    # Grąžiname juos vartotojui (suformuojame gražų sąrašą)
    return [
        {
            "file_id": s.file_id, 
            "original_name": s.original_name, 
            "created_at": s.created_at
        } for s in db_sessions
    ]

@app.post("/analyze")
async def analyze_data(request: AnalysisRequest):
    db = SessionLocal()
    
    # 1. Ieškome sesijos
    db_session = db.query(SessionModel).filter(SessionModel.file_id == request.file_id).first()
    
    if not db_session:
        db.close()
        raise HTTPException(status_code=404, detail="Failas DB nerastas.")

    # 2. Išpakuojame stulpelius ir istoriją
    columns = json.loads(db_session.columns_json)
    history = json.loads(db_session.history_json)
    file_path = db_session.storage_path
    
    # Paruošiame stulpelius prompt'ui
    lowered_cols = [c.lower() for c in columns]

    # 3. Skaitome duomenis
    df = pd.read_csv(file_path)
    df.columns = [c.lower() for c in df.columns]

    # Sukuriame kategorijų pavyzdžius iš teksto stulpelių (iki 10 unikalių reikšmių)
    categorical_samples = {}
    for col in df.select_dtypes(include=["object", "category"]).columns:
        uniques = df[col].dropna().astype(str).unique().tolist()
        categorical_samples[col] = uniques[:10]

    try:
        prompt_for_code = f"""
        Tu esi tikslus programuotojas. Duomenų rėmas vadinasi 'df'.
        Stulpeliai: {', '.join(df.columns)}
        Kategorijų pavyzdžiai (naudok TIK šias reikšmes filtravimui): {categorical_samples}

        Vartotojo klausimas: "{request.question}"

        TAISYKLĖS:
        1. Jei klausime minimas regionas ar kategorija, surask atitikmenį viršuje pateiktuose pavyzdžiuose.
        2. Parašyk TIK vieną Python kodo eilutę, kuri apskaičiuoja atsakymą ir jį atspausdina su print().
        3. Rezultatas turi būti TIK skaičius arba trumpas tekstas.
        """
        code_res = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt_for_code}]
        )
        generated_code = code_res.choices[0].message.content.strip().replace("```python", "").replace("```", "")

        # ETAPAS B: Vykdymas
        calculation_result = run_python_code(generated_code, df)

        # ETAPAS C: Atsakymas su istorija
        # Vietoj get_contextual_messages naudojame tiesioginį sąrašą
        messages = [
        {"role": "system", "content": """Tu esi griežtas duomenų analitikas. 
        Tavo taisyklės:
        1. Atsakyk TIK remdamasis 'Kodo rezultatu'. 
        2. Jei rezultatas yra 0 ar tuščias, o vartotojas klausia apie pardavimus - sakyk, kad duomenų nėra arba jie klaidingi.
        3. Niekada nesugalvok skaičių pats. 
        4. Jei matai prieštaravimą tarp istorijos ir naujo rezultato, pasitikėk NAUJU rezultatu."""}
    ]
        messages.extend(history[-4:]) # Ribojame istoriją iki 4 žinučių, kad AI nepasimestų
        messages.append({
            "role": "user", 
            "content": f"Vartotojo klausimas: {request.question}. Kodo vykdymo rezultatas: {calculation_result}. Suformuluok tikslų atsakymą."
        })

        final_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages
        )

        ai_answer = final_response.choices[0].message.content

        # 4. Atnaujiname istoriją DB
        history.append({"role": "user", "content": request.question})
        history.append({"role": "assistant", "content": ai_answer})
        
        db_session.history_json = json.dumps(history)
        db.commit()
        
        return {
            "ai_answer": ai_answer,
            "history_depth": len(history)
        }

    except Exception as e:
        logger.error(f"Analizės klaida: {e}")
        raise HTTPException(status_code=500, detail="Klaida apdorojant duomenis.")
    finally:
        db.close()


@app.post("/test-code")
async def test_code(file_id: str, code: str):
    db = SessionLocal()
    try:
        db_session = db.query(SessionModel).filter(SessionModel.file_id == file_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Failas nerastas")

        df = pd.read_csv(db_session.storage_path)
        df.columns = [c.lower() for c in df.columns]
        result = run_python_code(code, df)
        return {"result": result}
    finally:
        db.close()

@app.post("/generate-chart")
async def generate_chart(request_data: AnalysisRequest, request: Request):
    db = SessionLocal()
    db_session = db.query(SessionModel).filter(SessionModel.file_id == request_data.file_id).first()
    
    if not db_session:
        db.close()
        raise HTTPException(status_code=404, detail="Failas nerastas.")

    # 1. PASIIMAME ISTORIJĄ
    history = json.loads(db_session.history_json)
    file_path = db_session.storage_path
    
    df = pd.read_csv(file_path)
    df.columns = [c.lower() for c in df.columns]

    # Iš anksto nustatome tikslų išsaugojimo kelią, kad AI grąžintų teisingą failą
    chart_filename = f"{uuid.uuid4()}.png"
    chart_path = os.path.join(STATIC_DIR, chart_filename)
    chart_path_for_code = chart_path.replace("\\", "/")  # saugu Windows/Linux

    # 2. SUDEDAME KONTEKSTĄ (Istorija + Dabartinis prašymas)
    messages = [{"role": "system", "content": "Tu esi grafikos ekspertas."}]
    messages.extend(history[-5:]) # Pridedame praeitį

    prompt_for_chart = f"""
    Remdamasis praeitais klausimais ir šiuo: "{request_data.question}",
    parašyk Python kodą (plt).
    Duomenys: df su stulpeliais {', '.join(df.columns)}.
    Kodas PRIVALO baigtis šiomis eilutėmis (tiksliai šis kelias):
    plt.savefig('{chart_path_for_code}')
    plt.close()
    Grąžink TIK kodą.
    """
    messages.append({"role": "user", "content": prompt_for_chart})

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages # Siunčiame visą paketą
        )
        chart_code = response.choices[0].message.content.strip().replace("```python", "").replace("```", "")

        run_python_code(chart_code, df)

        # Patikriname, ar grafikas tikrai sugeneruotas
        if not os.path.exists(chart_path):
            raise HTTPException(status_code=500, detail="Grafikas nebuvo sugeneruotas.")

        # 3. ĮRAŠOME Į ISTORIJĄ, KAD ŽINOTUME, JOG PIEŠĖME
        history.append({"role": "user", "content": request_data.question})
        history.append({"role": "assistant", "content": f"Sugeneravau grafiką pagal tavo užklausą."})

        db_session.history_json = json.dumps(history)
        db.commit()

        base_url = str(request.base_url).rstrip('/')
        return {
            "chart_url": f"{base_url}/static/{chart_filename}",
            "ai_answer": "Grafikas paruoštas.",
            "history_depth": len(history)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Grafiko kūrimo klaida: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.post("/chat")
@limiter.limit("5/minute")
async def chat_endpoint(request_data: AnalysisRequest, request: Request):
    # 1. DUOMENŲ BAZĖS PATIKRA
    db = SessionLocal()
    db_session = db.query(SessionModel).filter(SessionModel.file_id == request_data.file_id).first()
    
    if not db_session:
        db.close()
        logger.warning(f"Bandymas pasiekti neegzistuojantį file_id: {request_data.file_id}")
        raise HTTPException(status_code=404, detail="Failas duomenų bazėje nerastas. Įkelkite failą iš naujo.")
    
    db.close() # Uždarome DB ryšį prieš pradedant ilgą AI procesą

    # 2. INTENT RECOGNITION (Ketinimo atpažinimas)
    # Mes klausiame AI, kurį įrankį naudoti
    routing_prompt = f"""
    Vartotojo žinutė: "{request_data.question}"
    
    Tavo užduotis yra nuspręsti, koks yra vartotojo ketinimas. 
    Atsakyk TIK vienu žodžiu:
    - 'CHART' - jei vartotojas prašo nupiešti, sugeneruoti grafiką, diagramą ar vizualizaciją.
    - 'ANALYZE' - jei vartotojas klausia apie skaičius, faktus, vidurkius ar prašo analizės.
    - 'GENERAL' - jei tai pasisveikinimas ar bendras klausimas.
    """

    try:
        route_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": "Tu esi dispečeris."},
                      {"role": "user", "content": routing_prompt}]
        )
        intent = route_response.choices[0].message.content.strip().upper()
        logger.info(f"Atpažintas ketinimas: {intent}")

        # 3. MARŠRUTIZAVIMAS (Routing)
        if "CHART" in intent:
            # Perduodame request_data IR request objektą (reikalingas base_url)
            return await generate_chart(request_data, request)
            
        elif "ANALYZE" in intent:
            # Perduodame request_data (analyze_data funkcija nenaudoja request objekto)
            return await analyze_data(request_data)
            
        else:
            # Bendras atsakymas, jei tai nėra analizė ar grafikas
            return {
                "ai_answer": "Sveiki! Aš esu jūsų AI analitikas. Galiu suskaičiuoti jūsų duomenų vidurkius arba nupiešti grafiką. Ko pageidautumėte?"
            }

    except Exception as e:
        logger.error(f"Chat klaida: {str(e)}")
        raise HTTPException(status_code=500, detail="Įvyko klaida apdorojant jūsų užklausą.")


@app.delete("/delete-file/{file_id}")
async def delete_file(file_id: str, request: Request):
    db = SessionLocal()
    try:
        # 1. Patikriname ar failas egzistuoja
        file_record = db.query(FileRecord).filter(FileRecord.file_id == file_id).first()
        if not file_record:
            raise HTTPException(status_code=404, detail="Failas nerastas")

        # 2. Fizinis failo šalinimas
        file_path = os.path.join(UPLOAD_DIR, f"{file_id}.csv")
        if os.path.exists(file_path):
            os.remove(file_path)

        # 3. VALYMAS: Ištriname visą susirašinėjimo istoriją iš DB, susijusią su šiuo file_id
        # Kadangi 'history_json' saugomas tame pačiame 'FileRecord' (jei taip darei),
        # jis dings automatiškai ištrynus įrašą. 
        # Jei turi atskirą lentelę žinutėms - naudok:
        # db.query(ChatMessage).filter(ChatMessage.file_id == file_id).delete()

        # 4. Įrašo pašalinimas iš DB
        db.delete(file_record)
        db.commit()
        
        logging.info(f"PILNAS VALYMAS: Failas {file_id} ir jo istorija pašalinti.")
        return {"status": "success", "message": "Failas ir atmintis ištrinti"}
        
    except Exception as e:
        db.rollback()
        logging.error(f"Klaida trynimo metu: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)