import jwt
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

_MODIFYING_METHODS = frozenset({"POST", "PATCH", "PUT", "DELETE"})
_SKIP_CONTENT_TYPE_PATHS = ("/internal/",)
_PASSWORD_CHANGE_ALLOWED = frozenset({"/api/auth/change-password", "/api/auth/logout"})


def _get_header(headers: list, name: bytes) -> bytes:
    for k, v in headers:
        if k.lower() == name:
            return v
    return b""


def _parse_cookies(cookie_header: str) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for part in cookie_header.split(";"):
        part = part.strip()
        if "=" in part:
            k, _, v = part.partition("=")
            cookies[k.strip()] = v.strip()
    return cookies


class ContentTypeMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            method: str = scope.get("method", "")
            path: str = scope.get("path", "")
            if method in _MODIFYING_METHODS and not any(path.startswith(p) for p in _SKIP_CONTENT_TYPE_PATHS):
                headers: list = scope.get("headers", [])
                content_length = _get_header(headers, b"content-length").decode()
                has_body = content_length not in ("", "0")
                if has_body:
                    ct = _get_header(headers, b"content-type").decode()
                    if not (ct.startswith("application/json") or ct.startswith("multipart/form-data")):
                        response = JSONResponse(
                            {"code": "INVALID_CONTENT_TYPE", "message": "Ожидается application/json или multipart/form-data"},
                            status_code=415,
                        )
                        await response(scope, receive, send)
                        return
        await self.app(scope, receive, send)


class PasswordChangeRequiredMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path: str = scope.get("path", "")
            if path not in _PASSWORD_CHANGE_ALLOWED:
                headers: list = scope.get("headers", [])
                cookie_header = _get_header(headers, b"cookie").decode()
                token = _parse_cookies(cookie_header).get("access_token")
                if token:
                    try:
                        from app.config import settings

                        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
                        if not payload.get("password_changed", True):
                            response = JSONResponse(
                                {"code": "PASSWORD_CHANGE_REQUIRED", "message": "Необходимо сменить пароль при первом входе"},
                                status_code=403,
                            )
                            await response(scope, receive, send)
                            return
                    except jwt.PyJWTError:
                        pass
        await self.app(scope, receive, send)
