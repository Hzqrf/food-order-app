from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import audit, changes
from app.auth.service import revoke_all
from app.errors import AppError, not_found
from app.models import User
from app.security import check_password_strength, check_pin, hash_secret
from app.shop.service import local_now
from app.staff import schemas


def out(u: User) -> schemas.StaffOut:
    return schemas.StaffOut(id=u.id, role=u.role, username=u.username, email=u.email, full_name=u.full_name,
                            phone=u.phone, position=u.position, joined_on=u.joined_on, left_on=u.left_on,
                            is_active=u.is_active, has_pin=u.pin_hash is not None, totp_enabled=u.totp_enabled)


def list_staff(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.is_active.desc(), User.full_name)))


def _get(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise not_found("Staff member not found.")
    return user


def _check_unique(db: Session, username: str | None, email: str | None, exclude_id: int | None = None) -> None:
    if username and db.scalar(select(User.id).where(User.username == username, User.id != (exclude_id or 0))):
        raise AppError("username_taken", "That username is already used.", 409)
    if email and db.scalar(select(User.id).where(User.email == email, User.id != (exclude_id or 0))):
        raise AppError("email_taken", "That email is already used.", 409)


def create(db: Session, admin: User, body: schemas.StaffIn, ip: str) -> User:
    check_password_strength(body.password)
    email = body.email.lower() if body.email else None
    _check_unique(db, body.username, email)
    if body.role == "admin" and not email:
        raise AppError("email_required", "Owner accounts sign in with an email address.", 422)
    user = User(role=body.role, username=body.username, email=email, full_name=body.full_name,
                phone=body.phone, position=body.position, joined_on=body.joined_on,
                password_hash=hash_secret(body.password), pin_hash=hash_secret(body.pin) if body.pin else None)
    db.add(user)
    db.flush()
    audit(db, admin.id, "staff_created", "user", user.id, None,
          {"username": user.username, "role": user.role}, ip)
    return user


def update(db: Session, admin: User, user_id: int, body: schemas.StaffPatch, ip: str) -> User:
    user = _get(db, user_id)
    values = body.model_dump(exclude_unset=True)
    if "email" in values and values["email"]:
        values["email"] = values["email"].lower()
        _check_unique(db, None, values["email"], user.id)
    if user.id == admin.id and values.get("role") == "staff":
        raise AppError("forbidden", "You cannot remove your own owner access.", 403)
    before, after = changes(user, ["role"], values)
    for k, v in values.items():
        setattr(user, k, v)
    if after:
        audit(db, admin.id, "staff_role_changed", "user", user.id, before, after, ip)
        revoke_all(db, "user", user.id)
    return user


def set_active(db: Session, admin: User, user_id: int, active: bool, branch, ip: str) -> User:
    user = _get(db, user_id)
    if user.id == admin.id and not active:
        raise AppError("forbidden", "You cannot deactivate yourself.", 403)
    if user.is_active == active:
        return user
    user.is_active = active
    if active:
        user.left_on = None
        audit(db, admin.id, "staff_reactivated", "user", user.id, ip=ip)
    else:
        user.left_on = local_now(branch).date()
        revoke_all(db, "user", user.id)  # ends every session immediately
        audit(db, admin.id, "staff_deactivated", "user", user.id, ip=ip)
    return user


def reset_password(db: Session, admin: User, user_id: int, password: str, ip: str) -> None:
    user = _get(db, user_id)
    check_password_strength(password)
    user.password_hash = hash_secret(password)
    user.failed_attempts, user.locked_until = 0, None
    revoke_all(db, "user", user.id)
    audit(db, admin.id, "password_reset", "user", user.id, ip=ip)


def set_pin(db: Session, admin: User, user_id: int, pin: str, ip: str) -> None:
    user = _get(db, user_id)
    check_pin(pin)
    user.pin_hash = hash_secret(pin)
    user.failed_attempts, user.locked_until = 0, None
    audit(db, admin.id, "pin_reset", "user", user.id, ip=ip)
