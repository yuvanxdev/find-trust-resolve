import pytest
import uuid
import os
from io import BytesIO
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db, engine, Base
from app.models import User, Item

client = TestClient(app)

@pytest.fixture(scope="session", autouse=True)
def setup_and_teardown():
    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    yield
    # Cleanup test data natively
    db = next(get_db())
    try:
        test_users = db.query(User).filter(User.email.like("testuser_items_%")).all()
        for user in test_users:
            db.delete(user)
        db.commit()
    except:
        db.rollback()

from unittest.mock import patch

@pytest.fixture(autouse=True)
def mock_background_ai():
    with patch("app.items.process_new_item_embeddings"):
        yield

def generate_unique_email():
    return f"testuser_items_{uuid.uuid4().hex[:8]}@example.com"

@pytest.fixture
def auth_headers():
    email = generate_unique_email()
    # Register
    client.post(
        "/api/auth/register",
        json={"name": "Item Test User", "email": email, "password": "password123"}
    )
    # Login
    response = client.post(
        "/api/auth/login",
        data={"username": email, "password": "password123"}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def other_auth_headers():
    email = generate_unique_email()
    client.post("/api/auth/register", json={"name": "Other User", "email": email, "password": "password123"})
    response = client.post("/api/auth/login", data={"username": email, "password": "password123"})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_unauthenticated_creation_rejected():
    response = client.post(
        "/api/items/",
        data={
            "report_type": "LOST",
            "item_name": "Test Item",
            "description": "Test Desc",
            "location": "Park"
        }
    )
    assert response.status_code == 401

def test_create_lost_item_authenticated(auth_headers):
    response = client.post(
        "/api/items/",
        headers=auth_headers,
        data={
            "report_type": "LOST",
            "item_name": "Keys",
            "description": "Lost my keys",
            "location": "Central Park"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["item_name"] == "Keys"
    assert data["report_type"] == "LOST"

def test_create_found_item_authenticated(auth_headers):
    response = client.post(
        "/api/items/",
        headers=auth_headers,
        data={
            "report_type": "FOUND",
            "item_name": "Wallet",
            "description": "Found a black wallet",
            "location": "Subway"
        }
    )
    assert response.status_code == 201
    assert response.json()["report_type"] == "FOUND"

def test_invalid_report_type_rejected(auth_headers):
    response = client.post(
        "/api/items/",
        headers=auth_headers,
        data={
            "report_type": "STOLEN", # Invalid
            "item_name": "Phone",
            "description": "Gone",
            "location": "Here"
        }
    )
    assert response.status_code == 422 # FastAPI validation error

def test_valid_image_upload(auth_headers):
    # Dummy PNG
    image_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    
    response = client.post(
        "/api/items/",
        headers=auth_headers,
        data={
            "report_type": "LOST",
            "item_name": "Image Item",
            "description": "Has image",
            "location": "Test"
        },
        files={"image": ("test.png", BytesIO(image_data), "image/png")}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["image_path"] is not None
    assert data["image_path"].endswith(".png")

def test_invalid_mime_type_rejected(auth_headers):
    image_data = b"print('hello')"
    response = client.post(
        "/api/items/",
        headers=auth_headers,
        data={
            "report_type": "LOST",
            "item_name": "Bad Image Item",
            "description": "Has bad image",
            "location": "Test"
        },
        files={"image": ("test.py", BytesIO(image_data), "text/x-python")}
    )
    assert response.status_code == 400
    assert "Invalid image format" in response.json()["detail"]

def test_oversized_image_rejected(auth_headers):
    # Simulate a file larger than 5MB
    large_data = b"0" * (5 * 1024 * 1024 + 100)
    response = client.post(
        "/api/items/",
        headers=auth_headers,
        data={
            "report_type": "LOST",
            "item_name": "Big Image Item",
            "description": "Has big image",
            "location": "Test"
        },
        files={"image": ("big.png", BytesIO(large_data), "image/png")}
    )
    assert response.status_code == 400
    assert "exceeds" in response.json()["detail"].lower()

def test_get_own_items(auth_headers):
    # Create item
    client.post(
        "/api/items/",
        headers=auth_headers,
        data={"report_type": "LOST", "item_name": "My Item", "description": "Mine", "location": "Home"}
    )
    response = client.get("/api/items/", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1
    assert response.json()[0]["item_name"] == "My Item"

def test_get_other_user_item_unauthorized(auth_headers, other_auth_headers):
    create_resp = client.post(
        "/api/items/",
        headers=auth_headers,
        data={"report_type": "LOST", "item_name": "Private Item", "description": "Private", "location": "Home"}
    )
    item_id = create_resp.json()["id"]
    
    # Try fetching with other user
    response = client.get(f"/api/items/{item_id}", headers=other_auth_headers)
    assert response.status_code == 403

def test_update_own_item(auth_headers):
    create_resp = client.post(
        "/api/items/",
        headers=auth_headers,
        data={"report_type": "LOST", "item_name": "Update Me", "description": "Old", "location": "Home"}
    )
    item_id = create_resp.json()["id"]
    
    update_resp = client.put(
        f"/api/items/{item_id}",
        headers=auth_headers,
        data={"description": "New"}
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["description"] == "New"

def test_update_other_user_item_unauthorized(auth_headers, other_auth_headers):
    create_resp = client.post(
        "/api/items/",
        headers=auth_headers,
        data={"report_type": "LOST", "item_name": "Cant Update Me", "description": "Old", "location": "Home"}
    )
    item_id = create_resp.json()["id"]
    
    update_resp = client.put(
        f"/api/items/{item_id}",
        headers=other_auth_headers,
        data={"description": "Hacked"}
    )
    assert update_resp.status_code == 403

def test_delete_own_item(auth_headers):
    create_resp = client.post(
        "/api/items/",
        headers=auth_headers,
        data={"report_type": "LOST", "item_name": "Delete Me", "description": "Delete", "location": "Home"}
    )
    item_id = create_resp.json()["id"]
    
    del_resp = client.delete(f"/api/items/{item_id}", headers=auth_headers)
    assert del_resp.status_code == 200
    
    # Confirm it's gone
    get_resp = client.get(f"/api/items/{item_id}", headers=auth_headers)
    assert get_resp.status_code == 404

def test_delete_other_user_item_unauthorized(auth_headers, other_auth_headers):
    create_resp = client.post(
        "/api/items/",
        headers=auth_headers,
        data={"report_type": "LOST", "item_name": "Cant Delete Me", "description": "Delete", "location": "Home"}
    )
    item_id = create_resp.json()["id"]
    
    del_resp = client.delete(f"/api/items/{item_id}", headers=other_auth_headers)
    assert del_resp.status_code == 403

def test_discover_items_filters_own_items_and_works(auth_headers, other_auth_headers):
    # User A creates a LOST item
    client.post(
        "/api/items/",
        headers=auth_headers,
        data={
            "report_type": "LOST",
            "item_name": "Discover Lost Item",
            "description": "Lost item for discover test",
            "location": "Park"
        }
    )
    
    # User B creates a FOUND item
    client.post(
        "/api/items/",
        headers=other_auth_headers,
        data={
            "report_type": "FOUND",
            "item_name": "Discover Found Item",
            "description": "Found item for discover test",
            "location": "Park"
        }
    )
    
    # Unauthenticated should fail
    resp = client.get("/api/items/discover")
    assert resp.status_code == 401
    
    # User A discovers
    resp_a = client.get("/api/items/discover", headers=auth_headers)
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    # Should see User B's Found Item, not own Lost Item
    assert any(i["item_name"] == "Discover Found Item" for i in data_a)
    assert all(i["item_name"] != "Discover Lost Item" for i in data_a)
    
    # User B discovers
    resp_b = client.get("/api/items/discover", headers=other_auth_headers)
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    # Should see User A's Lost Item, not own Found Item
    assert any(i["item_name"] == "Discover Lost Item" for i in data_b)
    assert all(i["item_name"] != "Discover Found Item" for i in data_b)
    
    # Test filtering by type for User B
    resp_b_lost = client.get("/api/items/discover?report_type=LOST", headers=other_auth_headers)
    assert any(i["item_name"] == "Discover Lost Item" for i in resp_b_lost.json())
    
    resp_b_found = client.get("/api/items/discover?report_type=FOUND", headers=other_auth_headers)
    assert all(i["item_name"] != "Discover Lost Item" for i in resp_b_found.json())
