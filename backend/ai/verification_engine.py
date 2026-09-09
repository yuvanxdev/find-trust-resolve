import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException
from datetime import datetime, timezone

from app.models import Match, Verification, Item, User, VerificationStatus
from ai.gemini_service import gemini_service
from app.notification_service import notification_service

logger = logging.getLogger(__name__)

class VerificationEngine:
    
    @staticmethod
    def start_verification(db: Session, match_id: int, current_user: User) -> Verification:
        # Load match
        match = db.query(Match).filter(Match.id == match_id).first()
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")
        
        lost_item = db.query(Item).filter(Item.id == match.lost_item_id).first()
        found_item = db.query(Item).filter(Item.id == match.found_item_id).first()
        
        if not lost_item or not found_item:
            raise HTTPException(status_code=404, detail="One or both items in this match no longer exist")
            
        if current_user.id not in [lost_item.user_id, found_item.user_id]:
            raise HTTPException(status_code=403, detail="Not authorized to verify this match")
        
        # The claimant is ALWAYS the person who lost the item
        claimant_id = lost_item.user_id

        # Check if an active verification already exists
        existing_verification = db.query(Verification).filter(
            Verification.match_id == match.id,
            Verification.verification_status.in_([
                VerificationStatus.PENDING, 
                VerificationStatus.QUESTIONS_GENERATED, 
                VerificationStatus.PARTIAL
            ])
        ).first()
        
        if existing_verification:
            # If it already exists, return it
            return existing_verification

        # Create verification record
        verification = Verification(
            match_id=match.id,
            claimant_user_id=claimant_id,
            finder_user_id=found_item.user_id,
            verification_status=VerificationStatus.PENDING
        )
        db.add(verification)
        db.commit()
        db.refresh(verification)
        
        # Generate questions
        try:
            questions = gemini_service.generate_questions(found_item)
            verification.questions = questions
            verification.verification_status = VerificationStatus.QUESTIONS_GENERATED
            db.commit()
            db.refresh(verification)
        except Exception as e:
            logger.error(f"Failed to generate questions: {e}")
            verification.verification_status = VerificationStatus.ERROR
            db.commit()
            raise HTTPException(status_code=503, detail="Verification service temporarily unavailable")
            
        return verification

    @staticmethod
    def answer_verification(db: Session, verification_id: int, answers: dict, current_user: User) -> Verification:
        # Load verification
        verification = db.query(Verification).filter(Verification.id == verification_id).first()
        if not verification:
            raise HTTPException(status_code=404, detail="Verification session not found")
            
        if current_user.id not in [verification.claimant_user_id, verification.finder_user_id]:
            raise HTTPException(status_code=403, detail="Not authorized for this verification session")
            
        if verification.verification_status in [VerificationStatus.VERIFIED, VerificationStatus.REJECTED]:
            raise HTTPException(status_code=400, detail="Verification is already completed")
            
        # Optional: block massive payloads
        if len(str(answers)) > 10000:
            raise HTTPException(status_code=400, detail="Answers payload too large")
            
        # Store answers temporarily
        is_claimant = current_user.id == verification.claimant_user_id
        
        if is_claimant:
            verification.claimant_answers = answers
            verification.claimant_status = VerificationStatus.ANSWERED
        else:
            verification.finder_answers = answers
            verification.finder_status = VerificationStatus.ANSWERED
            
        # Check if both have answered
        if verification.claimant_status == VerificationStatus.ANSWERED and verification.finder_status == VerificationStatus.ANSWERED:
            verification.verification_status = VerificationStatus.ANSWERED
            db.commit()
            db.refresh(verification)
            
            # Evaluate
            match = db.query(Match).filter(Match.id == verification.match_id).first()
            found_item = db.query(Item).filter(Item.id == match.found_item_id).first()
            
            try:
                evaluation = gemini_service.evaluate_answers(
                    found_item, 
                    verification.questions, 
                    verification.claimant_answers, 
                    verification.finder_answers
                )
                
                verification.verification_status = getattr(VerificationStatus, evaluation['status'], VerificationStatus.REJECTED)
                verification.confidence_score = evaluation['confidence_score']
                verification.matched_fields = evaluation['matched_fields']
                verification.missing_fields = evaluation['missing_fields']
                
                if verification.verification_status == VerificationStatus.VERIFIED:
                    match.status = "ACCEPTED"
                    match.resolved_by_user_id = current_user.id
                    match.resolved_at = datetime.now(timezone.utc)
                elif verification.verification_status == VerificationStatus.REJECTED:
                    match.status = "REJECTED"
                    match.resolved_by_user_id = current_user.id
                    match.resolved_at = datetime.now(timezone.utc)
                    
                db.commit()
                db.refresh(verification)
            except Exception as e:
                logger.error(f"Failed to evaluate answers: {e}")
                verification.verification_status = VerificationStatus.ERROR
                db.commit()
                
                notification_service.create_verification_notification(
                    db, 
                    verification.claimant_user_id, 
                    verification.match_id, 
                    verification.id, 
                    VerificationStatus.ERROR
                )
                notification_service.create_verification_notification(
                    db, 
                    verification.finder_user_id, 
                    verification.match_id, 
                    verification.id, 
                    VerificationStatus.ERROR
                )
                
                raise HTTPException(status_code=503, detail="Verification service temporarily unavailable")
        else:
            # Only one has answered, set to PARTIAL
            verification.verification_status = VerificationStatus.PARTIAL
            db.commit()
            db.refresh(verification)
            
            # Send notification to both
            if verification.verification_status in [VerificationStatus.VERIFIED, VerificationStatus.REJECTED, VerificationStatus.ERROR]:
                notification_service.create_verification_notification(
                    db, 
                    verification.claimant_user_id, 
                    verification.match_id, 
                    verification.id, 
                    verification.verification_status
                )
                notification_service.create_verification_notification(
                    db, 
                    verification.finder_user_id, 
                    verification.match_id, 
                    verification.id, 
                    verification.verification_status
                )
                

            
        return verification

verification_engine = VerificationEngine()
