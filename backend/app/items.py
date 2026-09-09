import os
import uuid
import shutil
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Request
from sqlalchemy.orm import Session
from app.database import SessionLocal

from app.database import get_db
from app.models import Item, User, ReportType
from app.schemas import ItemResponse, PublicItemResponse
from app.auth import get_current_user
from ai.matching_engine import process_new_item_embeddings
from ai.gemini_service import gemini_service
from app.notification_service import notification_service
from app.limiter import limiter
from app.config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/items", tags=["items"])

UPLOAD_DIR = os.path.join(os.getcwd(), settings.UPLOAD_DIRECTORY)
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
MAX_IMAGE_SIZE = settings.MAX_UPLOAD_SIZE

def validate_and_save_image(image: UploadFile) -> str:
    if image.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image format. Allowed: JPEG, PNG, WEBP.")
    
    image.file.seek(0, 2)
    file_size = image.file.tell()
    image.file.seek(0)
    
    if file_size > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image size exceeds the 5 MB limit.")
    
    ext = image.filename.split(".")[-1] if "." in image.filename else "bin"
    if ext.lower() not in ["jpeg", "jpg", "png", "webp"]:
        if image.content_type == "image/jpeg": ext = "jpg"
        elif image.content_type == "image/png": ext = "png"
        elif image.content_type == "image/webp": ext = "webp"
        
    safe_filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to save image securely.")
    
    return safe_filename

def safe_remove_image(filename: str):
    if not filename: return
    safe_name = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_name)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except:
            pass

def trigger_background_processing(item_id: int):
    db = SessionLocal()
    try:
        process_new_item_embeddings(item_id, db)
    except Exception as e:
        logger.error(f"Background AI processing failed for item {item_id}: {e}")
    finally:
        db.close()

@router.post("/auto-describe", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
def auto_describe_item(
    request: Request,
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    if image.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid image format. Allowed: JPEG, PNG, WEBP.")
    
    image.file.seek(0, 2)
    file_size = image.file.tell()
    image.file.seek(0)
    
    if file_size > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image size exceeds the 5 MB limit.")
    
    image_bytes = image.file.read()
    
    try:
        description_data = gemini_service.describe_image(image_bytes, image.content_type)
        return description_data
    except Exception as e:
        logger.error(f"Auto-describe failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze image using AI.")

@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_item(
    request: Request,
    background_tasks: BackgroundTasks,
    report_type: ReportType = Form(...),
    item_name: str = Form(...),
    description: str = Form(...),
    location: str = Form(...),
    category: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    brand: Optional[str] = Form(None),
    date_reported: Optional[datetime] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not item_name.strip() or not description.strip() or not location.strip():
        raise HTTPException(status_code=400, detail="item_name, description, and location cannot be empty.")
        
    image_path = None
    if image and image.filename:
        image_path = validate_and_save_image(image)
        
    new_item = Item(
        user_id=current_user.id,
        report_type=report_type,
        item_name=item_name,
        description=description,
        category=category,
        color=color,
        brand=brand,
        location=location,
        date_reported=date_reported,
        image_path=image_path
    )
    
    try:
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        background_tasks.add_task(trigger_background_processing, new_item.id)
        
        # Check preferences and notify other users
        notification_service.check_and_notify_preferences(
            db=db,
            reporter_user_id=current_user.id,
            item_id=new_item.id,
            item_name=item_name,
            category=category,
            location=location,
            report_type=report_type.value if hasattr(report_type, 'value') else str(report_type)
        )
        
        return new_item
    except Exception as e:
        db.rollback()
        if image_path:
            safe_remove_image(image_path)
        raise HTTPException(status_code=500, detail="Internal server error storing item.")

@router.get("/", response_model=List[ItemResponse])
@limiter.limit("300/minute")
def get_user_items(
    request: Request,
    report_type: Optional[ReportType] = None,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Item).filter(Item.user_id == current_user.id)
    if report_type:
        query = query.filter(Item.report_type == report_type)
    if category:
        query = query.filter(Item.category == category)
        
    items = query.order_by(Item.created_at.desc()).offset(skip).limit(limit).all()
    return items

@router.get("/discover", response_model=List[PublicItemResponse])
@limiter.limit("300/minute")
def discover_items(
    request: Request,
    report_type: Optional[ReportType] = None,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Item).filter(Item.user_id != current_user.id)
    if report_type:
        query = query.filter(Item.report_type == report_type)
    if category:
        query = query.filter(Item.category == category)
        
    items = query.order_by(Item.created_at.desc()).offset(skip).limit(limit).all()
    return items

@router.get("/public/{item_id}", response_model=PublicItemResponse)
@limiter.limit("300/minute")
def get_public_item(request: Request, item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.user_id == current_user.id:
        # If it's their own item, they can just use the regular endpoint, but we can allow it here too for simplicity,
        # or just return the public view. Returning public view is fine.
        pass
    return item

@router.get("/{item_id}", response_model=ItemResponse)
@limiter.limit("300/minute")
def get_item(request: Request, item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this item")
    return item

@router.put("/{item_id}", response_model=ItemResponse)
@limiter.limit("60/minute")
def update_item(
    request: Request,
    item_id: int,
    report_type: Optional[ReportType] = Form(None),
    item_name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    brand: Optional[str] = Form(None),
    date_reported: Optional[datetime] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this item")
        
    if item_name is not None and not item_name.strip():
        raise HTTPException(status_code=400, detail="item_name cannot be empty.")
    if description is not None and not description.strip():
        raise HTTPException(status_code=400, detail="description cannot be empty.")
    if location is not None and not location.strip():
        raise HTTPException(status_code=400, detail="location cannot be empty.")

    old_image_path = item.image_path
    new_image_path = None
    
    if image and image.filename:
        new_image_path = validate_and_save_image(image)

    if report_type is not None: item.report_type = report_type
    if item_name is not None: item.item_name = item_name
    if description is not None: item.description = description
    if location is not None: item.location = location
    if category is not None: item.category = category
    if color is not None: item.color = color
    if brand is not None: item.brand = brand
    if date_reported is not None: item.date_reported = date_reported
    if new_image_path is not None: item.image_path = new_image_path

    try:
        db.commit()
        db.refresh(item)
        if new_image_path is not None and old_image_path:
            safe_remove_image(old_image_path)
        return item
    except Exception as e:
        db.rollback()
        if new_image_path:
            safe_remove_image(new_image_path)
        raise HTTPException(status_code=500, detail="Failed to update item.")

@router.delete("/{item_id}")
@limiter.limit("30/minute")
def delete_item(request: Request, item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this item")
        
    image_path = item.image_path
    try:
        db.delete(item)
        db.commit()
        if image_path:
            safe_remove_image(image_path)
        return {"detail": "Item deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete item.")
