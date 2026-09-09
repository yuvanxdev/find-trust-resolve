from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Match, Item, User
from app.schemas import MatchResponse
from app.auth import get_current_user
from app.notification_service import notification_service
from datetime import datetime, timezone
from app.limiter import limiter

router = APIRouter(prefix="/api/matches", tags=["matches"])

@router.get("/", response_model=List[MatchResponse])
@limiter.limit("300/minute")
def get_user_matches(
    request: Request,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Retrieve matches where the authenticated user owns either the lost_item or found_item
    # We join Item to check ownership
    matches = db.query(Match).join(
        Item, 
        (Match.lost_item_id == Item.id) | (Match.found_item_id == Item.id)
    ).filter(
        Item.user_id == current_user.id
    ).order_by(
        Match.confidence_score.desc(), Match.created_at.desc()
    ).offset(skip).limit(limit).all()
    
    # Populate other_user_id for each match
    for m in matches:
        lost_item = db.query(Item).filter(Item.id == m.lost_item_id).first()
        found_item = db.query(Item).filter(Item.id == m.found_item_id).first()
        if lost_item and found_item:
            m.other_user_id = found_item.user_id if current_user.id == lost_item.user_id else lost_item.user_id

    return matches

def _get_match_and_verify_ownership(db: Session, match_id: int, current_user_id: int, lock: bool = False):
    query = db.query(Match).filter(Match.id == match_id)
    if lock:
        query = query.with_for_update()
    match = query.first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    lost_item = db.query(Item).filter(Item.id == match.lost_item_id).first()
    found_item = db.query(Item).filter(Item.id == match.found_item_id).first()
    
    if not lost_item or not found_item:
        raise HTTPException(status_code=404, detail="One or both items in this match no longer exist")
        
    if current_user_id not in [lost_item.user_id, found_item.user_id]:
        raise HTTPException(status_code=403, detail="Not authorized to access this match")
        
    return match, lost_item, found_item

@router.get("/{match_id}", response_model=MatchResponse)
@limiter.limit("60/minute")
def get_match(
    request: Request,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    match, lost_item, found_item = _get_match_and_verify_ownership(db, match_id, current_user.id)
    match.other_user_id = found_item.user_id if current_user.id == lost_item.user_id else lost_item.user_id
    return match

@router.post("/{match_id}/accept", response_model=MatchResponse)
@limiter.limit("30/minute")
def accept_match(
    request: Request,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    match, lost_item, found_item = _get_match_and_verify_ownership(db, match_id, current_user.id, lock=True)
    
    if match.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Match is already {match.status}")
        
    try:
        match.status = "ACCEPTED"
        match.resolved_by_user_id = current_user.id
        match.resolved_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(match)
        
        # Notify both parties
        other_user_id = found_item.user_id if current_user.id == lost_item.user_id else lost_item.user_id
        notification_service.create_match_resolution_notification(db, other_user_id, match.id, "ACCEPTED")
        notification_service.create_match_resolution_notification(db, current_user.id, match.id, "ACCEPTED")
        
        match.other_user_id = other_user_id
        return match
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to accept match")

@router.post("/{match_id}/reject", response_model=MatchResponse)
@limiter.limit("30/minute")
def reject_match(
    request: Request,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    match, lost_item, found_item = _get_match_and_verify_ownership(db, match_id, current_user.id, lock=True)
    
    if match.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Match is already {match.status}")
        
    try:
        match.status = "REJECTED"
        match.resolved_by_user_id = current_user.id
        match.resolved_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(match)
        
        # Notify the other party
        other_user_id = found_item.user_id if current_user.id == lost_item.user_id else lost_item.user_id
        notification_service.create_match_resolution_notification(db, other_user_id, match.id, "REJECTED")
        
        match.other_user_id = other_user_id
        return match
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to reject match")
