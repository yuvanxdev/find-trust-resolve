from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional, List
from datetime import datetime
import enum

class ReportType(str, enum.Enum):
    LOST = "LOST"
    FOUND = "FOUND"

class HealthResponse(BaseModel):
    status: str

class DBHealthResponse(BaseModel):
    status: str
    database: str

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    avatar_path: Optional[str] = None
    phone_number: Optional[str] = None
    bio: Optional[str] = None
    department: Optional[str] = None
    year_of_study: Optional[str] = None
    section_class: Optional[str] = None
    graduation_year: Optional[str] = None
    campus: Optional[str] = None
    building: Optional[str] = None
    floor: Optional[str] = None
    classroom: Optional[str] = None
    lab_room: Optional[str] = None
    hostel: Optional[str] = None
    timezone: Optional[str] = None
    show_email: Optional[int] = None
    show_phone: Optional[int] = None
    show_classroom: Optional[int] = None
    show_hostel: Optional[int] = None
    preferred_categories: Optional[List[str]] = None
    preferred_locations: Optional[List[str]] = None
    preference_notifications_enabled: bool = True

    model_config = ConfigDict(from_attributes=True)

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar_path: Optional[str] = None
    phone_number: Optional[str] = None
    bio: Optional[str] = None
    department: Optional[str] = None
    year_of_study: Optional[str] = None
    section_class: Optional[str] = None
    graduation_year: Optional[str] = None
    campus: Optional[str] = None
    building: Optional[str] = None
    floor: Optional[str] = None
    classroom: Optional[str] = None
    lab_room: Optional[str] = None
    hostel: Optional[str] = None
    timezone: Optional[str] = None
    show_email: Optional[int] = None
    show_phone: Optional[int] = None
    show_classroom: Optional[int] = None
    show_hostel: Optional[int] = None
    preferred_categories: Optional[List[str]] = None
    preferred_locations: Optional[List[str]] = None
    preference_notifications_enabled: Optional[bool] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

class ItemResponse(BaseModel):
    id: int
    user_id: int
    report_type: ReportType
    item_name: str
    description: str
    category: Optional[str] = None
    color: Optional[str] = None
    brand: Optional[str] = None
    location: str
    date_reported: Optional[datetime] = None
    image_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class PublicItemResponse(BaseModel):
    id: int
    report_type: ReportType
    item_name: str
    description: str
    category: Optional[str] = None
    color: Optional[str] = None
    brand: Optional[str] = None
    location: str
    date_reported: Optional[datetime] = None
    image_path: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class MatchResponse(BaseModel):
    id: int
    lost_item_id: int
    found_item_id: int
    image_similarity: float
    text_similarity: float
    confidence_score: float
    status: str
    resolved_by_user_id: Optional[int] = None
    resolved_at: Optional[datetime] = None
    other_user_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

from typing import List, Dict, Any

class VerificationQuestion(BaseModel):
    question_id: str
    question_text: str

class VerificationStartResponse(BaseModel):
    verification_id: int
    match_id: int
    status: str
    claimant_status: str
    finder_status: str
    claimant_user_id: int
    finder_user_id: int
    questions: List[VerificationQuestion]

class VerificationAnswerRequest(BaseModel):
    answers: Dict[str, str]

class VerificationResponse(BaseModel):
    verification_id: int
    match_id: int
    status: str
    claimant_status: str
    finder_status: str
    confidence_score: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class DocumentVerificationResponse(BaseModel):
    id: int
    verification_id: Optional[int] = None
    match_id: int
    document_type: str
    ocr_status: str
    verification_status: str
    extracted_fields: Optional[Dict[str, Any]] = None
    matched_fields: Optional[Dict[str, Any]] = None
    confidence_score: Optional[float] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class NotificationResponse(BaseModel):
    id: int
    user_id: int
    type: str
    title: str
    message: str
    related_match_id: Optional[int] = None
    related_verification_id: Optional[int] = None
    related_item_id: Optional[int] = None
    related_user_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    total: int
    page: int
    limit: int

class UnreadCountResponse(BaseModel):
    count: int

class ChatMessageCreate(BaseModel):
    message: Optional[str] = ""
    image_path: Optional[str] = None

class ChatMessageResponse(BaseModel):
    id: int
    session_id: int
    sender_id: int
    message: Optional[str] = None
    image_path: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ChatSessionResponse(BaseModel):
    id: int
    match_id: int
    user1_id: int
    user2_id: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
