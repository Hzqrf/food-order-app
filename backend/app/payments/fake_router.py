"""The fake gateway's hosted payment page. Mounted only when PAYMENT_GATEWAY=fake, never in production."""
import html

from fastapi import APIRouter, Form
from fastapi.responses import HTMLResponse, RedirectResponse

from app.db import SessionLocal
from app.errors import not_found
from app.payments import service
from app.payments.gateway import FakeGateway, get_gateway

router = APIRouter(prefix="/fake-gateway", tags=["fake-gateway"], include_in_schema=False)

_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>FakePay</title>
<link rel="icon" href="data:,">
<style>
body{{font-family:system-ui,sans-serif;background:#eef2f7;margin:0;padding:24px;color:#1f2937}}
main{{max-width:380px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 12px #0001}}
h1{{font-size:18px;margin:0 0 4px}} .amt{{font-size:32px;font-weight:800;margin:16px 0}}
.dev{{background:#fef3c7;color:#92400e;font-size:12px;padding:8px 10px;border-radius:8px}}
button{{display:block;width:100%;padding:14px;margin-top:10px;border-radius:10px;border:0;font-size:16px;cursor:pointer}}
.pay{{background:#2563eb;color:#fff}} .alt{{background:#e5e7eb}} .fail{{background:#fee2e2;color:#991b1b}}
</style></head><body><main>
<h1>FakePay</h1><div>{description}</div><div class="amt">RM{amount}</div>
<p class="dev">Development gateway. No money moves. Use the buttons to act out what a real gateway does.</p>
{body}
</main></body></html>"""


def _gateway() -> FakeGateway:
    gw = get_gateway()
    if not isinstance(gw, FakeGateway):
        raise not_found()
    return gw


@router.get("/{ref}", response_class=HTMLResponse)
def page(ref: str):
    bill = _gateway().bill(ref) or {}
    if not bill:
        raise not_found("Unknown bill.")
    if bill["status"] != "pending":
        body = f'<p>This bill is already <b>{bill["status"]}</b>.</p><a href="{html.escape(bill["return_url"])}">Back to the shop</a>'
    else:
        body = f"""<form method="post" action="/api/v1/fake-gateway/{html.escape(ref)}">
<button class="pay" name="action" value="pay">Pay (DuitNow QR)</button>
<button class="alt" name="action" value="pay_lost_webhook">Pay, but lose the webhook</button>
<button class="fail" name="action" value="fail">Payment fails</button>
<button class="alt" name="action" value="back">Go back without paying</button></form>"""
    return _PAGE.format(description=html.escape(bill["description"]),
                        amount=f'{bill["amount_sen"] / 100:.2f}', body=body)


@router.post("/{ref}")
def act(ref: str, action: str = Form(...)):
    gw = _gateway()
    bill = gw.bill(ref)
    if not bill:
        raise not_found("Unknown bill.")
    if bill["status"] == "pending" and action in ("pay", "pay_lost_webhook", "fail"):
        body, headers = gw.settle(ref, "failed" if action == "fail" else "paid")
        if action != "pay_lost_webhook":
            # Deliver the signed webhook the way a gateway would, through the real handler.
            with SessionLocal() as db, db.begin():
                service.handle_webhook(db, gw.provider, headers, body)
    return RedirectResponse(bill["return_url"], status_code=303)
