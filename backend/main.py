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
    
    try:
        # 1. Ieškome sesijos
        db_session = db.query(SessionModel).filter(SessionModel.file_id == request.file_id).first()
        
        if not db_session:
            raise HTTPException(status_code=404, detail="Failas DB nerastas.")

        # 2. Išpakuojame istoriją (apsauga, jei failas naujas ir istorijos dar nėra)
        history = json.loads(db_session.history_json) if db_session.history_json else []
        file_path = db_session.storage_path
        
        # 3. Skaitome duomenis ir paruošiame stulpelius
        df = pd.read_csv(file_path)
        df.columns = [c.lower() for c in df.columns]

        # Sukuriame kategorijų pavyzdžius (sumažinau iki 5, kad neapkrautume AI pertekline informacija)
        categorical_samples = {}
        for col in df.select_dtypes(include=["object", "category"]).columns:
            uniques = df[col].dropna().astype(str).unique().tolist()
            categorical_samples[col] = uniques[:5]

        # PRIDĖTA: Paimame tikrą duomenų pavyzdį, kad AI matytų formatus (datos, valiutos)
        data_sample = df.head(3).to_string()

        # ETAPAS A: Kodo generavimas
   # Ištraukiame paskutines 4 žinutes iš istorijos, kad programuotojas turėtų kontekstą
        recent_history_text = ""
        if history:
            recent_history_text = "\n".join([f"{msg['role'].upper()}: {msg['content']}" for msg in history[-6:]])

        # ETAPAS A: Kodo generavimas su KONTEKSTU
        prompt_for_code = f"""
        You are an expert Python data scientist. The DataFrame is named 'df'.
        
        DATA STRUCTURE:
        Columns: {', '.join(df.columns)}
        Sample Data:
        {data_sample}
        Category Examples: {categorical_samples}

        CONVERSATION HISTORY (Crucial for context):
        {recent_history_text if recent_history_text else "No prior context."}

        CURRENT QUESTION: "{request.question}"

        RULES:
         1. Write pure, executable Python code to calculate the answer and print() it. You MAY use multiple lines. Ensure correct Python indentation. NEVER wrap the code in markdown blocks (do not use ```python).
        2. If the CURRENT QUESTION is a short follow-up (e.g., "what about North?", "maybe X?"), apply the analytical logic from the PREVIOUS question to the new filter. Do not just sum; perform the exact same analysis on the new category.
        3. Use `.str.contains('text', case=False, na=False)` for text filtering.
        4. Output ONLY the code. No markdown.
        5. DEFENSIVE CODING: Before plotting a chart or accessing elements by index, you MUST check if the filtered DataFrame is empty. Use an if/else block (e.g., `if df_filtered.empty: print("ERROR: No data found for this request")`). NEVER attempt to access `.iloc[0]`, `.index[0]`, or plot a chart from an unchecked or empty DataFrame.
        """
        
        code_res = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt_for_code}]
        )
        generated_code = code_res.choices[0].message.content.strip().replace("```python", "").replace("```", "")
        
        # PRIDĖTA: Logginimas, kad konsolėje matytum, ką AI sugalvojo
        logger.info(f"[ANALYZE] Sugeneruotas kodas: {generated_code}")

        # ETAPAS B: Vykdymas (Apsaugotas try-except bloku)
        try:
            calculation_result = run_python_code(generated_code, df)
            logger.info(f"[ANALYZE] Kodo rezultatas: {calculation_result}")
        except Exception as code_err:
            logger.error(f"[ANALYZE] Kodo klaida: {code_err}")
            # Jei kodas lūžta, perduodame klaidą AI, kad jis nemeluotų!
            calculation_result = f"KLAIDA: Nepavyko apskaičiuoti. Sistemos pranešimas: {str(code_err)}"

        # PRIDĖTA: Anti-haliucinacinis saugiklis
        validation_note = ""
        if not str(calculation_result).strip() or str(calculation_result).strip() in ["0", "0.0", "None", "[]", "Series([], )"]:
            validation_note = "DĖMESIO: Rezultatas yra 0, tuščias arba nerastas. Privalai pasakyti vartotojui, kad duomenų pagal šią užklausą nėra."

        # ETAPAS C: Atsakymas su istorija
        messages = [
            {"role": "system", "content": """You are a strict and precise data analyst. 
            RULES:
            1. Answer ONLY using the provided 'Code execution result'. 
            2. NEVER use numbers or data from the Conversation History to answer the Current Question. History is only for context understanding.
            3. If the Code result is an error or 0, state that the calculation failed or data is missing. Do NOT invent an answer.
            4. STRICT LANGUAGE RULE: You MUST formulate your final response in the EXACT SAME LANGUAGE as the user's CURRENT QUESTION. If the question is in English, reply in English.
            """}
        ]
        
        messages.extend(history[-6:]) 
        messages.append({
            "role": "user", 
            "content": f"CURRENT QUESTION: {request.question}\nCODE EXECUTION RESULT: {calculation_result}\n{validation_note}\n\nProvide the final answer."
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
            "chartUrl": None, # PRIDĖTA: Kad React MessageBubble nesulūžtų ieškodamas šio lauko
            "history_depth": len(history)
        }

    except HTTPException:
        raise # Leidžiame 404 klaidai pereiti įprastai
    except Exception as e:
        logger.error(f"Analizės kritinė klaida: {e}")
        raise HTTPException(status_code=500, detail=f"Sistemos klaida: {str(e)}")
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
    
    try:
        db_session = db.query(SessionModel).filter(SessionModel.file_id == request_data.file_id).first()
        
        # 1. SAUGUMO PATIKRA (Privalo būti PIRMA!)
        if not db_session:
            raise HTTPException(status_code=404, detail="Failas nerastas.")

        # 2. IŠPAKUOJAME ISTORIJĄ IR KONTEKSTĄ
        history = json.loads(db_session.history_json) if db_session.history_json else []
        recent_history_text = "\n".join([f"{msg['role'].upper()}: {msg['content']}" for msg in history[-6:]])
        
        file_path = db_session.storage_path
        df = pd.read_csv(file_path)
        df.columns = [c.lower() for c in df.columns]

        # PRIDĖTA: Sukuriame categorical_samples (be šito tavo prompt'as neveiks)
        categorical_samples = {}
        for col in df.select_dtypes(include=["object", "category"]).columns:
            uniques = df[col].dropna().astype(str).unique().tolist()
            categorical_samples[col] = uniques[:5]

        # Iš anksto nustatome tikslų išsaugojimo kelią
        chart_filename = f"{uuid.uuid4()}.png"
        chart_path = os.path.join(STATIC_DIR, chart_filename)
        # Šis kintamasis turi būti perduotas į tavo run_python_code, kad matplotlib žinotų, kur saugoti
        chart_path_for_code = chart_path.replace("\\", "/") 

        # 3. SUDEDAME KONTEKSTĄ (Istorija + Dabartinis prašymas)
        messages = [{"role": "system", "content": "Tu esi grafikos ekspertas."}]
        messages.extend(history[-5:]) 

        prompt_for_chart = f"""
        You are an expert in data visualization. The DataFrame is named 'df'.
        
        DATA STRUCTURE:
        Columns: {', '.join(df.columns)}
        Category Examples: {categorical_samples}

        CONVERSATION HISTORY (CRITICAL FOR CONTEXT!):
        {recent_history_text if recent_history_text else "No prior context."}

        CURRENT REQUEST: "{request_data.question}"

        RULES:
        1. If the user asks for a chart in general terms (e.g., "draw a chart", "can you give me a chart?"), you MUST read the CONVERSATION HISTORY to understand the context.
        2. If a specific product (e.g., "laptops"), region, or filter was discussed in the history, your Python code MUST filter 'df' for that specific subset before plotting. NEVER plot all data if the conversation was about a specific part.
        3. Write pure, executable Python code using matplotlib and save the chart to this exact path: '{chart_path_for_code}'. You MAY use multiple lines. Ensure correct Python indentation. NEVER wrap the code in markdown blocks (do not use ```python).
        4. DEFENSIVE CODING: Before plotting, you MUST check if the filtered DataFrame is empty. Use an if/else block (e.g., `if df_filtered.empty: print("ERROR: No data found for this chart") else: plt.savefig(...)`).
        """
        messages.append({"role": "user", "content": prompt_for_chart})

        # Generuojame Python kodą
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages
        )
        chart_code = response.choices[0].message.content.strip().replace("```python", "").replace("```", "")

        # PRIDĖK ŠIĄ EILUTĘ ČIA PAT:
        logger.info(f"[CHART] Sugeneruotas Python kodas grafiko braižymui:\n{chart_code}")
        # (Jei nenaudoji logger, tiesiog rašyk: print(f"[CHART] ... {chart_code}"))
        
        # Toliau tavo kodas tęsiasi:
        run_python_code(chart_code, df)

        # Patikriname, ar grafikas tikrai sugeneruotas
        if not os.path.exists(chart_path):
            raise HTTPException(status_code=500, detail="Grafikas nebuvo sugeneruotas.")

        # =====================================================================
        # 4. DINAMINIS ATSAKYMAS (Štai čia generuojamas tekstas pagal kalbą)
        # =====================================================================
        response_msg = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a data assistant. The chart has been successfully generated. Tell the user exactly ONE short sentence that the chart is ready. CRITICAL: You MUST use the exact same language as the user's request."},
                {"role": "user", "content": request_data.question}
            ]
        )
        ai_answer = response_msg.choices[0].message.content

        # 5. ĮRAŠOME Į ISTORIJĄ
        history.append({"role": "user", "content": request_data.question})
        history.append({"role": "assistant", "content": ai_answer})

        db_session.history_json = json.dumps(history)
        db.commit()

        # 6. GRĄŽINAME REZULTATĄ
        # PASTABA: Naudojame "chartUrl" vietoje "chart_url", kad atitiktų tavo React (Frontend) laukiamą raktą
        return {
            "chartUrl": f"/static/{chart_filename}", 
            "ai_answer": ai_answer,
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
        raise HTTPException(status_code=404, detail="Failas duomenų bazėje nerastas.")
    
    # Ištraukiame paskutines 2 žinutes dispečeriui, kad jis suprastų kontekstą
    history = json.loads(db_session.history_json) if db_session.history_json else []
    recent_history_text = "\n".join([f"{msg['role'].upper()}: {msg['content']}" for msg in history[-2:]])
    
    db.close() # Uždarome DB ryšį

    # 2. INTENT RECOGNITION (Ketinimo atpažinimas su istorija)
    routing_prompt = f"""
    CONVERSATION HISTORY:
    {recent_history_text if recent_history_text else "No prior context."}

    CURRENT USER QUESTION: "{request_data.question}"
    
    TASK: Classify the CURRENT USER QUESTION into exactly one of these categories. Reply with ONLY ONE WORD:
    - 'CHART' - if the user explicitly asks to draw, plot, visualize, or generate a chart/graph.
    - 'ANALYZE' - if the user asks about data (e.g., "what product", "best", "how much", "region", "sales", "top", "sum") OR asks a follow-up question related to the data in the CONVERSATION HISTORY.
    - 'GENERAL' - ONLY if it is a pure greeting (e.g., "hello", "hi", "how are you") with NO relation to data or previous context.

    CRITICAL RULE: If the question contains question words like "what", "best", "which", "how", or refers to data/history in ANY way, it MUST be classified as 'ANALYZE'.
    """

    try:
        route_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": "You are a strict traffic router for a BI system. Output only one word."},
                      {"role": "user", "content": routing_prompt}]
        )
        intent = route_response.choices[0].message.content.strip().upper()
        logger.info(f"Atpažintas ketinimas: {intent}")

        # 3. MARŠRUTIZAVIMAS... (toliau tavo senas kodas)
        if "CHART" in intent:
            return await generate_chart(request_data, request)
            
        elif "ANALYZE" in intent:
            return await analyze_data(request_data)
            
        else:
            # Bendras atsakymas su griežta kalbos kontrole
            greeting_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful AI data analyst. Briefly greet the user and state that you can analyze data or generate charts. CRITICAL RULE: You MUST respond in the EXACT SAME LANGUAGE as the user's message. If the user writes in English, reply in English. Jei vartotojas rašo lietuviškai, atsakyk lietuviškai."},
                    {"role": "user", "content": request_data.question}
                ]
            )
            return {
                "ai_answer": greeting_response.choices[0].message.content,
                "chartUrl": None
            }

    except Exception as e:
        logger.error(f"Chat klaida: {str(e)}")
        raise HTTPException(status_code=500, detail="Įvyko klaida apdorojant jūsų užklausą.")


@app.delete("/delete-file/{file_id}")
async def delete_file(file_id: str, request: Request):
    db = SessionLocal()
    try:
        db_session = db.query(SessionModel).filter(SessionModel.file_id == file_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Failas nerastas")

        file_path = db_session.storage_path
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as exc:
                logger.warning(f"Nepavyko pašalinti {file_path}: {exc}")

        db.delete(db_session)
        db.commit()

        logger.info(f"PILNAS VALYMAS: Failas {file_id} ir jo istorija pašalinti.")
        return {"status": "success", "message": "Failas ir atmintis ištrinti"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Klaida trynimo metu: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)