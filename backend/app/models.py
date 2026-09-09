from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum as SQLEnum, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from sqlalchemy.types import TypeDecorator, JSON
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
import enum

class ArrayType(TypeDecorator):
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PG_ARRAY(Float()))
        else:
            return dialect.type_descriptor(JSON())

    def process_bind_param(self, value, dialect):
        return value

    def process_result_value(self, value, dialect):
        return value
class ReportType(str, enum.Enum):
    LOST = "LOST"
    FOUND = "FOUND"


class VerificationStatus(str, enum.Enum):
    PENDING = "PENDING"
    QUESTIONS_GENERATED = "QUESTIONS_GENERATED"
    PARTIAL = "PARTIAL"
    ANSWERED = "ANSWERED"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    ERROR = "ERROR"

class NotificationType(str, enum.Enum):
    MATCH_FOUND = "MATCH_FOUND"
    VERIFICATION_COMPLETED = "VERIFICATION_COMPLETED"
    DOCUMENT_VERIFICATION_COMPLETED = "DOCUMENT_VERIFICATION_COMPLETED"
    MATCH_ACCEPTED = "MATCH_ACCEPTED"
    MATCH_REJECTED = "MATCH_REJECTED"
    RETURN_READY = "RETURN_READY"
    HANDOVER_READY = "HANDOVER_READY"
    HANDOVER_CONFIRMED = "HANDOVER_CONFIRMED"
    RECEIPT_CONFIRMED = "RECEIPT_CONFIRMED"
    CASE_COMPLETED = "CASE_COMPLETED"
    PREFERRED_ITEM_ALERT = "PREFERRED_ITEM_ALERT"

class HealthTest(Base):
    __tablename__ = "health_test"
    id = Column(Integer, primary_key=True, index=True)
    status = Column(String, index=True)

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    avatar_path = Column(String, nullable=True)
    
    # Profile Settings Fields
    phone_number = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    department = Column(String, nullable=True)
    year_of_study = Column(String, nullable=True)
    section_class = Column(String, nullable=True)
    graduation_year = Column(String, nullable=True)
    
    campus = Column(String, nullable=True)
    building = Column(String, nullable=True)
    floor = Column(String, nullable=True)
    classroom = Column(String, nullable=True)
    lab_room = Column(String, nullable=True)
    hostel = Column(String, nullable=True)
    timezone = Column(String, nullable=True)
    
    # Privacy toggles (1 = True, 0 = False)
    show_email = Column(Integer, default=1)
    show_phone = Column(Integer, default=0)
    show_classroom = Column(Integer, default=1)
    show_hostel = Column(Integer, default=0)
    
    # Preferences
    preferred_categories = Column(JSON, nullable=True)
    preferred_locations = Column(JSON, nullable=True)
    preference_notifications_enabled = Column(Integer, default=1)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    items = relationship("Item", back_populates="owner", cascade="all, delete-orphan")

class Item(Base):
    __tablename__ = "items"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    report_type = Column(SQLEnum(ReportType), index=True, nullable=False)
    item_name = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, nullable=True)
    color = Column(String, nullable=True)
    brand = Column(String, nullable=True)
    location = Column(String, nullable=False)
    date_reported = Column(DateTime(timezone=True), default=func.now())
    image_path = Column(String, nullable=True)
    image_embedding = Column(ArrayType, nullable=True)
    text_embedding = Column(ArrayType, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    owner = relationship("User", back_populates="items")

class Match(Base):
    __tablename__ = "matches"
    
    id = Column(Integer, primary_key=True, index=True)
    lost_item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), index=True, nullable=False)
    found_item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), index=True, nullable=False)
    image_similarity = Column(Float, nullable=False)
    text_similarity = Column(Float, nullable=False)
    confidence_score = Column(Float, nullable=False)
    status = Column(String, default="PENDING", index=True)
    resolved_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    __table_args__ = (UniqueConstraint("lost_item_id", "found_item_id", name="uq_match_pair"),)

class Verification(Base):
    __tablename__ = "verifications"
    
    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), index=True, nullable=False)
    claimant_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    finder_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    verification_status = Column(String, default=VerificationStatus.PENDING, index=True)
    questions = Column(JSON, nullable=True)
    claimant_status = Column(String, default=VerificationStatus.PENDING)
    claimant_answers = Column(JSON, nullable=True)
    finder_status = Column(String, default=VerificationStatus.PENDING)
    finder_answers = Column(JSON, nullable=True)
    confidence_score = Column(Float, nullable=True)
    matched_fields = Column(JSON, nullable=True)
    missing_fields = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class DocumentVerification(Base):
    __tablename__ = "document_verifications"
    
    id = Column(Integer, primary_key=True, index=True)
    verification_id = Column(Integer, ForeignKey("verifications.id", ondelete="CASCADE"), index=True, nullable=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), index=True, nullable=False)
    claimant_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    document_type = Column(String, nullable=False) # e.g. RECEIPT, ID_PROOF, OWNERSHIP_DOCUMENT, OTHER
    file_path = Column(String, nullable=False)
    original_filename = Column(String, nullable=True)
    ocr_status = Column(String, default="PENDING", index=True)
    verification_status = Column(String, default="PENDING", index=True)
    extracted_fields = Column(JSON, nullable=True)
    matched_fields = Column(JSON, nullable=True)
    missing_fields = Column(JSON, nullable=True)
    confidence_score = Column(Float, nullable=True)
    rejection_reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    type = Column(SQLEnum(NotificationType), index=True, nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    related_match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), index=True, nullable=True)
    related_verification_id = Column(Integer, ForeignKey("verifications.id", ondelete="CASCADE"), index=True, nullable=True)
    related_item_id = Column(Integer, ForeignKey("items.id", ondelete="CASCADE"), index=True, nullable=True)
    is_read = Column(Integer, default=0, index=True) # SQLite/PG compatible Boolean stand-in or just Boolean
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

class ReturnWorkflowStatus(str, enum.Enum):
    RETURN_PENDING = "RETURN_PENDING"
    HANDOVER_PENDING = "HANDOVER_PENDING"
    HANDOVER_CONFIRMED = "HANDOVER_CONFIRMED"
    COMPLETED = "COMPLETED"

class ReturnWorkflow(Base):
    __tablename__ = "return_workflows"
    
    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), index=True, nullable=False, unique=True)
    status = Column(String, default=ReturnWorkflowStatus.RETURN_PENDING, index=True)
    owner_ready = Column(Integer, default=0) # 0 or 1 for boolean
    finder_ready = Column(Integer, default=0) # 0 or 1 for boolean
    owner_contact_shared = Column(Integer, default=0)
    finder_contact_shared = Column(Integer, default=0)
    owner_contact_info = Column(JSON, nullable=True)
    finder_contact_info = Column(JSON, nullable=True)
    meeting_location = Column(String, nullable=True)
    meeting_location_shared_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    handover_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    receipt_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    user1_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    user2_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    is_active = Column(Integer, default=1, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    message = Column(Text, nullable=True)
    image_path = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

