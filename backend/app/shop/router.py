from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.deps import DB, AdminUser, BranchDep, StaffUser, client_ip
from app.orders import slots
from app.orders.slots import Slot
from app.shop import schemas, service

router = APIRouter(tags=["shop"])


@router.get("/shop", response_model=schemas.ShopOut)
def get_shop(branch: BranchDep, db: DB):
    return service.shop_out(db, branch)


class PickupSlotsOut(BaseModel):
    slots: list[Slot]


@router.get("/shop/pickup-slots", response_model=PickupSlotsOut)
def pickup_slots(branch: BranchDep, db: DB):
    """Today's pickup times for pre-orders. Not cached: a slot can fill up at any moment."""
    return PickupSlotsOut(slots=slots.pickup_slots(db, branch))


@router.patch("/staff/shop/online-orders", response_model=schemas.ShopOut)
def online_orders(body: schemas.OnlineOrdersIn, user: StaffUser, branch: BranchDep, db: DB, request: Request):
    service.set_online_orders(db, branch, user, body.accepting, client_ip(request))
    return service.shop_out(db, branch)


@router.get("/admin/settings", response_model=schemas.ShopOut)
def get_settings(_: AdminUser, branch: BranchDep, db: DB):
    return service.shop_out(db, branch)


@router.patch("/admin/settings", response_model=schemas.ShopOut)
def update_settings(body: schemas.SettingsPatch, admin: AdminUser, branch: BranchDep, db: DB, request: Request):
    service.update_settings(db, branch, admin, body, client_ip(request))
    return service.shop_out(db, branch)
