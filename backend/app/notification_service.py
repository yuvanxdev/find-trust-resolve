import logging
from sqlalchemy.orm import Session
from typing import Optional
from app.models import Notification, NotificationType, User

logger = logging.getLogger(__name__)

class NotificationService:
    @staticmethod
    def _create_notification_safe(db: Session, notification: Notification):
        try:
            db.add(notification)
            db.commit()
            db.refresh(notification)
            return notification
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create notification: {e}")
            return None

    def create_match_notification(self, db: Session, user_id: int, match_id: int):
        notification = Notification(
            user_id=user_id,
            type=NotificationType.MATCH_FOUND,
            title="New Match Found!",
            message="A potential match has been found for your item. Please review it.",
            related_match_id=match_id
        )
        return self._create_notification_safe(db, notification)

    def create_verification_notification(self, db: Session, user_id: int, match_id: int, verification_id: int, status: str):
        title = "Verification Update"
        message = f"Your Gemini ownership verification is now: {status}."
        if status == "VERIFIED":
            title = "Verification Successful"
            message = "Your ownership claim has been verified successfully by Gemini."
        elif status == "REJECTED":
            title = "Verification Rejected"
            message = "Your ownership claim was rejected based on the verification answers."
            
        notification = Notification(
            user_id=user_id,
            type=NotificationType.VERIFICATION_COMPLETED,
            title=title,
            message=message,
            related_match_id=match_id,
            related_verification_id=verification_id
        )
        return self._create_notification_safe(db, notification)

    def create_document_verification_notification(self, db: Session, user_id: int, match_id: int, verification_id: int, status: str):
        title = "Document Verification Update"
        message = f"Your document verification is now: {status}."
        if status == "VERIFIED":
            title = "Document Verified"
            message = "Your document has been verified successfully."
        elif status == "NEEDS_REVIEW":
            title = "Document Needs Review"
            message = "Your document requires manual review."
        elif status == "REJECTED":
            title = "Document Rejected"
            message = "Your document verification was rejected."

        notification = Notification(
            user_id=user_id,
            type=NotificationType.DOCUMENT_VERIFICATION_COMPLETED,
            title=title,
            message=message,
            related_match_id=match_id,
            related_verification_id=verification_id
        )
        return self._create_notification_safe(db, notification)

    def create_match_resolution_notification(self, db: Session, user_id: int, match_id: int, status: str):
        title = f"Match {status.capitalize()}"
        message = f"Match #{match_id} has been {status.lower()}."
        
        notification_type = NotificationType.MATCH_ACCEPTED if status == "ACCEPTED" else NotificationType.MATCH_REJECTED
        
        notification = Notification(
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            related_match_id=match_id
        )
        return self._create_notification_safe(db, notification)

    def create_chat_notification(self, db: Session, user_id: int, match_id: int):
        notification = Notification(
            user_id=user_id,
            type=NotificationType.MATCH_ACCEPTED,  # Reusing MATCH_ACCEPTED for now or general message
            title="New Chat Message",
            message=f"You have a new message regarding match #{match_id}.",
            related_match_id=match_id
        )
        return self._create_notification_safe(db, notification)

    def create_preference_alert_notification(
        self,
        db: Session,
        user_id: int,
        item_name: str,
        location: str,
        title: Optional[str] = None,
        message: Optional[str] = None,
        item_id: Optional[int] = None
    ):
        if not title:
            title = "Preferred Area Alert"
        if not message:
            loc_str = f" at {location}" if location else ""
            message = f"An item matching your preferences ('{item_name}') was reported{loc_str}."

        notification = Notification(
            user_id=user_id,
            type=NotificationType.PREFERRED_ITEM_ALERT,
            title=title,
            message=message,
            related_item_id=item_id
        )
        return self._create_notification_safe(db, notification)

    def check_and_notify_preferences(
        self,
        db: Session,
        reporter_user_id: int,
        item_id: int,
        item_name: str,
        category: Optional[str],
        location: Optional[str],
        report_type: Optional[str] = None
    ):
        try:
            candidates = db.query(User).filter(
                User.id != reporter_user_id,
                (User.preferred_categories.is_not(None)) | (User.preferred_locations.is_not(None))
            ).all()

            norm_item_cat = (category or "").strip().lower()
            norm_item_loc = (location or "").strip().lower()

            def normalize_category_name(c: str) -> str:
                clean = c.strip().lower()
                if clean in ("ids", "id", "id card", "id cards", "documents", "document"):
                    return "documents"
                return clean

            clean_item_cat = normalize_category_name(norm_item_cat)

            for u in candidates:
                pref_enabled = getattr(u, 'preference_notifications_enabled', 1)
                if pref_enabled == 0 or pref_enabled is False:
                    continue

                cat_match = False
                matched_cat_name = None
                if clean_item_cat and u.preferred_categories and isinstance(u.preferred_categories, list):
                    for pc in u.preferred_categories:
                        if not pc:
                            continue
                        clean_pc = normalize_category_name(str(pc))
                        if clean_pc == clean_item_cat or clean_pc in clean_item_cat or clean_item_cat in clean_pc:
                            cat_match = True
                            matched_cat_name = str(pc)
                            break

                loc_match = False
                matched_loc_name = None
                if norm_item_loc and u.preferred_locations and isinstance(u.preferred_locations, list):
                    for pl in u.preferred_locations:
                        if not pl:
                            continue
                        norm_pl = str(pl).strip().lower()
                        if not norm_pl:
                            continue
                        # Case-insensitive substring match
                        if norm_pl in norm_item_loc or norm_item_loc in norm_pl:
                            loc_match = True
                            matched_loc_name = str(pl)
                            break

                if cat_match or loc_match:
                    item_type_label = "A found item" if report_type == "FOUND" else ("A lost item" if report_type == "LOST" else "An item")

                    if loc_match and cat_match:
                        title = "Preferred Area & Category Alert"
                        loc_display = location or matched_loc_name
                        message = f"{item_type_label} ('{item_name}') matching your preferred category ({matched_cat_name or category}) was reported in your preferred area: {loc_display}."
                    elif loc_match:
                        title = "Preferred Area Alert"
                        loc_display = location or matched_loc_name
                        message = f"{item_type_label} ('{item_name}') was reported in your preferred area: {loc_display}."
                    else:
                        title = "Preferred Category Alert"
                        loc_suffix = f" at {location}" if location else ""
                        message = f"{item_type_label} ('{item_name}') matching your preferred category ({matched_cat_name or category}) was reported{loc_suffix}."

                    self.create_preference_alert_notification(
                        db=db,
                        user_id=u.id,
                        item_name=item_name,
                        location=location or "",
                        title=title,
                        message=message,
                        item_id=item_id
                    )
        except Exception as e:
            logger.error(f"Failed checking preferences: {e}")

notification_service = NotificationService()
