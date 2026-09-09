import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.models import User, Item, Match, Notification, NotificationType
from app.auth import get_password_hash
from app.database import get_db, Base, engine

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture(scope="function")
def db_session():
    db = next(get_db())
    yield db
    db.query(Notification).delete()
    db.query(Match).delete()
    db.query(Item).delete()
    db.query(User).filter(User.email.like("%notif@example.com")).delete()
    db.commit()

@pytest.fixture
def auth_headers(client, db_session: Session):
    import uuid
    email = f"notif_{uuid.uuid4().hex[:8]}@example.com"
    user = User(name="Notif User", email=email, hashed_password=get_password_hash("password123"))
    db_session.add(user)
    db_session.commit()
    
    response = client.post("/api/auth/login", data={"username": email, "password": "password123"})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, user

@pytest.fixture
def other_auth_headers(client, db_session: Session):
    import uuid
    email = f"othernotif_{uuid.uuid4().hex[:8]}@example.com"
    user = User(name="Other User", email=email, hashed_password=get_password_hash("password123"))
    db_session.add(user)
    db_session.commit()
    
    response = client.post("/api/auth/login", data={"username": email, "password": "password123"})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, user

@pytest.fixture
def test_match(db_session: Session, auth_headers, other_auth_headers):
    _, user1 = auth_headers
    _, user2 = other_auth_headers
    
    lost_item = Item(user_id=user1.id, report_type="LOST", item_name="Lost Keys", description="Keys", location="Park")
    found_item = Item(user_id=user2.id, report_type="FOUND", item_name="Found Keys", description="Keys", location="Park")
    db_session.add(lost_item)
    db_session.add(found_item)
    db_session.commit()
    
    match = Match(lost_item_id=lost_item.id, found_item_id=found_item.id, image_similarity=0.9, text_similarity=0.9, confidence_score=90.0, status="PENDING")
    db_session.add(match)
    db_session.commit()
    db_session.refresh(match)
    return match

def test_unauthenticated_requests(client):
    assert client.get("/api/notifications/").status_code == 401
    assert client.get("/api/notifications/unread-count").status_code == 401
    assert client.patch("/api/notifications/1/read").status_code == 401
    assert client.patch("/api/notifications/read-all").status_code == 401
    assert client.post("/api/matches/1/accept").status_code == 401

def test_notification_creation_and_retrieval(client, auth_headers, db_session, test_match):
    headers, user = auth_headers
    
    # Create notification manually
    notif = Notification(user_id=user.id, type=NotificationType.MATCH_FOUND, title="Test", message="Test Message", related_match_id=test_match.id)
    db_session.add(notif)
    db_session.commit()
    
    resp = client.get("/api/notifications/", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert any(n["title"] == "Test" for n in data["items"])

def test_unread_count_and_read(client, auth_headers, db_session):
    headers, user = auth_headers
    
    notif = Notification(user_id=user.id, type=NotificationType.MATCH_FOUND, title="Unread", message="Msg")
    db_session.add(notif)
    db_session.commit()
    
    resp = client.get("/api/notifications/unread-count", headers=headers)
    assert resp.status_code == 200
    initial_count = resp.json()["count"]
    assert initial_count >= 1
    
    # Mark read
    resp = client.patch(f"/api/notifications/{notif.id}/read", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["is_read"] == True
    
    # Check count decreased
    resp = client.get("/api/notifications/unread-count", headers=headers)
    assert resp.json()["count"] == initial_count - 1

def test_read_all(client, auth_headers, db_session):
    headers, user = auth_headers
    notif1 = Notification(user_id=user.id, type=NotificationType.MATCH_FOUND, title="1", message="1")
    notif2 = Notification(user_id=user.id, type=NotificationType.MATCH_FOUND, title="2", message="2")
    db_session.add(notif1)
    db_session.add(notif2)
    db_session.commit()
    
    resp = client.patch("/api/notifications/read-all", headers=headers)
    assert resp.status_code == 200
    
    resp = client.get("/api/notifications/unread-count", headers=headers)
    assert resp.json()["count"] == 0

def test_other_user_notification_access(client, auth_headers, other_auth_headers, db_session):
    headers1, user1 = auth_headers
    headers2, user2 = other_auth_headers
    
    notif = Notification(user_id=user1.id, type=NotificationType.MATCH_FOUND, title="Secret", message="Secret")
    db_session.add(notif)
    db_session.commit()
    
    # User 2 tries to read user 1's notification
    resp = client.patch(f"/api/notifications/{notif.id}/read", headers=headers2)
    assert resp.status_code == 404

def test_match_accept(client, auth_headers, test_match, db_session):
    headers, user = auth_headers
    
    resp = client.post(f"/api/matches/{test_match.id}/accept", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ACCEPTED"
    assert data["resolved_by_user_id"] == user.id
    assert data["resolved_at"] is not None
    
    # Verify notification created for the OTHER user
    other_user_id = db_session.query(Item).filter(Item.id == test_match.found_item_id).first().user_id
    notif = db_session.query(Notification).filter(Notification.user_id == other_user_id).first()
    assert notif is not None
    assert notif.type == NotificationType.MATCH_ACCEPTED

def test_match_reject(client, auth_headers, test_match, db_session):
    headers, user = auth_headers
    
    resp = client.post(f"/api/matches/{test_match.id}/reject", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "REJECTED"
    
    # Try accepting a rejected match
    resp = client.post(f"/api/matches/{test_match.id}/accept", headers=headers)
    assert resp.status_code == 409
    
import uuid

def test_unauthorized_match_resolution(client, auth_headers, test_match, db_session):
    # Create completely unrelated user
    random_email = f"random_{uuid.uuid4().hex[:8]}@example.com"
    user = User(name="Random User", email=random_email, hashed_password=get_password_hash("password123"))
    db_session.add(user)
    db_session.commit()
    
    response = client.post("/api/auth/login", data={"username": random_email, "password": "password123"})
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = client.post(f"/api/matches/{test_match.id}/accept", headers=headers)
    assert resp.status_code == 403
