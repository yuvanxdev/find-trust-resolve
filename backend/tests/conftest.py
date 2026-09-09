import pytest
from app.limiter import limiter

@pytest.fixture(autouse=True, scope="session")
def disable_rate_limiting():
    # Disable rate limiting globally for tests so they don't hit 429s in fast loops
    limiter.enabled = False
