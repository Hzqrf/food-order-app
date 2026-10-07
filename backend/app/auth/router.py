from datetime import timedelta

from fastapi import APIRouter, Request, Response

from app.auth import schemas, service
from app.config import get_settings
from app.deps import (DB, DEVICE_COOKIE, SESSION_COOKIE, AdminUser, Auth, AuthDep, BranchDep,
                      DeviceBranch, StaffUser, client_ip, load_session)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(response: Response, name: str, token: str, max_age: timedelta) -> None:
    response.set_cookie(name, token, max_age=int(max_age.total_seconds()), httponly=True,
                        secure=get_settings().cookie_secure, samesite="lax", path="/")


def _session_out(auth: Auth, branch_name: str | None, via_pin: bool | None = None) -> schemas.SessionOut:
    u = auth.user
    return schemas.SessionOut(
        user=schemas.SessionUser(id=u.id, username=u.username, full_name=u.full_name, role=u.role,
                                 totp_enabled=u.totp_enabled) if u else None,
        via_pin=via_pin if via_pin is not None else bool(auth.session and auth.session.via_pin),
        device_registered=auth.device_branch_id is not None,
        branch_name=branch_name,
    )


@router.get("/session", response_model=schemas.SessionOut)
def get_session(auth: AuthDep, branch: BranchDep):
    return _session_out(auth, branch.name)


@router.post("/login", response_model=schemas.SessionOut)
def login(body: schemas.LoginIn, request: Request, response: Response, db: DB, auth: AuthDep,
          branch: BranchDep):
    user, token, lifetime = service.login(db, body.login, body.password, body.totp_code,
                                          client_ip(request), request.headers.get("user-agent"))
    service.revoke(auth.session)
    _set_cookie(response, SESSION_COOKIE, token, lifetime)
    return _session_out(Auth(user, None, auth.device_branch_id), branch.name, via_pin=False)


@router.post("/logout", status_code=204)
def logout(auth: AuthDep, response: Response):
    service.revoke(auth.session)
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/device/staff", response_model=list[schemas.DeviceStaff])
def device_staff(_: DeviceBranch, db: DB):
    return [schemas.DeviceStaff(id=u.id, full_name=u.full_name) for u in service.pin_users(db)]


@router.post("/pin", response_model=schemas.SessionOut)
def pin(body: schemas.PinIn, request: Request, response: Response, db: DB, auth: AuthDep,
        _: DeviceBranch, branch: BranchDep):
    user, token = service.pin_unlock(db, body.user_id, body.pin, client_ip(request),
                                     request.headers.get("user-agent"))
    service.revoke(auth.session)
    _set_cookie(response, SESSION_COOKIE, token, service.PIN_MAX)
    return _session_out(Auth(user, None, auth.device_branch_id), branch.name, via_pin=True)


@router.post("/device/register", status_code=204)
def register_device(admin: AdminUser, branch: BranchDep, request: Request, response: Response, db: DB):
    token = service.register_device(db, admin, branch.id, client_ip(request),
                                    request.headers.get("user-agent"))
    _set_cookie(response, DEVICE_COOKIE, token, service.DEVICE_MAX)


@router.post("/device/unregister", status_code=204)
def unregister_device(_: AdminUser, response: Response, db: DB, request: Request):
    service.revoke(load_session(db, request, DEVICE_COOKIE, "device"))
    response.delete_cookie(DEVICE_COOKIE, path="/")


@router.post("/totp/setup", response_model=schemas.TotpSetupOut)
def totp_setup(admin: AdminUser):
    secret, uri = service.totp_setup(admin)
    return schemas.TotpSetupOut(secret=secret, otpauth_uri=uri)


@router.post("/totp/enable", status_code=204)
def totp_enable(body: schemas.TotpCodeIn, admin: AdminUser, db: DB, request: Request):
    service.totp_enable(db, admin, body.code, client_ip(request))


@router.post("/password", status_code=204)
def change_password(body: schemas.ChangePasswordIn, user: StaffUser, db: DB, request: Request):
    service.change_password(db, user, body.current_password, body.new_password, client_ip(request))
