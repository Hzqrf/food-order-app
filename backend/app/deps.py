from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import AppError
from app.models import AuthSession, Branch, User, utcnow
from app.security import token_hash

SESSION_COOKIE = "kt_session"
DEVICE_COOKIE = "kt_device"
# Activity refreshes last_seen_at at most this often, and polling requests (X-Poll: 1) never do,
# so an unattended board does not keep a PIN unlock alive.
_SEEN_RESOLUTION = timedelta(seconds=15)

DB = Annotated[Session, Depends(get_db, scope="function")]


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd and get_settings().behind_proxy:
        return fwd.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def load_session(db: Session, request: Request, cookie: str, subject_type: str) -> AuthSession | None:
    token = request.cookies.get(cookie)
    if not token:
        return None
    s = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash(token)))
    now = utcnow()
    if s is None or s.subject_type != subject_type or s.revoked_at is not None or s.expires_at <= now:
        return None
    if s.idle_seconds is not None and now - s.last_seen_at > timedelta(seconds=s.idle_seconds):
        return None
    if request.headers.get("x-poll") != "1" and now - s.last_seen_at > _SEEN_RESOLUTION:
        s.last_seen_at = now
    return s


@dataclass
class Auth:
    user: User | None
    session: AuthSession | None
    device_branch_id: int | None


def get_auth(request: Request, db: DB) -> Auth:
    user = None
    session = load_session(db, request, SESSION_COOKIE, "user")
    if session is not None:
        user = db.get(User, session.subject_id)
        if user is None or not user.is_active:
            user, session = None, None
    device = load_session(db, request, DEVICE_COOKIE, "device")
    return Auth(user=user, session=session, device_branch_id=device.subject_id if device else None)


AuthDep = Annotated[Auth, Depends(get_auth, scope="function")]


def require_staff(auth: AuthDep) -> User:
    """Staff and admins."""
    if auth.user is None:
        raise AppError("not_authenticated", "Please sign in.", 401)
    return auth.user


def require_admin(auth: AuthDep) -> User:
    user = require_staff(auth)
    if user.role != "admin":
        raise AppError("forbidden", "Only the owner can do this.", 403)
    return user


def require_board(auth: AuthDep) -> Auth:
    """Read access to the order board: a signed-in user, or a registered (locked) shop tablet."""
    if auth.user is None and auth.device_branch_id is None:
        raise AppError("not_authenticated", "Please sign in.", 401)
    return auth


def require_device(auth: AuthDep) -> int:
    if auth.device_branch_id is None:
        raise AppError("device_not_registered", "This device is not registered as a shop tablet.", 401)
    return auth.device_branch_id


StaffUser = Annotated[User, Depends(require_staff, scope="function")]
AdminUser = Annotated[User, Depends(require_admin, scope="function")]
BoardAuth = Annotated[Auth, Depends(require_board, scope="function")]
DeviceBranch = Annotated[int, Depends(require_device, scope="function")]


def get_branch(db: DB) -> Branch:
    """Release 1 has exactly one branch."""
    branch = db.scalar(select(Branch).order_by(Branch.id).limit(1))
    if branch is None:
        raise AppError("not_configured", "The shop has not been set up yet.", 503)
    return branch


BranchDep = Annotated[Branch, Depends(get_branch, scope="function")]


def actor_type(user: User) -> str:
    return "admin" if user.role == "admin" else "staff"
