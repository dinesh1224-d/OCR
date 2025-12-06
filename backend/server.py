from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import io
import base64

# Import our custom modules (fail independently so one missing dependency doesn't block the other)
try:
    from ocr_engine import OCREngine
except ImportError as exc:
    logging.error(f"Failed to import OCREngine: {exc}")
    OCREngine = None  # type: ignore

try:
    from rag_pipeline import RAGPipeline
except ImportError as exc:
    logging.error(f"Failed to import RAGPipeline: {exc}")
    RAGPipeline = None  # type: ignore

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection (with error handling)
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME')
client = None
db = None
fs_bucket: Optional[AsyncIOMotorGridFSBucket] = None
db_error_message: Optional[str] = None

if mongo_url and db_name:
    try:
        client = AsyncIOMotorClient(
            mongo_url,
            serverSelectionTimeoutMS=int(os.environ.get("MONGO_TIMEOUT_MS", "3000")),
        )
        db = client[db_name]
        fs_bucket = AsyncIOMotorGridFSBucket(db)
        logging.info("MongoDB client initialized")
    except Exception as e:
        logging.error(f"Failed to configure MongoDB client: {e}")
        client = None
        db = None
        db_error_message = str(e)
else:
    logging.warning("MONGO_URL or DB_NAME not set. Some features will be unavailable.")
    db_error_message = "MONGO_URL or DB_NAME not configured."

# Initialize OCR and RAG
ocr_engine = None
ocr_error_message = None
rag_pipeline = None

try:
    if OCREngine:
        ocr_engine = OCREngine()
        logging.info("OCR Engine initialized")
    else:
        ocr_error_message = "OCREngine class unavailable"
except Exception as e:
    ocr_error_message = str(e)
    logging.error(f"Failed to initialize OCR Engine: {e}")

try:
    if RAGPipeline:
        rag_pipeline = RAGPipeline()
        logging.info("RAG Pipeline initialized")
except Exception as e:
    logging.error(f"Failed to initialize RAG Pipeline: {e}")

# Create the main app
app = FastAPI(title="Village Panchayat Record Assistant")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


async def ensure_database_connection() -> bool:
    """Verify MongoDB connectivity before performing operations."""
    global db_error_message

    if db is None:
        db_error_message = "Database client not configured."
        return False

    try:
        await db.command("ping")
        db_error_message = None
        return True
    except ServerSelectionTimeoutError as exc:
        db_error_message = f"Database not reachable: {exc}"
    except PyMongoError as exc:
        db_error_message = f"Database error: {exc}"
    except Exception as exc:  # pragma: no cover - unexpected error
        db_error_message = f"Unexpected database error: {exc}"

    logging.error(db_error_message)
    return False


# Pydantic Models
class RecordCreate(BaseModel):
    filename: str
    file_type: str
    
class Record(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    file_type: str
    file_id: Optional[str] = None
    raw_text: str
    cleaned_text: str
    confidence: float
    word_count: int
    language: Optional[str] = "unknown"
    processed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "processed"

class QueryRequest(BaseModel):
    question: str

class QueryResponse(BaseModel):
    answer: str
    sources: List[dict]
    confidence: float


# Routes
@api_router.get("/")
async def root():
    return {
        "message": "Village Panchayat Record Assistant API",
        "version": "1.0.0",
        "ocr_status": "active" if ocr_engine else "unavailable",
        "ocr_error": ocr_error_message,
        "rag_status": "active" if rag_pipeline else "unavailable",
        "database_status": "connected" if db is not None and db_error_message is None else "disconnected",
        "database_error": db_error_message,
    }

@api_router.get("/health")
async def health_check():
    """Simple health check endpoint that doesn't require database"""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": "connected" if db is not None and db_error_message is None else "disconnected",
        "database_error": db_error_message,
        "ocr_status": "active" if ocr_engine else "unavailable",
        "ocr_error": ocr_error_message,
        "rag_status": "active" if rag_pipeline else "unavailable"
    }

@api_router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload and process document with OCR"""
    try:
        global db_error_message

        database_available = await ensure_database_connection()
        current_db_error = db_error_message

        if ocr_engine is None:
            detail = "OCR service not available."
            if ocr_error_message:
                detail += f" {ocr_error_message}"
            else:
                detail += " Ensure Tesseract OCR is installed and TESSERACT_PATH is configured."
            raise HTTPException(status_code=503, detail=detail)
        
        # Read file bytes
        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # Perform OCR
        try:
            ocr_result = ocr_engine.extract_text(file_bytes)
        except HTTPException:
            raise
        except ValueError as ve:
            raise HTTPException(status_code=422, detail=str(ve))
        except Exception as exc:
            logging.exception("OCR processing failed")
            raise HTTPException(status_code=500, detail=f"OCR processing failed: {exc}")
        
        # Detect language
        if ocr_result['cleaned_text']:
            detected_lang = ocr_engine.detect_language(ocr_result['cleaned_text'][:500])
        else:
            detected_lang = "unknown"
        
        # Create record
        record = Record(
            filename=file.filename,
            file_type=file.content_type,
            file_id=None,
            raw_text=ocr_result['raw_text'],
            cleaned_text=ocr_result['cleaned_text'],
            confidence=ocr_result['confidence'],
            word_count=ocr_result['word_count'],
            language=detected_lang
        )
        
        # Save to MongoDB
        doc = record.model_dump()
        doc['processed_at'] = doc['processed_at'].isoformat()
        database_saved = False
        stored_file_id: Optional[str] = None

        if database_available:
            try:
                if fs_bucket:
                    file_stream = io.BytesIO(file_bytes)
                    grid_out_id = await fs_bucket.upload_from_stream(
                        file.filename,
                        file_stream,
                        metadata={
                            "content_type": file.content_type,
                            "original_filename": file.filename,
                        },
                    )
                    stored_file_id = str(grid_out_id)
                    record.file_id = stored_file_id
                    doc['file_id'] = stored_file_id

                await db.records.insert_one(doc)
                database_saved = True
                current_db_error = None
            except PyMongoError as exc:
                db_error_message = f"Failed to write to database: {exc}"
                logging.error(db_error_message)
                current_db_error = db_error_message
            except Exception as exc:  # pragma: no cover - unexpected error
                db_error_message = f"Unexpected database write error: {exc}"
                logging.error(db_error_message)
                current_db_error = db_error_message

        
        # Add to RAG pipeline
        if rag_pipeline and ocr_result['cleaned_text']:
            try:
                rag_pipeline.add_documents(
                    texts=[ocr_result['cleaned_text']],
                    metadatas=[{
                        'record_id': record.id,
                        'filename': file.filename,
                        'language': detected_lang
                    }]
                )
            except Exception as e:
                logging.error(f"Failed to add to RAG: {e}")
        
        return {
            "status": "success",
            "record_id": record.id,
            "filename": file.filename,
            "file_id": stored_file_id,
            "confidence": ocr_result['confidence'],
            "word_count": ocr_result['word_count'],
            "language": detected_lang,
            "text_preview": ocr_result['cleaned_text'][:200] + "..." if len(ocr_result['cleaned_text']) > 200 else ocr_result['cleaned_text'],
            "saved_to_database": database_saved,
            "database_error": current_db_error if not database_saved else None,
        }
        
    except HTTPException as http_exc:
        logging.error(f"Upload failed: {http_exc.status_code}: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logging.exception(f"Upload failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Unexpected server error during upload.")

@api_router.get("/records", response_model=List[Record])
async def get_records():
    """Get all processed records"""
    try:
        global db_error_message

        database_available = await ensure_database_connection()
        if not database_available:
            raise HTTPException(
                status_code=503,
                detail=db_error_message or "Database not connected. Start MongoDB to enable record storage.",
            )

        records = await db.records.find({}, {"_id": 0}).to_list(1000)
        
        # Convert timestamps
        for record in records:
            if isinstance(record['processed_at'], str):
                record['processed_at'] = datetime.fromisoformat(record['processed_at'])
        
        return records
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to fetch records: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/record/{record_id}")
async def get_record(record_id: str):
    """Get specific record by ID"""
    try:
        database_available = await ensure_database_connection()
        if not database_available:
            raise HTTPException(
                status_code=503,
                detail=db_error_message or "Database not connected.",
            )

        record = await db.records.find_one({"id": record_id}, {"_id": 0})
        
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")
        
        # Convert timestamp
        if isinstance(record['processed_at'], str):
            record['processed_at'] = datetime.fromisoformat(record['processed_at'])
        
        return record
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to fetch record: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """Query documents using RAG"""
    try:
        if not rag_pipeline:
            raise HTTPException(status_code=503, detail="RAG service not available")
        
        result = rag_pipeline.query(request.question)
        
        return QueryResponse(
            answer=result['answer'],
            sources=result['sources'],
            confidence=result['confidence']
        )
        
    except Exception as e:
        logging.error(f"Query failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/stats")
async def get_stats():
    """Get system statistics"""
    try:
        database_available = await ensure_database_connection()
        if not database_available:
            raise HTTPException(
                status_code=503,
                detail=db_error_message or "Database not connected.",
            )

        # MongoDB stats
        record_count = await db.records.count_documents({})
        
        # RAG stats
        rag_stats = {}
        if rag_pipeline:
            rag_stats = rag_pipeline.get_stats()
        
        return {
            "total_records": record_count,
            "rag_stats": rag_stats,
            "ocr_enabled": ocr_engine is not None,
            "rag_enabled": rag_pipeline is not None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to get stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/records")
async def delete_all_records():
    """Delete all records (for testing)"""
    try:
        database_available = await ensure_database_connection()
        if not database_available:
            raise HTTPException(
                status_code=503,
                detail=db_error_message or "Database not connected.",
            )

        result = await db.records.delete_many({})
        if fs_bucket:
            await fs_bucket.drop()
        return {
            "status": "success",
            "deleted_count": result.deleted_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to delete records: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Include the router
app.include_router(api_router)

# CORS middleware
# Default to allowing localhost frontend ports
default_origins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001'
]
cors_origins = os.environ.get('CORS_ORIGINS', ','.join(default_origins)).split(',')
# Remove empty strings and strip whitespace
cors_origins = [origin.strip() for origin in cors_origins if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins if cors_origins else ['*'],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()
