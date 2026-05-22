from fastapi import APIRouter, Depends, Request, Response
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service as auth_service
from app.auth.schemas import ChangePasswordRequest, LoginRequest, MeResponse, TokenResponse
from app.config import settings
from app.core.dependencies import get_current_admin, get_db
from app.core.redis import get_redis

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_cookies(response: Response, access_token: str, refresh_token_raw: str) -> None:
    kwargs: dict = {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
        "path": "/",
    }
    if settings.COOKIE_DOMAIN:
        kwargs["domain"] = settings.COOKIE_DOMAIN

    response.set_cookie("access_token", access_token, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **kwargs)
    response.set_cookie(
        "refresh_token", refresh_token_raw, max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600, **kwargs
    )


def _clear_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    ip = request.client.host if request.client else "unknown"
    request_id = getattr(request.state, "request_id", None)

    access_token, refresh_raw, must_change_password = await auth_service.login(
        db, redis, ip=ip, request_id=request_id, username=body.username, password=body.password
    )
    _set_cookies(response, access_token, refresh_raw)
    return TokenResponse(must_change_password=must_change_password)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    admin=Depends(get_current_admin),
):
    ip = request.client.host if request.client else "unknown"
    request_id = getattr(request.state, "request_id", None)
    refresh_raw = request.cookies.get("refresh_token")

    await auth_service.logout(
        db, redis, admin, refresh_token_raw=refresh_raw, ip=ip, request_id=request_id
    )
    _clear_cookies(response)
    return {"ok": True}


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    ip = request.client.host if request.client else "unknown"
    request_id = getattr(request.state, "request_id", None)
    refresh_raw = request.cookies.get("refresh_token")

    new_access = await auth_service.refresh_access(
        db, redis, refresh_token_raw=refresh_raw, ip=ip, request_id=request_id
    )
    kwargs: dict = {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
        "path": "/",
        "max_age": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }
    if settings.COOKIE_DOMAIN:
        kwargs["domain"] = settings.COOKIE_DOMAIN
    response.set_cookie("access_token", new_access, **kwargs)
    return TokenResponse(must_change_password=False)


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    admin=Depends(get_current_admin),
):
    refresh_raw = request.cookies.get("refresh_token")

    new_access = await auth_service.change_password(
        db,
        redis,
        admin,
        old_password=body.old_password,
        new_password=body.new_password,
        current_refresh_raw=refresh_raw,
    )
    kwargs: dict = {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
        "path": "/",
        "max_age": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }
    if settings.COOKIE_DOMAIN:
        kwargs["domain"] = settings.COOKIE_DOMAIN
    response.set_cookie("access_token", new_access, **kwargs)
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
async def me(admin=Depends(get_current_admin)):
    return MeResponse(
        id=admin.id,
        username=admin.username,
        fio=admin.fio,
        role=admin.role.name if admin.role else "",
        permissions=admin.role.permissions if admin.role else [],
    )
