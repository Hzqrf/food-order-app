from fastapi import APIRouter, Request

from app.deps import DB, AdminUser, client_ip
from app.orders import schemas, service

router = APIRouter(prefix="/admin/orders", tags=["admin-orders"])


@router.post("/{order_id}/cancel", response_model=schemas.OrderSummary)
def cancel(order_id: int, body: schemas.CancelIn, admin: AdminUser, db: DB, request: Request):
    return service.summary(service.cancel(db, order_id, admin, body, client_ip(request)))


@router.post("/{order_id}/refund", response_model=schemas.OrderSummary)
def refund(order_id: int, body: schemas.RefundIn, admin: AdminUser, db: DB, request: Request):
    return service.summary(service.refund(db, order_id, admin, body, client_ip(request)))
