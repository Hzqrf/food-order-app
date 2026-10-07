from fastapi import APIRouter, Request

from app.deps import DB, AdminUser, BranchDep, client_ip
from app.staff import schemas, service

router = APIRouter(prefix="/admin/staff", tags=["admin-staff"])


@router.get("", response_model=list[schemas.StaffOut])
def list_staff(_: AdminUser, db: DB):
    return [service.out(u) for u in service.list_staff(db)]


@router.post("", response_model=schemas.StaffOut, status_code=201)
def create(body: schemas.StaffIn, admin: AdminUser, db: DB, request: Request):
    return service.out(service.create(db, admin, body, client_ip(request)))


@router.patch("/{user_id}", response_model=schemas.StaffOut)
def update(user_id: int, body: schemas.StaffPatch, admin: AdminUser, db: DB, request: Request):
    return service.out(service.update(db, admin, user_id, body, client_ip(request)))


@router.post("/{user_id}/deactivate", response_model=schemas.StaffOut)
def deactivate(user_id: int, admin: AdminUser, branch: BranchDep, db: DB, request: Request):
    return service.out(service.set_active(db, admin, user_id, False, branch, client_ip(request)))


@router.post("/{user_id}/reactivate", response_model=schemas.StaffOut)
def reactivate(user_id: int, admin: AdminUser, branch: BranchDep, db: DB, request: Request):
    return service.out(service.set_active(db, admin, user_id, True, branch, client_ip(request)))


@router.post("/{user_id}/reset-password", status_code=204)
def reset_password(user_id: int, body: schemas.PasswordResetIn, admin: AdminUser, db: DB, request: Request):
    service.reset_password(db, admin, user_id, body.password, client_ip(request))


@router.post("/{user_id}/pin", status_code=204)
def set_pin(user_id: int, body: schemas.PinIn, admin: AdminUser, db: DB, request: Request):
    service.set_pin(db, admin, user_id, body.pin, client_ip(request))
