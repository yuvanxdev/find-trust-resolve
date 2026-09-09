import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.models import Match, Verification, VerificationStatus, Item, User
import uuid

client = TestClient(app)

from app.database import get_db, Base, engine

@pytest.fixture(scope="session", autouse=True)
def setup_and_teardown():
    Base.metadata.create_all(bind=engine)
    yield
    db = next(get_db())
    try:
        test_users = db.query(User).filter(User.email.like("testuser_verif_%")).all()
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
    from app.models import User
    from app.auth import get_password_hash
    import uuid
    email = f"testuser_verif_{uuid.uuid4().hex[:8]}@example.com"
    user = User(name="Test User", email=email, hashed_password=get_password_hash("password"))
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user

@pytest.fixture
def auth_headers(test_user, test_db):
    from app.auth import create_access_token
    from datetime import timedelta
    access_token = create_access_token(
        data={"sub": test_user.email}, expires_delta=timedelta(minutes=30)
    )
    return {"Authorization": f"Bearer {access_token}"}

@pytest.fixture
def other_user_headers(test_db):
    from app.models import User
    from app.auth import get_password_hash, create_access_token
    from datetime import timedelta
    
    import uuid
    other_email = f"other_{uuid.uuid4().hex[:8]}@example.com"
    other_user = User(name="Other User", email=other_email, hashed_password=get_password_hash("password"))
    test_db.add(other_user)
    test_db.commit()
    test_db.refresh(other_user)
    
    access_token = create_access_token(
        data={"sub": other_user.email}, expires_delta=timedelta(minutes=30)
    )
    return {"Authorization": f"Bearer {access_token}"}

@pytest.fixture
def test_match(test_db, test_user):
    from app.models import ReportType
    
    lost_item = Item(
        user_id=test_user.id,
        report_type=ReportType.LOST,
        item_name="Lost Wallet",
        description="Black leather wallet",
        location="Park"
    )
    test_db.add(lost_item)
    test_db.commit()
    test_db.refresh(lost_item)
    
    # Another user owns the found item
    from app.models import User
    from app.auth import get_password_hash
    finder_email = f"finder_{uuid.uuid4().hex[:8]}@example.com"
    finder = User(name="Finder", email=finder_email, hashed_password=get_password_hash("password"))
    test_db.add(finder)
    test_db.commit()
    test_db.refresh(finder)
    
    found_item = Item(
        user_id=finder.id,
        report_type=ReportType.FOUND,
        item_name="Found Wallet",
        description="Black leather wallet with ID",
        location="Park"
    )
    test_db.add(found_item)
    test_db.commit()
    test_db.refresh(found_item)
    
    match = Match(
        lost_item_id=lost_item.id,
        found_item_id=found_item.id,
        image_similarity=0.9,
        text_similarity=0.85,
        confidence_score=0.87,
        status="PENDING"
    )
    test_db.add(match)
    test_db.commit()
    test_db.refresh(match)
    
    return match

@patch("ai.gemini_service.gemini_service.generate_questions")
def test_start_verification(mock_generate_questions, auth_headers, test_match, test_db):
    mock_generate_questions.return_value = [
        {"question_id": "q1", "question_text": "What color is the wallet?"},
        {"question_id": "q2", "question_text": "What is inside it?"}
    ]
    
    response = client.post(f"/api/verification/start/{test_match.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["match_id"] == test_match.id
    assert data["status"] == "QUESTIONS_GENERATED"
    assert len(data["questions"]) == 2
    assert "question_text" in data["questions"][0]

@patch("ai.gemini_service.gemini_service.generate_questions")
def test_start_verification_unauthorized(mock_generate_questions, other_user_headers, test_match):
    # Try to start verification for a match where the lost item belongs to test_user, not other_user
    response = client.post(f"/api/verification/start/{test_match.id}", headers=other_user_headers)
    assert response.status_code == 403

def test_start_verification_unauthenticated(test_match):
    response = client.post(f"/api/verification/start/{test_match.id}")
    assert response.status_code == 401

@patch("ai.gemini_service.gemini_service.evaluate_answers")
def test_answer_verification(mock_evaluate_answers, auth_headers, test_match, test_db, test_user):
    found_item = test_db.query(Item).filter(Item.id == test_match.found_item_id).first()
    # Setup a verification session in QUESTIONS_GENERATED state with finder already answered
    verification = Verification(
        match_id=test_match.id,
        claimant_user_id=test_user.id,
        finder_user_id=found_item.user_id,
        finder_status=VerificationStatus.ANSWERED,
        finder_answers={"q1": "Black"},
        verification_status=VerificationStatus.QUESTIONS_GENERATED,
        questions=[{"question_id": "q1", "question_text": "Color?"}]
    )
    test_db.add(verification)
    test_db.commit()
    test_db.refresh(verification)
    
    mock_evaluate_answers.return_value = {
        "status": "VERIFIED",
        "confidence_score": 95.5,
        "matched_fields": ["Color"],
        "missing_fields": []
    }
    
    payload = {
        "answers": {
            "q1": "Black"
        }
    }
    
    response = client.post(f"/api/verification/answer/{verification.id}", json=payload, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "VERIFIED"
    
    # Check DB
    test_db.expire_all()
    db_ver = test_db.query(Verification).filter(Verification.id == verification.id).first()
    assert db_ver.verification_status == "VERIFIED"
    assert db_ver.confidence_score == 95.5

@patch("ai.gemini_service.gemini_service.evaluate_answers")
def test_answer_verification_invalid_state(mock_evaluate_answers, auth_headers, test_match, test_db, test_user):
    # Setup a verification session already VERIFIED
    verification = Verification(
        match_id=test_match.id,
        claimant_user_id=test_user.id,
        verification_status=VerificationStatus.VERIFIED,
        questions=[]
    )
    test_db.add(verification)
    test_db.commit()
    
    payload = {"answers": {"q1": "Black"}}
    response = client.post(f"/api/verification/answer/{verification.id}", json=payload, headers=auth_headers)
    assert response.status_code == 400

def test_get_verification_status(auth_headers, test_match, test_db, test_user):
    verification = Verification(
        match_id=test_match.id,
        claimant_user_id=test_user.id,
        verification_status=VerificationStatus.PENDING
    )
    test_db.add(verification)
    test_db.commit()
    test_db.refresh(verification)
    
    response = client.get(f"/api/verification/{verification.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "PENDING"
    assert "questions" not in data # Should not leak questions on get
    assert "matched_fields" not in data # Should not leak hidden truth

@patch("ai.gemini_service.gemini_service.generate_questions")
def test_start_verification_finder(mock_generate_questions, test_match, test_db):
    mock_generate_questions.return_value = [{"question_id": "q1", "question_text": "Color?"}]
    
    from app.models import Item
    finder = test_db.query(Item).filter(Item.id == test_match.found_item_id).first().owner
    from app.auth import create_access_token
    from datetime import timedelta
    access_token = create_access_token(data={"sub": finder.email}, expires_delta=timedelta(minutes=30))
    finder_headers = {"Authorization": f"Bearer {access_token}"}
    
    response = client.post(f"/api/verification/start/{test_match.id}", headers=finder_headers)
    assert response.status_code == 200

def test_get_verification_status_finder(test_match, test_db, test_user):
    verification = Verification(
        match_id=test_match.id,
        claimant_user_id=test_user.id,
        verification_status=VerificationStatus.PENDING
    )
    test_db.add(verification)
    test_db.commit()
    test_db.refresh(verification)
    
    from app.models import Item
    finder = test_db.query(Item).filter(Item.id == test_match.found_item_id).first().owner
    from app.auth import create_access_token
    from datetime import timedelta
    access_token = create_access_token(data={"sub": finder.email}, expires_delta=timedelta(minutes=30))
    finder_headers = {"Authorization": f"Bearer {access_token}"}
    
    response = client.get(f"/api/verification/{verification.id}", headers=finder_headers)
    assert response.status_code == 200

def test_start_verification_wrong_match_id(auth_headers):
    response = client.post("/api/verification/start/999999", headers=auth_headers)
    assert response.status_code == 404

