import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app")


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details: Any = None,
                 headers: dict[str, str] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details
        self.headers = headers


def not_found(what: str = "Not found") -> AppError:
    return AppError("not_found", what, 404)


def _body(code: str, message: str, details: Any = None) -> dict:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"error": error}


_HTTP_CODES = {400: "bad_request", 401: "not_authenticated", 403: "forbidden", 404: "not_found",
               405: "method_not_allowed", 409: "conflict", 429: "too_many_requests"}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError):
        return JSONResponse(_body(exc.code, exc.message, exc.details), exc.status, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        fields = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
            for e in exc.errors()
        ]
        return JSONResponse(_body("validation_error", "Some fields are invalid.", fields), 422)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        code = _HTTP_CODES.get(exc.status_code, "error")
        return JSONResponse(_body(code, str(exc.detail)), exc.status_code)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception):
        log.exception("unhandled error", extra={"request_id": getattr(request.state, "request_id", None)})
        return JSONResponse(_body("internal_error", "Something went wrong. Please try again."), 500)
