from fastapi import APIRouter, Request

from app.deps import DB, AdminUser, BranchDep, StaffUser, client_ip
from app.shop import schemas, service

router = APIRouter(tags=["shop"])


@router.get("/shop", response_model=schemas.ShopOut)
def get_shop(branch: BranchDep):
    return service.shop_out(branch)


@router.patch("/staff/shop/online-orders", response_model=schemas.ShopOut)
def online_orders(body: schemas.OnlineOrdersIn, user: StaffUser, branch: BranchDep, db: DB, request: Request):
    service.set_online_orders(db, branch, user, body.accepting, client_ip(request))
    return service.shop_out(branch)


@router.get("/admin/settings", response_model=schemas.ShopOut)
def get_settings(_: AdminUser, branch: BranchDep):
    return service.shop_out(branch)


@router.patch("/admin/settings", response_model=schemas.ShopOut)
def update_settings(body: schemas.SettingsPatch, admin: AdminUser, branch: BranchDep, db: DB, request: Request):
    service.update_settings(db, branch, admin, body, client_ip(request))
    return service.shop_out(branch)
