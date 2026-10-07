import json
import logging
import sys
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.auth.router import router as auth_router
from app.config import get_settings
from app.errors import install_error_handlers
from app.menu.admin_router import router as menu_admin_router
from app.menu.router import router as menu_router
from app.orders.admin_router import router as orders_admin_router
from app.orders.router import router as orders_router
from app.orders.staff_router import router as orders_staff_router
from app.payments.webhook_router import router as webhook_router
from app.shop.router import router as shop_router
from app.staff.admin_router import router as staff_admin_router

API_PREFIX = "/api/v1"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class JsonFormatter(logging.Formatter):
    _skip = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime"}

    def format(self, record: logging.LogRecord) -> str:
        data = {"level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        data.update({k: v for k, v in record.__dict__.items() if k not in self._skip})
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data, default=str)


def _configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger("app")
    root.handlers = [handler]
    root.setLevel(logging.INFO)
    root.propagate = False


def create_app() -> FastAPI:
    settings = get_settings()
    _configure_logging()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        scheduler = None
        if settings.run_scheduler:
            from app.jobs import start_scheduler
            scheduler = start_scheduler()
        yield
        if scheduler:
            scheduler.shutdown(wait=False)

    app = FastAPI(title="Kaunter API", version="0.1.0", lifespan=lifespan,
                  docs_url=None if settings.is_production else "/api/docs",
                  openapi_url=None if settings.is_production else "/api/openapi.json")
    install_error_handlers(app)

    access_log = logging.getLogger("app.access")

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        # CSRF: state-changing requests from a browser must come from our own origin.
        origin = request.headers.get("origin")
        if (request.method in UNSAFE_METHODS and origin and origin not in settings.allowed_origins
                and not request.url.path.startswith(f"{API_PREFIX}/webhooks/")):
            return JSONResponse({"error": {"code": "forbidden", "message": "Cross-origin request refused."}}, 403)
        start = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        # same-origin, not no-referrer: tracking links never leak to other sites, and browsers still
        # send a real Origin header on our own POSTs (no-referrer makes it "null", failing the CSRF check).
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        if request.url.path.startswith(API_PREFIX):
            response.headers.setdefault("Cache-Control", "no-store")
        if request.headers.get("x-poll") != "1":
            access_log.info("request", extra={
                "request_id": request_id, "method": request.method, "path": request.url.path,
                "status": response.status_code, "ms": round((time.perf_counter() - start) * 1000, 1)})
        return response

    for router in (auth_router, shop_router, menu_router, menu_admin_router, orders_router,
                   orders_staff_router, orders_admin_router, staff_admin_router, webhook_router):
        app.include_router(router, prefix=API_PREFIX)
    if settings.payment_gateway == "fake" and not settings.is_production:
        from app.payments.fake_router import router as fake_gateway_router
        app.include_router(fake_gateway_router, prefix=API_PREFIX)

    @app.get(f"{API_PREFIX}/health", tags=["health"])
    def health():
        return {"ok": True}

    settings.media_dir.mkdir(parents=True, exist_ok=True)
    app.mount(settings.media_url, StaticFiles(directory=settings.media_dir), name="media")
    return app


app = create_app()
