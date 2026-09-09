import pytest
import uuid
from fastapi.testclient import TestClient

from app.main import app
from app.database import engine, Base

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield

def generate_unique_email():
    return f"testuser_{uuid.uuid4().hex[:8]}@example.com"

def test_register_user():
    email = generate_unique_email()
    response = client.post(
        "/api/auth/register",
        json={"name": "Test User", "email": email, "password": "testpassword123"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == email
    assert "id" in data
    assert "password" not in data

def test_register_duplicate_email():
    email = generate_unique_email()
    client.post(
        "/api/auth/register",
        json={"name": "User 1", "email": email, "password": "password"}
    )
    response = client.post(
        "/api/auth/register",
        json={"name": "User 2", "email": email, "password": "password"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"

def test_login_success():
    email = generate_unique_email()
    client.post(
        "/api/auth/register",
        json={"name": "Login User", "email": email, "password": "correctpassword"}
    )
    response = client.post(
        "/api/auth/login",
        data={"username": email, "password": "correctpassword"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_incorrect_password():
    email = generate_unique_email()
    client.post(
        "/api/auth/register",
        json={"name": "Login User", "email": email, "password": "correctpassword"}
    )
    response = client.post(
        "/api/auth/login",
        data={"username": email, "password": "wrongpassword"}
    )
    assert response.status_code == 401

def test_access_protected_route():
    email = generate_unique_email()
    # Register and login
    client.post(
        "/api/auth/register",
        json={"name": "Protected User", "email": email, "password": "password"}
    )
    login_response = client.post(
        "/api/auth/login",
        data={"username": email, "password": "password"}
    )
    token = login_response.json()["access_token"]
    
    # Access protected route
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == email

def test_access_protected_route_unauthorized():
    response = client.get("/api/auth/me")
    assert response.status_code == 401
