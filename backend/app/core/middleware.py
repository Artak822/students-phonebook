from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.errors import InvalidContentType

_MODIFYING_METHODS = frozenset({"POST", "PATCH", "PUT", "DELETE"})
_SKIP_CONTENT_TYPE_PATHS = ("/internal/",)


class ContentTypeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method in _MODIFYING_METHODS:
            if not any(request.url.path.startswith(p) for p in _SKIP_CONTENT_TYPE_PATHS):
                ct = request.headers.get("content-type", "")
                if not (ct.startswith("application/json") or ct.startswith("multipart/form-data")):
                    raise InvalidContentType()
        return await call_next(request)
