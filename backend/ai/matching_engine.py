import os
import logging
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models import Item, Match, ReportType
from ai.clip_service import CLIPService
from ai.sbert_service import SBERTService
from ai.faiss_service import FAISSService
from app.notification_service import notification_service

logger = logging.getLogger(__name__)

# Constants
CONFIDENCE_THRESHOLD = 80.0
IMAGE_WEIGHT = 0.60
TEXT_WEIGHT = 0.40

def process_new_item_embeddings(item_id: int, db: Session):
    logger.info(f"Background AI processing started for Item {item_id}")
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        logger.error(f"Item {item_id} not found for AI processing.")
        return

    # Generate Image Embedding
    image_emb = None
    if item.image_path:
        # Construct absolute path safely assuming image_path is just the filename
        upload_dir = os.path.join(os.getcwd(), "uploads")
        full_image_path = os.path.join(upload_dir, os.path.basename(item.image_path))
        if os.path.exists(full_image_path):
            image_emb = CLIPService().generate_embedding(full_image_path)
            if image_emb:
                item.image_embedding = image_emb

    # Generate Text Embedding
    text_emb = SBERTService().generate_embedding(item)
    if text_emb:
        item.text_embedding = text_emb

    # Save to PostgreSQL
    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save embeddings for item {item.id}: {e}")
        db.rollback()
        return

    # Add to FAISS and Search
    faiss_service = FAISSService()
    report_type_str = item.report_type.value if hasattr(item.report_type, "value") else str(item.report_type)
    
    # Self-healing safeguard: if FAISS index is cold but database has multiple items, rebuild first
    if len(faiss_service.item_types) < 2 and db.query(Item).count() > 1:
        faiss_service.rebuild_from_db(db)
    
    faiss_service.add_item(item.id, report_type_str, image_emb, text_emb)
    
    candidates = faiss_service.search_candidates(
        query_item_id=item.id,
        query_report_type=report_type_str,
        query_image_emb=image_emb,
        query_text_emb=text_emb,
        k=50
    )

    # Process Matches
    for candidate_id, scores in candidates.items():
        # Convert numpy types to native Python types early to avoid psycopg2 adapter issues
        candidate_id = int(candidate_id)
        img_sim = max(0.0, scores.get("image_similarity", 0.0))
        txt_sim = max(0.0, scores.get("text_similarity", 0.0))
        
        # Adjust weight dynamically if image is missing
        candidate_item = db.query(Item).filter(Item.id == candidate_id).first()
        if not image_emb or not candidate_item or not candidate_item.image_embedding:
            # If comparing without images, rely purely on text (reweight to 100%)
            confidence = txt_sim * 100.0
        else:
            confidence = (img_sim * IMAGE_WEIGHT + txt_sim * TEXT_WEIGHT) * 100.0
            
        if confidence >= CONFIDENCE_THRESHOLD:
            # Create match pair uniquely structured
            lost_id = item.id if report_type_str == "LOST" else candidate_id
            found_id = item.id if report_type_str == "FOUND" else candidate_id
            
            # Use savepoint logic gracefully for duplicate matches constraint violation
            try:
                # Convert numpy types to native Python types for psycopg2 compatibility
                match_lost_int = int(lost_id)
                match_found_int = int(found_id)
                img_sim_float = float(img_sim)
                text_sim_float = float(txt_sim)
                conf_float = float(confidence)

                new_match = Match(
                    lost_item_id=match_lost_int,
                    found_item_id=match_found_int,
                    image_similarity=img_sim_float,
                    text_similarity=text_sim_float,
                    confidence_score=conf_float
                )
                db.add(new_match)
                db.commit()
                db.refresh(new_match)
                logger.info(f"Match created between LOST {lost_id} and FOUND {found_id} (Score: {confidence:.2f})")
                
                # Fetch users for notification
                lost_item_record = db.query(Item).filter(Item.id == match_lost_int).first()
                found_item_record = db.query(Item).filter(Item.id == match_found_int).first()
                
                if lost_item_record and found_item_record:
                    if lost_item_record.user_id != found_item_record.user_id:
                        notification_service.create_match_notification(db, lost_item_record.user_id, new_match.id)
                        notification_service.create_match_notification(db, found_item_record.user_id, new_match.id)
                    else:
                        notification_service.create_match_notification(db, lost_item_record.user_id, new_match.id)
            except IntegrityError:
                db.rollback()
                logger.debug(f"Duplicate match prevention caught for LOST {lost_id} and FOUND {found_id}")
            except Exception as e:
                db.rollback()
                logger.error(f"Database error saving match: {e}")

    logger.info(f"Background processing complete for Item {item_id}")
