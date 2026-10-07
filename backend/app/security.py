import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.errors import AppError

_hasher = PasswordHasher()  # Argon2id

# A short list of the passwords people actually pick. Length >= 10 already rules out most others.
COMMON_PASSWORDS = {
    "1234567890", "0123456789", "password123", "password1234", "qwertyuiop", "1q2w3e4r5t",
    "abcdefghij", "iloveyou12", "passw0rd123", "admin12345", "welcome123", "1111111111",
    "0000000000", "qwerty1234", "asdfghjkl1", "abc1234567",
}


def hash_secret(value: str) -> str:
    return _hasher.hash(value)


def verify_secret(hashed: str | None, value: str) -> bool:
    if not hashed:
        return False
    try:
        return _hasher.verify(hashed, value)
    except (VerificationError, InvalidHashError):
        return False


def check_password_strength(password: str) -> None:
    if len(password) < 10:
        raise AppError("weak_password", "Password must be at least 10 characters.", 422)
    if password.lower() in COMMON_PASSWORDS:
        raise AppError("weak_password", "That password is too common.", 422)


def check_pin(pin: str) -> None:
    if not (pin.isdigit() and 4 <= len(pin) <= 6):
        raise AppError("invalid_pin", "PIN must be 4 to 6 digits.", 422)


def new_token() -> tuple[str, str]:
    """Returns (token for the cookie, sha256 hash for the database)."""
    token = secrets.token_urlsafe(32)
    return token, token_hash(token)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class RateLimiter:
    """In-process sliding-window limiter. One app process, so memory is enough."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, bucket: str, key: str, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[(bucket, key)]
            while hits and hits[0] <= now - window_seconds:
                hits.popleft()
            if len(hits) >= limit:
                retry = int(hits[0] + window_seconds - now) + 1
                raise AppError("too_many_requests", "Too many attempts. Please wait and try again.",
                               429, headers={"Retry-After": str(retry)})
            hits.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()
