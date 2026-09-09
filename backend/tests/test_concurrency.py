import pytest
import threading
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.database import engine, Base, SessionLocal
from app.models import Match, Item, User

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield

def get_auth_headers(client, email, password, name):
    client.post("/api/auth/register", json={"email": email, "password": password, "name": name})
    response = client.post("/api/auth/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}

def test_concurrent_match_resolution():
    headers_a = get_auth_headers(client, "user_concur_a@test.com", "pass", "A")
    headers_b = get_auth_headers(client, "user_concur_b@test.com", "pass", "B")

    # Create users manually via DB to get their IDs
    db = SessionLocal()
    user_a = db.query(User).filter(User.email == "user_concur_a@test.com").first()
    user_b = db.query(User).filter(User.email == "user_concur_b@test.com").first()
    
    item1 = Item(user_id=user_a.id, item_name="Lost Item", description="...", report_type="LOST", location="NYC")
    item2 = Item(user_id=user_b.id, item_name="Found Item", description="...", report_type="FOUND", location="NYC")
    db.add(item1)
    db.add(item2)
    db.commit()
    db.refresh(item1)
    db.refresh(item2)
    
    match = Match(
        lost_item_id=item1.id, 
        found_item_id=item2.id, 
        image_similarity=0.95,
        text_similarity=0.95,
        confidence_score=95.0, 
        status="PENDING"
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    match_id = match.id
    user_a_id = user_a.id
    user_b_id = user_b.id
    db.close()

    results = []

    def accept():
        res = client.post(f"/api/matches/{match_id}/accept", headers=headers_a)
        results.append(res.status_code)

    def reject():
        res = client.post(f"/api/matches/{match_id}/reject", headers=headers_b)
        results.append(res.status_code)

    # Run simultaneously
    t1 = threading.Thread(target=accept)
    t2 = threading.Thread(target=reject)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # One should succeed (200) and the other should fail with conflict (409)
    assert 200 in results
    assert 409 in results

    # Verify final state in DB
    db = SessionLocal()
    final_match = db.query(Match).filter(Match.id == match_id).first()
    assert final_match.status in ["ACCEPTED", "REJECTED"]
    assert final_match.resolved_by_user_id in [user_a_id, user_b_id]
    db.close()
