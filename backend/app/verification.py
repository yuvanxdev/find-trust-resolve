from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.auth import get_current_user
from app.models import User, Verification, Match, Item
from app.schemas import (
    VerificationStartResponse,
    VerificationQuestion,
    VerificationAnswerRequest,
    VerificationResponse
)
from ai.verification_engine import verification_engine
from app.limiter import limiter


router = APIRouter(prefix="/api/verification", tags=["Verification"])

@router.post("/start/{match_id}", response_model=VerificationStartResponse)
@limiter.limit("30/minute")
def start_verification(
    request: Request,
    match_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    verification = verification_engine.start_verification(db, match_id, current_user)
    
    # Safely format questions for response
    safe_questions = [
        VerificationQuestion(question_id=q['question_id'], question_text=q['question_text'])
        for q in verification.questions
    ] if verification.questions else []
    
    return VerificationStartResponse(
        verification_id=verification.id,
        match_id=verification.match_id,
        status=verification.verification_status,
        claimant_status=verification.claimant_status,
        finder_status=verification.finder_status,
        claimant_user_id=verification.claimant_user_id,
        finder_user_id=verification.finder_user_id,
        questions=safe_questions
    )

@router.post("/answer/{verification_id}", response_model=VerificationResponse)
@limiter.limit("30/minute")
def answer_verification(
    request: Request,
    verification_id: int,
    answer_req: VerificationAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    verification = verification_engine.answer_verification(db, verification_id, answer_req.answers, current_user)
    
    return VerificationResponse(
        verification_id=verification.id,
        match_id=verification.match_id,
        status=verification.verification_status,
        claimant_status=verification.claimant_status,
        finder_status=verification.finder_status,
        confidence_score=verification.confidence_score,
        created_at=verification.created_at,
        updated_at=verification.updated_at
    )

@router.get("/{verification_id}", response_model=VerificationResponse)
def get_verification_status(
    verification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    verification = db.query(Verification).filter(Verification.id == verification_id).first()
    if not verification:
        raise HTTPException(status_code=404, detail="Verification session not found")
        
    match = db.query(Match).filter(Match.id == verification.match_id).first()
    lost_item = db.query(Item).filter(Item.id == match.lost_item_id).first()
    found_item = db.query(Item).filter(Item.id == match.found_item_id).first()
    
    if current_user.id not in [lost_item.user_id, found_item.user_id]:
        raise HTTPException(status_code=403, detail="Not authorized to access this verification")
        
    return VerificationResponse(
        verification_id=verification.id,
        match_id=verification.match_id,
        status=verification.verification_status,
        claimant_status=verification.claimant_status,
        finder_status=verification.finder_status,
        created_at=verification.created_at,
        updated_at=verification.updated_at
    )
