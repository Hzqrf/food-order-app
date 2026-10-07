from typing import Annotated

from fastapi import APIRouter, Header, Request, Response

from app.deps import DB, BranchDep, client_ip
from app.orders import schemas, service
from app.payments.service import expiry_of

router = APIRouter(tags=["orders"])


@router.post("/orders/quote", response_model=schemas.QuoteOut)
def quote(body: schemas.QuoteIn, db: DB):
    return service.quote(db, body)


@router.post("/orders", response_model=schemas.OnlineOrderOut, status_code=201)
def place_order(body: schemas.OnlineOrderIn, request: Request, response: Response, branch: BranchDep, db: DB,
                idempotency_key: Annotated[str | None, Header()] = None):
    key = service.check_idempotency_key(idempotency_key)
    order, url, created = service.create_online_order(db, branch, body, key, client_ip(request))
    if not created:
        response.status_code = 200
    return schemas.OnlineOrderOut(order_number=service.fmt_number(order.order_number), token=order.public_token,
                                  status=order.status, total_sen=order.total_sen, payment_url=url,
                                  expires_at=expiry_of(order))


@router.get("/t/{token}", response_model=schemas.TrackingOut)
def track(token: str, request: Request, branch: BranchDep, db: DB):
    return service.tracking(service.by_token(db, token, client_ip(request)), branch)


@router.post("/t/{token}/pay", response_model=schemas.PaymentLinkOut)
def pay(token: str, request: Request, db: DB):
    order = service.by_token(db, token, client_ip(request))
    return schemas.PaymentLinkOut(payment_url=service.pay_again(db, order))


@router.post("/t/{token}/cancel", response_model=schemas.TrackingOut)
def cancel(token: str, request: Request, branch: BranchDep, db: DB):
    order = service.customer_cancel(db, service.by_token(db, token, client_ip(request)))
    return service.tracking(order, branch)
