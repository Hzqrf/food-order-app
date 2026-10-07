"""The payment gateway boundary. Swapping gateways means adding one class here.

The rest of the app only knows three calls: create a bill, verify a webhook, ask for a status.
Card data never reaches this system; customers pay on the gateway's hosted page.
"""
import hashlib
import hmac
import json
import secrets
import threading
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal, Protocol

from app.config import get_settings

GatewayStatus = Literal["pending", "paid", "failed", "expired"]


@dataclass(frozen=True)
class Bill:
    provider_ref: str
    payment_url: str


@dataclass(frozen=True)
class GatewayResult:
    provider_ref: str
    status: GatewayStatus
    amount_sen: int
    raw: dict


class GatewayError(Exception):
    """The gateway could not be reached or refused the request."""


class Gateway(Protocol):
    provider: str

    def create_bill(self, *, reference: str, amount_sen: int, description: str, customer_name: str,
                    customer_phone: str, return_url: str, callback_url: str) -> Bill: ...

    def verify_webhook(self, headers: dict[str, str], body: bytes) -> GatewayResult | None:
        """The parsed result, or None when the signature is wrong."""

    def get_status(self, provider_ref: str) -> GatewayResult: ...


class FakeGateway:
    """A stand-in gateway for development and tests, with a hosted page at /api/v1/fake-gateway.

    It signs webhooks with HMAC-SHA256 exactly as a real provider would, so the webhook handler,
    the reconcile job and the expiry job are exercised for real. Bills live in memory.
    """

    provider = "fake"
    SIGNATURE_HEADER = "x-fake-signature"

    def __init__(self, secret: str):
        self._secret = secret.encode()
        self._bills: dict[str, dict] = {}
        self._lock = threading.Lock()

    def create_bill(self, *, reference: str, amount_sen: int, description: str, customer_name: str,
                    customer_phone: str, return_url: str, callback_url: str) -> Bill:
        ref = "fk_" + secrets.token_hex(10)
        with self._lock:
            self._bills[ref] = {"reference": reference, "amount_sen": amount_sen, "description": description,
                                "status": "pending", "return_url": return_url, "callback_url": callback_url}
        base = get_settings().public_base_url
        return Bill(provider_ref=ref, payment_url=f"{base}/api/v1/fake-gateway/{ref}")

    def bill(self, provider_ref: str) -> dict | None:
        with self._lock:
            bill = self._bills.get(provider_ref)
            return dict(bill) if bill else None

    def settle(self, provider_ref: str, status: GatewayStatus) -> tuple[bytes, dict[str, str]]:
        """Mark a bill paid or failed; returns the signed webhook the gateway would send."""
        with self._lock:
            bill = self._bills[provider_ref]
            bill["status"] = status
            payload = {"ref": provider_ref, "status": status, "amount_sen": bill["amount_sen"]}
        body = json.dumps(payload).encode()
        return body, {self.SIGNATURE_HEADER: self.sign(body)}

    def sign(self, body: bytes) -> str:
        return hmac.new(self._secret, body, hashlib.sha256).hexdigest()

    def verify_webhook(self, headers: dict[str, str], body: bytes) -> GatewayResult | None:
        signature = headers.get(self.SIGNATURE_HEADER, "")
        if not hmac.compare_digest(signature, self.sign(body)):
            return None
        try:
            data = json.loads(body)
            return GatewayResult(provider_ref=str(data["ref"]), status=data["status"],
                                 amount_sen=int(data["amount_sen"]), raw=data)
        except (ValueError, KeyError, TypeError):
            return None

    def get_status(self, provider_ref: str) -> GatewayResult:
        bill = self.bill(provider_ref)
        if bill is None:
            raise GatewayError(f"unknown bill {provider_ref}")
        return GatewayResult(provider_ref=provider_ref, status=bill["status"], amount_sen=bill["amount_sen"],
                             raw={"ref": provider_ref, "status": bill["status"], "source": "status_query"})


@lru_cache
def get_gateway() -> Gateway:
    settings = get_settings()
    if settings.payment_gateway == "fake":
        if settings.is_production:
            raise RuntimeError("The fake payment gateway cannot run in production.")
        return FakeGateway(settings.gateway_webhook_secret)
    raise RuntimeError(f"Unknown payment gateway: {settings.payment_gateway}")
