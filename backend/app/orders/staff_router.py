from typing import Annotated

from fastapi import APIRouter, Header, Query, Request, Response

from app.deps import DB, BoardAuth, BranchDep, StaffUser, client_ip
from app.orders import schemas, service

router = APIRouter(prefix="/staff/orders", tags=["staff-orders"])


@router.get("", response_model=list[schemas.OrderSummary])
def board(_: BoardAuth, branch: BranchDep, db: DB):
    """Active orders (placed, preparing, ready). Polled by the board; readable on a locked shop tablet."""
    return [service.summary(o) for o in service.board(db, branch)]


@router.post("", response_model=schemas.CounterOrderOut, status_code=201)
def create(body: schemas.CounterOrderIn, user: StaffUser, branch: BranchDep, db: DB, response: Response,
           idempotency_key: Annotated[str | None, Header()] = None):
    key = service.check_idempotency_key(idempotency_key)
    order, change, created = service.create_counter_order(db, branch, user, body, key)
    if not created:
        response.status_code = 200
    return schemas.CounterOrderOut(**service.summary(order), change_sen=change)


@router.get("/search", response_model=list[schemas.OrderSummary])
def search(user: StaffUser, branch: BranchDep, db: DB, q: Annotated[str, Query(min_length=1, max_length=50)]):
    return [service.summary(o) for o in service.search(db, q, user, branch)]


@router.get("/{order_id}", response_model=schemas.OrderDetail)
def get(order_id: int, user: StaffUser, branch: BranchDep, db: DB):
    return service.detail(db, service.get_order(db, order_id, user, branch))


@router.post("/{order_id}/transition", response_model=schemas.OrderSummary)
def transition(order_id: int, body: schemas.TransitionIn, user: StaffUser, db: DB, request: Request):
    return service.summary(service.move(db, order_id, user, body, client_ip(request)))


@router.post("/{order_id}/cancel", response_model=schemas.OrderSummary)
def cancel(order_id: int, body: schemas.CancelIn, user: StaffUser, db: DB, request: Request):
    return service.summary(service.cancel(db, order_id, user, body, client_ip(request)))
