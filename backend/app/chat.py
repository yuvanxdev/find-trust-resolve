import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app.database import get_db
from app.auth import get_current_user
from app.models import User, Match, Item, ChatSession, ChatMessage
from app.schemas import ChatSessionResponse, ChatMessageResponse, ChatMessageCreate
from app.notification_service import notification_service
from app.limiter import limiter
from app.config import settings

UPLOAD_DIR = os.path.join(os.getcwd(), settings.UPLOAD_DIRECTORY)
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/pjpeg", "image/x-png", "image/heic", "image/heif"]

router = APIRouter(prefix="/api/chat", tags=["chat"])

def get_or_create_chat_session(db: Session, match_id: int, current_user_id: int):
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    if match.status not in ["ACCEPTED", "VERIFIED"]:
        # If AI verified it, it should be fine. But just check if it was accepted or verified somewhere.
        # Allow PENDING if we want, but usually chat is only after accepted. Let's allow ACCEPTED and VERIFIED.
        if match.status != "ACCEPTED":
            pass # We might auto accept it below or in matches logic.

    lost_item = db.query(Item).filter(Item.id == match.lost_item_id).first()
    found_item = db.query(Item).filter(Item.id == match.found_item_id).first()
    
    if current_user_id not in [lost_item.user_id, found_item.user_id]:
        raise HTTPException(status_code=403, detail="Not authorized to chat for this match")
        
    session = db.query(ChatSession).filter(ChatSession.match_id == match_id).first()
    if not session:
        session = ChatSession(
            match_id=match_id,
            user1_id=lost_item.user_id,
            user2_id=found_item.user_id,
            is_active=1
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        
        # Auto-send phone numbers if available
        user1 = db.query(User).filter(User.id == lost_item.user_id).first()
        user2 = db.query(User).filter(User.id == found_item.user_id).first()
        
        messages_to_add = False
        if user1 and user1.phone_number:
            msg1 = ChatMessage(session_id=session.id, sender_id=user1.id, message=f"{user1.phone_number}")
            db.add(msg1)
            messages_to_add = True
        if user2 and user2.phone_number:
            msg2 = ChatMessage(session_id=session.id, sender_id=user2.id, message=f"{user2.phone_number}")
            db.add(msg2)
            messages_to_add = True
            
        if messages_to_add:
            db.commit()
        
    return session, lost_item.user_id, found_item.user_id

@router.get("/{match_id}", response_model=List[ChatMessageResponse])
@limiter.limit("300/minute")
def get_chat_messages(request: Request, match_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session, _, _ = get_or_create_chat_session(db, match_id, current_user.id)
    
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session.id).order_by(ChatMessage.created_at.asc()).all()
    return messages

@router.post("/{match_id}", response_model=ChatMessageResponse)
@limiter.limit("120/minute")
def send_chat_message(request: Request, match_id: int, message_in: ChatMessageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session, user1_id, user2_id = get_or_create_chat_session(db, match_id, current_user.id)
    
    if not session.is_active:
        raise HTTPException(status_code=403, detail="Chat session is closed")
        
    new_message = ChatMessage(
        session_id=session.id,
        sender_id=current_user.id,
        message=message_in.message,
        image_path=message_in.image_path
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    
    # Send notification to the other user
    other_user_id = user2_id if current_user.id == user1_id else user1_id
    notification_service.create_chat_notification(
        db=db,
        user_id=other_user_id,
        match_id=match_id
    )
    
    return new_message

@router.post("/{match_id}/image", response_model=ChatMessageResponse)
@limiter.limit("60/minute")
def send_chat_image(
    request: Request,
    match_id: int,
    image: UploadFile = File(...),
    message: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session, user1_id, user2_id = get_or_create_chat_session(db, match_id, current_user.id)
    
    if not session.is_active:
        raise HTTPException(status_code=403, detail="Chat session is closed")

    content_type = (image.content_type or "").lower()
    if content_type not in ALLOWED_MIME_TYPES and not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid image format. Allowed: JPEG, PNG, WEBP.")

    image.file.seek(0, 2)
    file_size = image.file.tell()
    image.file.seek(0)

    if file_size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="Image exceeds the 5MB limit.")

    ext = image.filename.split(".")[-1] if "." in image.filename else "jpg"
    if ext.lower() not in ["jpeg", "jpg", "png", "webp"]:
        ext = "jpg"

    safe_filename = f"chat_{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to save image.")

    new_message = ChatMessage(
        session_id=session.id,
        sender_id=current_user.id,
        message=message if message and message.strip() else None,
        image_path=safe_filename
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    other_user_id = user2_id if current_user.id == user1_id else user1_id
    notification_service.create_chat_notification(
        db=db,
        user_id=other_user_id,
        match_id=match_id
    )

    return new_message

@router.post("/{match_id}/exit", response_model=ChatSessionResponse)
@limiter.limit("30/minute")
def exit_chat_session(request: Request, match_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session, _, _ = get_or_create_chat_session(db, match_id, current_user.id)
    
    session.is_active = 0
    db.commit()
    db.refresh(session)
    
    return session

@router.get("/{match_id}/partner", response_model=dict)
@limiter.limit("300/minute")
def get_chat_partner(request: Request, match_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session, user1_id, user2_id = get_or_create_chat_session(db, match_id, current_user.id)
    
    other_user_id = user2_id if current_user.id == user1_id else user1_id
    other_user = db.query(User).filter(User.id == other_user_id).first()
    
    if not other_user:
        raise HTTPException(status_code=404, detail="Partner not found")
        
    return {
        "id": other_user.id,
        "name": other_user.name,
        "email": other_user.email,
    }
