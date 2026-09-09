import logging
import os
from datetime import timedelta
from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi.staticfiles import StaticFiles

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.limiter import limiter

from app.config import settings
from app.database import engine, get_db, Base
from app.schemas import HealthResponse, DBHealthResponse, UserCreate, UserResponse, Token, UserUpdate, PasswordUpdate
from app.models import User
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user
from app.items import router as items_router
from app.matches import router as matches_router
from app.verification import router as verification_router
from app.document import router as document_router
from app.notifications import router as notifications_router
from app.chat import router as chat_router

# Configure structured logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)



from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting FindIt AI Backend...")
    os.makedirs(os.path.join(os.getcwd(), settings.UPLOAD_DIRECTORY), exist_ok=True)
    os.makedirs(os.path.join(os.getcwd(), settings.UPLOAD_DIRECTORY, 'documents'), exist_ok=True)
    if engine:
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Database tables initialized successfully. Warning: metadata.create_all() is active in production.")
        except Exception as e:
            logger.error(f"Failed to create database tables: {e}")

    # Ensure FAISS index is populated with existing items from database
    try:
        from app.database import SessionLocal
        from ai.faiss_service import FAISSService
        init_db = SessionLocal()
        FAISSService().rebuild_from_db(init_db)
        init_db.close()
        logger.info("FAISS similarity index successfully initialized from database.")
    except Exception as e:
        logger.error(f"Failed to initialize FAISS index: {e}")

    yield
    logger.info("Shutting down FindIt AI Backend...")

app = FastAPI(title="FindIt AI Backend", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS setup
origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://.*|capacitor://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Mount uploads directory for static file serving
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIRECTORY), name="uploads")



@app.get("/", response_model=HealthResponse)
def root():
    return {"status": "ok"}

@app.get("/health", response_model=HealthResponse)
def health_check():
    return {"status": "ok"}

@app.get("/health/db", response_model=DBHealthResponse)
def db_health_check(db: Session = Depends(get_db)):
    if not db:
        logger.error("Database session is not available.")
        raise HTTPException(status_code=503, detail="Database connection not configured")
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        raise HTTPException(status_code=503, detail="Database not available")

# --- AUTH ENDPOINTS ---

@app.post("/api/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register(request: Request, user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(name=user.name, email=user.email, hashed_password=hashed_password)
    
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    except Exception as e:
        db.rollback()
        logger.error(f"Error registering user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/auth/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.patch("/api/auth/me", response_model=UserResponse)
@limiter.limit("120/minute")
def update_user_me(request: Request, user_update: UserUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    update_data = user_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(current_user, key, value)
    
    db.commit()
    db.refresh(current_user)
    return current_user

from app.auth import verify_password, get_password_hash

@app.patch("/api/auth/password")
@limiter.limit("15/minute")
def update_password(request: Request, password_update: PasswordUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(password_update.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    
    current_user.hashed_password = get_password_hash(password_update.new_password)
    db.commit()
    return {"status": "success", "message": "Password updated successfully"}

@app.delete("/api/auth/me")
@limiter.limit("10/minute")
def delete_user_me(request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(current_user)
    db.commit()
    return {"status": "success", "message": "User account deleted successfully"}

@app.get("/api/users/{user_id}/profile", response_model=UserResponse)
@limiter.limit("300/minute")
def get_user_profile(request: Request, user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Create a copy of the user data to apply privacy filters
    from copy import copy
    public_user = copy(user)
    
    # Apply privacy filters based on settings
    if not user.show_email:
        public_user.email = "Hidden by user"
    if not user.show_phone:
        public_user.phone_number = None
    if not user.show_classroom:
        public_user.department = None
        public_user.section_class = None
    if not user.show_hostel:
        public_user.hostel = None
        
    return public_user

import uuid
from fastapi import UploadFile, File

@app.post("/api/auth/me/avatar", response_model=UserResponse)
@limiter.limit("10/minute")
async def upload_avatar(request: Request, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"avatar_{current_user.id}_{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(settings.UPLOAD_DIRECTORY, filename)
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
        
    current_user.avatar_path = filename
    db.commit()
    db.refresh(current_user)
    return current_user

from ai.easyocr_service import easyocr_service
from ai.gemini_service import gemini_service
from app.models import Item, Notification, NotificationType, ReportType
from sqlalchemy import or_

@app.post("/api/ocr/extract")
@limiter.limit("5/minute")
async def extract_text_from_image(request: Request, file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"ocr_temp_{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(settings.UPLOAD_DIRECTORY, filename)
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
        
    try:
        lines = easyocr_service.extract_text(file_path)
        extracted_text = "\n".join(lines)
        return {"text": extracted_text}
    except Exception as e:
        logger.error(f"OCR Extraction failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to extract text from image")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post("/api/ocr/scan-id")
@limiter.limit("5/minute")
async def scan_id_and_notify(request: Request, file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Save the file permanently as it will become the item's image
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"item_{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(settings.UPLOAD_DIRECTORY, filename)
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
        
    try:
        # Extract text via OCR
        lines = easyocr_service.extract_text(file_path)
        extracted_text = "\n".join(lines)
        
        # Parse text via Gemini
        id_details = gemini_service.extract_id_details(extracted_text)
        
        # Try to match to an existing user
        matched_user = None
        if id_details.get("email"):
            matched_user = db.query(User).filter(User.email.ilike(f"%{id_details['email']}%")).first()
            
        if not matched_user and id_details.get("name"):
            matched_user = db.query(User).filter(User.name.ilike(f"%{id_details['name']}%")).first()
            
        if matched_user:
            # Create a FOUND item automatically
            new_item = Item(
                item_name=f"{id_details.get('name', 'User')}'s ID Card",
                description=id_details.get("summary", f"Found ID Card. Details extracted: {id_details}"),
                category="DOCUMENTS",
                report_type=ReportType.FOUND,
                user_id=current_user.id,
                image_path=filename,
                status="AVAILABLE"
            )
            db.add(new_item)
            db.commit()
            db.refresh(new_item)
            
            # Send Notification to the matched user
            notif = Notification(
                user_id=matched_user.id,
                type=NotificationType.MATCH_FOUND,
                title="Your ID Card was Found!",
                message=f"Someone just scanned your ID card and secured it. Click to view the report.",
                related_item_id=new_item.id,
                related_user_id=current_user.id
            )
            db.add(notif)
            db.commit()
            
            return {
                "matched": True,
                "owner_name": matched_user.name,
                "item_id": new_item.id,
                "message": f"Successfully identified and notified {matched_user.name}!"
            }
        else:
            # No user found, just return extracted details so they can fill a manual report
            # Clean up the image since they will upload it manually
            if os.path.exists(file_path):
                os.remove(file_path)
            return {
                "matched": False,
                "details": id_details,
                "message": "No matching user found in database. Proceed to manual report."
            }
            
    except Exception as e:
        logger.error(f"Scan ID failed: {e}")
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail="Failed to process ID")



app.include_router(items_router)
app.include_router(matches_router)
app.include_router(verification_router)
app.include_router(document_router)
app.include_router(notifications_router)
app.include_router(chat_router)
