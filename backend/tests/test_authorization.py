import pytest
import uuid
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def generate_unique_email():
    return f"testuser_auth_{uuid.uuid4().hex[:8]}@example.com"

@pytest.fixture
def auth_headers_user1():
    email = generate_unique_email()
    client.post(
        "/api/auth/register",
        json={"name": "Auth Test User 1", "email": email, "password": "password123"}
    )
    response = client.post(
        "/api/auth/login",
        data={"username": email, "password": "password123"}
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}

@pytest.fixture
def auth_headers_user2():
    email = generate_unique_email()
    client.post(
        "/api/auth/register",
        json={"name": "Auth Test User 2", "email": email, "password": "password123"}
    )
    response = client.post(
        "/api/auth/login",
        data={"username": email, "password": "password123"}
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}

def test_own_item_access(auth_headers_user1, auth_headers_user2):
    # User 1 creates an item
    create_response = client.post(
        "/api/items/",
        data={
            "report_type": "LOST",
            "item_name": "Auth Test Item",
            "description": "Secret stuff",
            "location": "Secret loc"
        },
        headers=auth_headers_user1
    )
    assert create_response.status_code == 201
    item_id = create_response.json()["id"]

    # User 1 can access their own item privately
    private_access = client.get(f"/api/items/{item_id}", headers=auth_headers_user1)
    assert private_access.status_code == 200

    # User 2 cannot access User 1's private item
    private_access_fail = client.get(f"/api/items/{item_id}", headers=auth_headers_user2)
    assert private_access_fail.status_code == 403

    # User 2 CAN access the public sanitized version of the item
    public_access = client.get(f"/api/items/public/{item_id}", headers=auth_headers_user2)
    assert public_access.status_code == 200
    # ensure it doesn't contain user_id
    assert "user_id" not in public_access.json()

    # User 1 can also access the public sanitized version
    public_access_owner = client.get(f"/api/items/public/{item_id}", headers=auth_headers_user1)
    assert public_access_owner.status_code == 200

    # Discovery
    discover = client.get("/api/items/discover", headers=auth_headers_user2)
    assert discover.status_code == 200
    assert any(item["id"] == item_id for item in discover.json())
    if len(discover.json()) > 0:
        assert "user_id" not in discover.json()[0]
