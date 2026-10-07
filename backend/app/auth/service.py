from datetime import timedelta

import pyotp
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.audit import audit
from app.errors import AppError
from app.models import AuthSession, User, utcnow
from app.security import check_password_strength, hash_secret, limiter, new_token, verify_secret

MAX_FAILED = 5
LOCKOUT = timedelta(minutes=15)

ADMIN_IDLE = timedelta(hours=12)
ADMIN_MAX = timedelta(days=7)
STAFF_MAX = timedelta(days=30)
PIN_IDLE = timedelta(minutes=5)
PIN_MAX = timedelta(hours=12)
DEVICE_MAX = timedelta(days=365)

_DUMMY_HASH = hash_secret("timing-equaliser")


def _create_session(db: Session, subject_type: str, subject_id: int, lifetime: timedelta,
                    idle: timedelta | None, user_agent: str | None, via_pin: bool = False) -> str:
    token, hashed = new_token()
    db.add(AuthSession(subject_type=subject_type, subject_id=subject_id, token_hash=hashed,
                       expires_at=utcnow() + lifetime, via_pin=via_pin,
                       idle_seconds=int(idle.total_seconds()) if idle else None,
                       user_agent=(user_agent or "")[:255]))
    return token


def _check_lock(user: User) -> None:
    if user.locked_until and user.locked_until > utcnow():
        retry = int((user.locked_until - utcnow()).total_seconds()) + 1
        raise AppError("account_locked", "Too many wrong attempts. Try again in 15 minutes.", 429,
                       headers={"Retry-After": str(retry)})


def _record_failure(db: Session, user: User) -> None:
    user.failed_attempts += 1
    if user.failed_attempts >= MAX_FAILED:
        user.failed_attempts = 0
        user.locked_until = utcnow() + LOCKOUT
    # The request is about to fail and roll back, so persist the counter now.
    db.commit()


def login(db: Session, login: str, password: str, totp_code: str | None, ip: str,
          user_agent: str | None) -> tuple[User, str, timedelta]:
    limiter.hit("login", ip, limit=20, window_seconds=900)
    key = login.strip().lower()
    user = db.scalar(select(User).where((User.username == key) | (User.email == key)))
    if user is None or not user.is_active:
        verify_secret(_DUMMY_HASH, password)  # same cost as a real check
        raise AppError("invalid_credentials", "Wrong username or password.", 401)
    _check_lock(user)
    if not verify_secret(user.password_hash, password):
        if user.role == "admin":
            audit(db, user.id, "admin_login_failed", "user", user.id, ip=ip)
        _record_failure(db, user)
        raise AppError("invalid_credentials", "Wrong username or password.", 401)
    if user.totp_enabled:
        if not totp_code:
            raise AppError("totp_required", "Enter the code from your authenticator app.", 401)
        if not pyotp.TOTP(user.totp_secret).verify(totp_code, valid_window=1):
            _record_failure(db, user)
            raise AppError("invalid_totp", "That code is not right.", 401)
    user.failed_attempts = 0
    user.locked_until = None
    if user.role == "admin":
        token = _create_session(db, "user", user.id, ADMIN_MAX, ADMIN_IDLE, user_agent)
        audit(db, user.id, "admin_login", "user", user.id, ip=ip)
        return user, token, ADMIN_MAX
    return user, _create_session(db, "user", user.id, STAFF_MAX, None, user_agent), STAFF_MAX


def pin_unlock(db: Session, user_id: int, pin: str, ip: str, user_agent: str | None) -> tuple[User, str]:
    limiter.hit("pin", ip, limit=30, window_seconds=900)
    user = db.get(User, user_id)
    if user is None or not user.is_active or not user.pin_hash:
        raise AppError("invalid_credentials", "Wrong PIN.", 401)
    _check_lock(user)
    if not verify_secret(user.pin_hash, pin):
        _record_failure(db, user)
        raise AppError("invalid_credentials", "Wrong PIN.", 401)
    user.failed_attempts = 0
    return user, _create_session(db, "user", user.id, PIN_MAX, PIN_IDLE, user_agent, via_pin=True)


def register_device(db: Session, admin: User, branch_id: int, ip: str, user_agent: str | None) -> str:
    token = _create_session(db, "device", branch_id, DEVICE_MAX, None, user_agent)
    audit(db, admin.id, "device_registered", "branch", branch_id, after={"user_agent": user_agent}, ip=ip)
    return token


def revoke(session: AuthSession | None) -> None:
    if session is not None and session.revoked_at is None:
        session.revoked_at = utcnow()


def revoke_all(db: Session, subject_type: str, subject_id: int) -> None:
    db.execute(update(AuthSession)
               .where(AuthSession.subject_type == subject_type, AuthSession.subject_id == subject_id,
                      AuthSession.revoked_at.is_(None))
               .values(revoked_at=utcnow()))


def pin_users(db: Session) -> list[User]:
    return list(db.scalars(select(User)
                           .where(User.is_active.is_(True), User.pin_hash.is_not(None))
                           .order_by(User.full_name)))


def totp_setup(user: User) -> tuple[str, str]:
    if user.totp_enabled:
        raise AppError("totp_already_enabled", "Two-step sign-in is already on.", 409)
    user.totp_secret = pyotp.random_base32()
    uri = pyotp.TOTP(user.totp_secret).provisioning_uri(name=user.email or user.username,
                                                        issuer_name="Kaunter")
    return user.totp_secret, uri


def totp_enable(db: Session, user: User, code: str, ip: str) -> None:
    if not user.totp_secret or not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
        raise AppError("invalid_totp", "That code is not right.", 422)
    user.totp_enabled = True
    audit(db, user.id, "totp_enabled", "user", user.id, ip=ip)


def change_password(db: Session, user: User, current: str, new: str, ip: str) -> None:
    if not verify_secret(user.password_hash, current):
        raise AppError("invalid_credentials", "Current password is wrong.", 422)
    check_password_strength(new)
    user.password_hash = hash_secret(new)
    audit(db, user.id, "password_changed", "user", user.id, ip=ip)
