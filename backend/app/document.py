import os
import uuid
import shutil
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, Request

from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Match, Item, DocumentVerification
from app.schemas import DocumentVerificationResponse
from app.auth import get_current_user
from ai.document_verification_engine import document_verification_engine
from app.limiter import limiter
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["Documents"])

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = settings.MAX_DOCUMENT_SIZE
ALLOWED_DOCUMENT_TYPES = {"RECEIPT", "ID_PROOF", "OWNERSHIP_DOCUMENT", "OTHER"}

UPLOAD_DIR = os.path.join(os.getcwd(), settings.UPLOAD_DIRECTORY, 'documents')
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/verify/{match_id}", response_model=DocumentVerificationResponse)
@limiter.limit("5/minute")
def upload_document_for_verification(
    request: Request,
    match_id: int,
    background_tasks: BackgroundTasks,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if document_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid document_type")
        
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPEG, PNG, and WEBP are allowed.")
        
    # Verify match and ownership
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    lost_item = db.query(Item).filter(Item.id == match.lost_item_id).first()
    if not lost_item or lost_item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to verify this match")

    # Save file safely
    ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Invalid file extension")
        
    safe_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    # Check file size (rough check before saving, or after reading)
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        logger.error(f"Failed to securely save document: {e}")
        raise HTTPException(status_code=500, detail="Failed to save document securely")

    # Create verification record
    doc_ver = DocumentVerification(
        match_id=match.id,
        claimant_user_id=current_user.id,
        document_type=document_type,
        file_path=file_path,
        original_filename=file.filename[:255] if file.filename else None,
        ocr_status="PENDING",
        verification_status="PENDING"
    )
    db.add(doc_ver)
    db.commit()
    db.refresh(doc_ver)

    # Dispatch background task
    background_tasks.add_task(document_verification_engine.process_verification_background, doc_ver.id)

    return doc_ver

@router.get("/verification/{verification_id}", response_model=DocumentVerificationResponse)
@limiter.limit("5/minute")
def get_document_verification(
    request: Request,
    verification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc_ver = db.query(DocumentVerification).filter(DocumentVerification.id == verification_id).first()
    if not doc_ver:
        raise HTTPException(status_code=404, detail="Document verification not found")
        
    if doc_ver.claimant_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    return doc_ver
