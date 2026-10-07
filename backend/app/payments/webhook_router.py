from fastapi import APIRouter, Request

from app.deps import DB
from app.payments import service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/payments/{provider}")
async def payment_webhook(provider: str, request: Request, db: DB):
    """Verified by signature, not by session. Repeated deliveries are harmless."""
    body = await request.body()
    service.handle_webhook(db, provider, dict(request.headers), body)
    return {"ok": True}
