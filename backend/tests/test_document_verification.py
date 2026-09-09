import pytest
import os
import uuid
from fastapi.testclient import TestClient

from app.main import app
from app.models import Match, Verification, VerificationStatus, Item, User, ReportType, DocumentVerification

client = TestClient(app)

from app.database import get_db, Base, engine

@pytest.fixture(scope="session", autouse=True)
def setup_and_teardown():
    Base.metadata.create_all(bind=engine)
    yield
    db = next(get_db())
    try:
        test_users = db.query(User).filter(User.email.like("doc_test_%")).all()
        for user in test_users:
            db.delete(user)
        db.commit()
    except:
        db.rollback()

@pytest.fixture
def test_db():
    return next(get_db())

@pytest.fixture
def test_user(test_db):
    from app.auth import get_password_hash
    email = f"doc_test_{uuid.uuid4().hex[:8]}@example.com"
    user = User(name="Doc Test User", email=email, hashed_password=get_password_hash("password"))
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user

@pytest.fixture
def auth_headers(test_user, test_db):
    from app.auth import create_access_token
    from datetime import timedelta
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": test_user.email}, expires_delta=access_token_expires
    )
    return {"Authorization": f"Bearer {access_token}"}

@pytest.fixture
def test_match(test_db, test_user):
    lost_item = Item(
        user_id=test_user.id,
        report_type=ReportType.LOST,
        item_name="Lost Phone",
        description="Iphone 15 Pro",
        location="Park",
        color="Black",
        brand="Apple"
    )
    test_db.add(lost_item)
    test_db.commit()
    test_db.refresh(lost_item)

    from app.auth import get_password_hash
    finder_email = f"doc_test_{uuid.uuid4().hex[:8]}@example.com"
    finder = User(name="Finder", email=finder_email, hashed_password=get_password_hash("password"))
    test_db.add(finder)
    test_db.commit()
    test_db.refresh(finder)

    found_item = Item(
        user_id=finder.id,
        report_type=ReportType.FOUND,
        item_name="Found Phone",
        description="Looks like a black iphone",
        location="Park"
    )
    test_db.add(found_item)
    test_db.commit()
    test_db.refresh(found_item)

    match = Match(
        lost_item_id=lost_item.id,
        found_item_id=found_item.id,
        image_similarity=0.9,
        text_similarity=0.9,
        confidence_score=0.9
    )
    test_db.add(match)
    test_db.commit()
    test_db.refresh(match)
    return match

@pytest.fixture
def test_image():
    # Create a 1x1 dummy image for testing uploads
    import io
    from PIL import Image
    image = Image.new('RGB', (100, 100))
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)
    return img_byte_arr

from unittest.mock import patch

def test_upload_document_unauthenticated(test_match, test_image):
    response = client.post(f"/api/documents/verify/{test_match.id}", 
                           data={"document_type": "RECEIPT"}, 
                           files={"file": ("test.jpg", test_image, "image/jpeg")})
    assert response.status_code == 401

def test_upload_document_unauthorized(test_db, test_match, test_image):
    # Try to verify using finder's token (not claimant)
    finder = test_db.query(Item).filter(Item.id == test_match.found_item_id).first().owner
    from app.auth import create_access_token
    from datetime import timedelta
    access_token = create_access_token(data={"sub": finder.email}, expires_delta=timedelta(minutes=30))
    finder_headers = {"Authorization": f"Bearer {access_token}"}
    
    response = client.post(f"/api/documents/verify/{test_match.id}", 
                           headers=finder_headers,
                           data={"document_type": "RECEIPT"}, 
                           files={"file": ("test.jpg", test_image, "image/jpeg")})
    assert response.status_code == 403
    assert "Not authorized" in response.json()["detail"]

@patch("ai.document_verification_engine.document_verification_engine.process_verification_background")
def test_upload_document_success(mock_process, auth_headers, test_match, test_image, test_db):
    response = client.post(f"/api/documents/verify/{test_match.id}", 
                           headers=auth_headers,
                           data={"document_type": "RECEIPT"}, 
                           files={"file": ("test.jpg", test_image, "image/jpeg")})
    
    assert response.status_code == 200
    data = response.json()
    assert data["document_type"] == "RECEIPT"
    assert data["ocr_status"] == "PENDING"
    assert data["verification_status"] == "PENDING"
    assert mock_process.called

def test_upload_invalid_mime(auth_headers, test_match):
    response = client.post(f"/api/documents/verify/{test_match.id}", 
                           headers=auth_headers,
                           data={"document_type": "RECEIPT"}, 
                           files={"file": ("test.txt", b"hello world", "text/plain")})
    
    assert response.status_code == 400
    assert "Invalid file type" in response.json()["detail"]

def test_get_document_verification(auth_headers, test_match, test_db, test_user):
    doc_ver = DocumentVerification(
        match_id=test_match.id,
        claimant_user_id=test_user.id,
        document_type="RECEIPT",
        file_path="dummy.jpg",
        ocr_status="COMPLETED",
        verification_status="VERIFIED",
        confidence_score=90.0
    )
    test_db.add(doc_ver)
    test_db.commit()
    test_db.refresh(doc_ver)

    response = client.get(f"/api/documents/verification/{doc_ver.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["verification_status"] == "VERIFIED"
    assert data["confidence_score"] == 90.0

@patch("ai.easyocr_service.easyocr_service.extract_text")
def test_background_engine_logic_verified(mock_extract, test_db, test_user, test_match):
    from ai.document_verification_engine import document_verification_engine
    
    doc_ver = DocumentVerification(
        match_id=test_match.id,
        claimant_user_id=test_user.id,
        document_type="RECEIPT",
        file_path="dummy.jpg",
    )
    test_db.add(doc_ver)
    test_db.commit()
    test_db.refresh(doc_ver)

    # Mock OCR extraction to contain the phone details
    mock_extract.return_value = ["Apple Store", "iPhone 15 Pro", "Color: Black", "Receipt", "Lost Phone", "Doc User"]
    
    document_verification_engine.process_verification_background(doc_ver.id)

    test_db.expire_all()
    updated = test_db.query(DocumentVerification).filter(DocumentVerification.id == doc_ver.id).first()
    
    assert updated.ocr_status == "COMPLETED"
    assert updated.verification_status == "VERIFIED"
    assert updated.confidence_score >= 80.0

@patch("ai.easyocr_service.easyocr_service.extract_text")
def test_background_engine_logic_rejected(mock_extract, test_db, test_user, test_match):
    from ai.document_verification_engine import document_verification_engine
    
    doc_ver = DocumentVerification(
        match_id=test_match.id,
        claimant_user_id=test_user.id,
        document_type="RECEIPT",
        file_path="dummy.jpg",
    )
    test_db.add(doc_ver)
    test_db.commit()
    test_db.refresh(doc_ver)

    # Mock OCR extraction that contains completely unrelated info
    mock_extract.return_value = ["McDonalds", "Big Mac", "Fries"]
    
    document_verification_engine.process_verification_background(doc_ver.id)

    test_db.expire_all()
    updated = test_db.query(DocumentVerification).filter(DocumentVerification.id == doc_ver.id).first()
    
    assert updated.ocr_status == "COMPLETED"
    assert updated.verification_status == "REJECTED"
    assert updated.confidence_score < 40.0
