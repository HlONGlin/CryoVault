from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    413: "payload_too_large",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    502: "upstream_error",
}


def _message(detail, status_code: int) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, dict):
        value = detail.get("message") or detail.get("detail")
        if isinstance(value, str):
            return value
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return "Request failed"


def install_exception_handlers(app: FastAPI) -> None:
    """Keep API failures consistent without changing route implementations."""

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_request: Request, exc: StarletteHTTPException):
        code = _CODES.get(exc.status_code, "http_error")
        if isinstance(exc.detail, dict) and isinstance(exc.detail.get("code"), str):
            code = exc.detail["code"]
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": code,
                    "message": _message(exc.detail, exc.status_code),
                    "status": exc.status_code,
                }
            },
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        location = ".".join(
            str(part) for part in first.get("loc", ()) if part != "body"
        )
        detail = first.get("msg", "Invalid request")
        message = f"{location}: {detail}" if location else detail
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": message,
                    "status": 422,
                }
            },
        )
