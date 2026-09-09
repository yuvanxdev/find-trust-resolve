from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.auth import get_current_user
from app.models import User, Notification
from app.schemas import NotificationResponse, NotificationListResponse, UnreadCountResponse
from app.limiter import limiter

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

@router.get("/", response_model=NotificationListResponse)
@limiter.limit("300/minute")
def get_notifications(
    request: Request,
    unread: Optional[bool] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread is not None:
        query = query.filter(Notification.is_read == (not unread)) # is_read = 0 if unread is true (assuming SQLite handles 0/1 boolean)
        
    total = query.count()
    notifications = query.order_by(Notification.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    
    from app.models import Match, Item, NotificationType
    
    # Handle int vs bool mapping for Pydantic schema
    for n in notifications:
        n.is_read = bool(n.is_read)
        if n.type == NotificationType.MATCH_ACCEPTED and n.related_match_id:
            # Find the match to get the other user's ID
            match = db.query(Match).filter(Match.id == n.related_match_id).first()
            if match:
                lost_item = db.query(Item).filter(Item.id == match.lost_item_id).first()
                found_item = db.query(Item).filter(Item.id == match.found_item_id).first()
                if lost_item and found_item:
                    other_user_id = found_item.user_id if current_user.id == lost_item.user_id else lost_item.user_id
                    n.related_user_id = other_user_id
        else:
            n.related_user_id = None

    return NotificationListResponse(
        items=notifications,
        total=total,
        page=page,
        limit=limit
    )

@router.get("/unread-count", response_model=UnreadCountResponse)
@limiter.limit("300/minute")
def get_unread_count(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == 0
    ).count()
    return UnreadCountResponse(count=count)

@router.patch("/{notification_id}/read", response_model=NotificationResponse)
@limiter.limit("30/minute")
def mark_notification_read(
    request: Request,
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    notification.is_read = 1
    db.commit()
    db.refresh(notification)
    
    notification.is_read = bool(notification.is_read)
    return notification

@router.patch("/read-all")
@limiter.limit("5/minute")
def mark_all_read(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == 0
    ).update({"is_read": 1})
    db.commit()
    return {"status": "success", "message": "All notifications marked as read"}
