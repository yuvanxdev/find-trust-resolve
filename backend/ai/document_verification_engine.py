import logging
import re
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import DocumentVerification, Item, Match, User
from ai.easyocr_service import easyocr_service
from app.notification_service import notification_service

logger = logging.getLogger(__name__)

class DocumentVerificationEngine:
    
    @staticmethod
    def normalize_text(text: str) -> str:
        if not text:
            return ""
        # Lowercase, remove special characters and extra whitespaces
        normalized = re.sub(r'[^\w\s]', '', text.lower())
        return ' '.join(normalized.split())

    @staticmethod
    def process_verification_background(verification_id: int):
        db: Session = SessionLocal()
        try:
            doc_ver = db.query(DocumentVerification).filter(DocumentVerification.id == verification_id).first()
            if not doc_ver:
                logger.error(f"Document Verification {verification_id} not found in background task.")
                return

            doc_ver.ocr_status = "PROCESSING"
            db.commit()

            try:
                # 1. Extract raw text
                extracted_lines = easyocr_service.extract_text(doc_ver.file_path)
                doc_ver.ocr_status = "COMPLETED"
                db.commit()
            except Exception as e:
                logger.error(f"OCR Exception for {verification_id}: {e}")
                doc_ver.ocr_status = "ERROR"
                doc_ver.verification_status = "ERROR"
                doc_ver.rejection_reason = "OCR Extraction Failed"
                db.commit()
                return

            # 2. Field extraction & normalization
            normalized_lines = [DocumentVerificationEngine.normalize_text(line) for line in extracted_lines]
            full_text = " ".join(normalized_lines)

            # Retrieve LOST item
            match = db.query(Match).filter(Match.id == doc_ver.match_id).first()
            if not match:
                doc_ver.verification_status = "ERROR"
                db.commit()
                return
                
            lost_item = db.query(Item).filter(Item.id == match.lost_item_id).first()
            if not lost_item:
                doc_ver.verification_status = "ERROR"
                db.commit()
                return

            # Retrieve User for name check
            claimant = db.query(User).filter(User.id == doc_ver.claimant_user_id).first()

            # 3. Deterministic scoring
            score = 0.0
            matched_fields = {}
            missing_fields = {}
            extracted_fields = {"full_normalized_text_preview": full_text[:100]} # Never store massive OCR dump raw.

            def check_field(field_name, field_value, weight):
                nonlocal score
                if not field_value:
                    return
                norm_val = DocumentVerificationEngine.normalize_text(field_value)
                if norm_val and norm_val in full_text:
                    score += weight
                    matched_fields[field_name] = field_value
                else:
                    missing_fields[field_name] = field_value

            check_field("item_name", lost_item.item_name, 30.0)
            check_field("brand", lost_item.brand, 30.0)
            check_field("color", lost_item.color, 20.0)
            
            if claimant:
                # Partial name matching
                names = claimant.name.split()
                name_matched = False
                for n in names:
                    if len(n) > 2 and DocumentVerificationEngine.normalize_text(n) in full_text:
                        name_matched = True
                        break
                if name_matched:
                    score += 20.0
                    matched_fields["owner_name"] = claimant.name
                else:
                    missing_fields["owner_name"] = claimant.name

            # Note: Serial number logic would go here if added to schema, with severe penalty if mismatch

            doc_ver.confidence_score = score
            doc_ver.extracted_fields = extracted_fields
            doc_ver.matched_fields = matched_fields
            doc_ver.missing_fields = missing_fields

            # Thresholds
            if score >= 80.0:
                doc_ver.verification_status = "VERIFIED"
            elif score >= 40.0:
                doc_ver.verification_status = "NEEDS_REVIEW"
            else:
                doc_ver.verification_status = "REJECTED"
                doc_ver.rejection_reason = "Insufficient matching fields in document"

            db.commit()
            logger.info(f"Document Verification {verification_id} finished with status: {doc_ver.verification_status}")
            
            # Send notification
            notification_service.create_document_verification_notification(
                db,
                doc_ver.claimant_user_id,
                doc_ver.match_id,
                doc_ver.id,
                doc_ver.verification_status
            )

        except Exception as e:
            logger.error(f"Error processing background document verification {verification_id}: {e}")
            try:
                doc_ver = db.query(DocumentVerification).filter(DocumentVerification.id == verification_id).first()
                if doc_ver:
                    notification_service.create_document_verification_notification(
                        db,
                        doc_ver.claimant_user_id,
                        doc_ver.match_id,
                        doc_ver.id,
                        "ERROR"
                    )
            except Exception:
                pass
        finally:
            db.close()

document_verification_engine = DocumentVerificationEngine()
