import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.database import get_db, Base, engine
from app.models import Item, Match, ReportType
import uuid

@pytest.fixture
def client():
    return TestClient(app)

# Define a fixture for clean database per test for matching logic
@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = next(get_db())
    yield db
    # We clean up only Match and Items created during tests
    db.query(Match).delete()
    db.query(Item).filter(Item.item_name.like("TestMatchItem%")).delete()
    db.commit()

# Provide a mock embedding to return consistently
MOCK_EMBEDDING = [0.1] * 512
MOCK_TEXT_EMBEDDING = [0.1] * 384

@pytest.fixture(autouse=True)
def mock_ai_services():
    with patch("ai.clip_service.CLIPService.generate_embedding", return_value=MOCK_EMBEDDING), \
         patch("ai.sbert_service.SBERTService.generate_embedding", return_value=MOCK_TEXT_EMBEDDING), \
         patch("ai.faiss_service.FAISSService.search_candidates") as mock_search:
        
        # We want to mock FAISS searching to return specific logic for tests
        def side_effect_search(query_item_id, query_report_type, *args, **kwargs):
            # For testing, we just simulate FAISS returning a high similarity for any opposite-type item in DB
            db = next(get_db())
            target = "FOUND" if query_report_type == "LOST" else "LOST"
            opposites = db.query(Item).filter(Item.report_type == target, Item.id != query_item_id, Item.item_name.like("TestMatchItem%")).all()
            
            candidates = {}
            for opp in opposites:
                # 90% image, 90% text -> 90% confidence
                candidates[opp.id] = {"image_similarity": 0.90, "text_similarity": 0.90}
            return candidates
            
        mock_search.side_effect = side_effect_search
        yield

def get_auth_headers(client, email, password, name):
    client.post("/api/auth/register", json={"email": email, "password": password, "name": name})
    response = client.post("/api/auth/login", data={"username": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_unauthorized_get_matches(client: TestClient):
    response = client.get("/api/matches/")
    assert response.status_code == 401

def test_authorized_get_matches(client: TestClient, db_session: Session):
    headers = get_auth_headers(client, "match1@test.com", "pass123", "User 1")
    response = client.get("/api/matches/", headers=headers)
    assert response.status_code == 200
    assert response.json() == []

def test_lost_and_found_creates_match(client: TestClient, db_session: Session):
    headers1 = get_auth_headers(client, "userA@test.com", "pass123", "User A")
    headers2 = get_auth_headers(client, "userB@test.com", "pass123", "User B")
    
    # User A creates a LOST item
    client.post("/api/items/", headers=headers1, data={
        "report_type": "LOST", "item_name": "TestMatchItem_Phone", "description": "Black phone", "location": "Park"
    })
    
    # User B creates a FOUND item
    # BackgroundTasks will execute synchronously in TestClient
    client.post("/api/items/", headers=headers2, data={
        "report_type": "FOUND", "item_name": "TestMatchItem_Phone2", "description": "Found a black phone", "location": "Park"
    })
    
    # Check User A's matches
    resp1 = client.get("/api/matches/", headers=headers1)
    assert resp1.status_code == 200
    matches = resp1.json()
    assert len(matches) == 1
    assert matches[0]["confidence_score"] >= 80.0
    
    # Check User B's matches (they should see the same match)
    resp2 = client.get("/api/matches/", headers=headers2)
    assert resp2.status_code == 200
    assert len(resp2.json()) == 1

def test_lost_and_lost_does_not_match(client: TestClient, db_session: Session):
    headers1 = get_auth_headers(client, "userC@test.com", "pass123", "User C")
    headers2 = get_auth_headers(client, "userD@test.com", "pass123", "User D")
    
    client.post("/api/items/", headers=headers1, data={
        "report_type": "LOST", "item_name": "TestMatchItem_Keys1", "description": "Keys", "location": "Home"
    })
    client.post("/api/items/", headers=headers2, data={
        "report_type": "LOST", "item_name": "TestMatchItem_Keys2", "description": "Keys", "location": "Home"
    })
    
    resp = client.get("/api/matches/", headers=headers1)
    assert len(resp.json()) == 0

def test_cross_user_access_is_rejected(client: TestClient, db_session: Session):
    headers1 = get_auth_headers(client, "userE@test.com", "pass", "E")
    headers2 = get_auth_headers(client, "userF@test.com", "pass", "F")
    headers3 = get_auth_headers(client, "userG@test.com", "pass", "G") # Unrelated user
    
    client.post("/api/items/", headers=headers1, data={"report_type": "LOST", "item_name": "TestMatchItem_X", "description": "X", "location": "X"})
    client.post("/api/items/", headers=headers2, data={"report_type": "FOUND", "item_name": "TestMatchItem_Y", "description": "Y", "location": "Y"})
    
    # E and F should see the match
    assert len(client.get("/api/matches/", headers=headers1).json()) == 1
    
    # G should NOT see the match
    resp3 = client.get("/api/matches/", headers=headers3)
    assert resp3.status_code == 200
    assert len(resp3.json()) == 0

def test_confidence_calculation_and_low_score_rejection(client: TestClient, db_session: Session):
    # Simulate a search returning low similarity
    with patch("ai.faiss_service.FAISSService.search_candidates", return_value={1: {"image_similarity": 0.1, "text_similarity": 0.1}}):
        headers = get_auth_headers(client, "userH@test.com", "pass", "H")
        
        # Creating a LOST item will trigger matching_engine but FAISS mock returns low score 0.1 (10% confidence)
        client.post("/api/items/", headers=headers, data={"report_type": "LOST", "item_name": "TestMatchItem_Low", "description": "L", "location": "L"})
        
        # Match should NOT be created because 10% < 80%
        resp = client.get("/api/matches/", headers=headers)
        assert len(resp.json()) == 0
