import time
import uuid
from contextvars import ContextVar
from typing import Callable

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

_actor_id: ContextVar[int | None] = ContextVar("actor_id", default=None)
_actor_username: ContextVar[str | None] = ContextVar("actor_username", default=None)
_ip: ContextVar[str | None] = ContextVar("ip", default=None)
_request_id: ContextVar[str] = ContextVar("request_id", default="")

_REDACTED_FIELDS = frozenset({"password", "token", "refresh", "secret"})


def _add_context_processor(logger, method, event_dict: dict) -> dict:
    if request_id := _request_id.get(""):
        event_dict["request_id"] = request_id
    if actor_id := _actor_id.get():
        event_dict["actor_id"] = actor_id
    if actor_username := _actor_username.get():
        event_dict["actor_username"] = actor_username
    if ip := _ip.get():
        event_dict["ip"] = ip
    return event_dict


def configure_logging() -> None:
    import logging

    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            _add_context_processor,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def set_actor(actor_id: int | None, actor_username: str | None) -> None:
    _actor_id.set(actor_id)
    _actor_username.set(actor_username)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = str(uuid.uuid4())
        _request_id.set(request_id)
        _ip.set(request.client.host if request.client else None)
        _actor_id.set(None)
        _actor_username.set(None)
        request.state.request_id = request_id

        start = time.monotonic()
        response = await call_next(request)
        duration_ms = round((time.monotonic() - start) * 1000)

        logger = structlog.get_logger()
        logger.info(
            "request.completed",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=duration_ms,
        )
        return response
