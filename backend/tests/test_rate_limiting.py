import pytest
import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.database import engine, Base
from app.limiter import limiter

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db_and_limiter():
    Base.metadata.create_all(bind=engine)
    # Enable limiter for this test file
    limiter.enabled = True
    yield
    # Cleanup limiter state
    limiter.enabled = False
    limiter.reset()

def generate_unique_email():
    return f"ratelimit_{uuid.uuid4().hex[:8]}@example.com"

def test_auth_rate_limiting():
    # Trigger 11 requests to register (limit is 10/minute)
    for i in range(10):
        email = generate_unique_email()
        res = client.post(
            "/api/auth/register",
            json={"name": "Test User", "email": email, "password": "testpassword123"}
        )
        assert res.status_code in [201, 400] # 201 for success, 400 for duplicate if any
        
    email = generate_unique_email()
    res = client.post(
        "/api/auth/register",
        json={"name": "Test User", "email": email, "password": "testpassword123"}
    )
    assert res.status_code == 429
    assert "Rate limit exceeded" in res.text
