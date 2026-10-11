from typing import Annotated

from fastapi import APIRouter, Query, Request

from app.deps import DB, AdminUser, BranchDep, client_ip
from app.orders import schemas, service

router = APIRouter(prefix="/admin/orders", tags=["admin-orders"])


@router.get("", response_model=schemas.OrderPage)
def list_orders(_: AdminUser, branch: BranchDep, db: DB, f: Annotated[schemas.OrderFilter, Query()]):
    orders, cursor = service.admin_list(db, branch, f)
    return schemas.OrderPage(orders=[service.summary(o) for o in orders], next_cursor=cursor)


@router.post("/{order_id}/cancel", response_model=schemas.OrderSummary)
def cancel(order_id: int, body: schemas.CancelIn, admin: AdminUser, db: DB, request: Request):
    return service.summary(service.cancel(db, order_id, admin, body, client_ip(request)))


@router.post("/{order_id}/refund", response_model=schemas.OrderSummary)
def refund(order_id: int, body: schemas.RefundIn, admin: AdminUser, db: DB, request: Request):
    return service.summary(service.refund(db, order_id, admin, body, client_ip(request)))
