from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

def get_rate_limit_key(request: Request) -> str:
    # Use Bearer token if present to prevent multiple users/sessions from being throttled together behind localhost / adb reverse proxy
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1].strip()
        if token:
            return f"auth:{token[:32]}"
    return get_remote_address(request)

limiter = Limiter(key_func=get_rate_limit_key)
