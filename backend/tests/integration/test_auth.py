import json

import pytest
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_login_success(client: AsyncClient, super_admin, redis_client: Redis):
    resp = await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})
    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is False
    assert "access_token" in resp.cookies
    assert "refresh_token" in resp.cookies


async def test_login_wrong_password(client: AsyncClient, super_admin, redis_client: Redis):
    resp = await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "wrong"})
    assert resp.status_code == 401
    assert resp.json()["code"] == "INVALID_CREDENTIALS"


async def test_login_wrong_password_writes_audit(
    client: AsyncClient, super_admin, redis_client: Redis, db_session: AsyncSession
):
    from sqlalchemy import select

    from app.audit.models import AuditLog

    await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "bad"})

    result = await db_session.execute(
        select(AuditLog).where(AuditLog.event == "auth.login.failed")
    )
    log = result.scalar_one_or_none()
    assert log is not None
    assert log.actor_username == "test_superadmin"


async def test_login_unknown_user(client: AsyncClient, redis_client: Redis):
    resp = await client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert resp.status_code == 401
    assert resp.json()["code"] == "INVALID_CREDENTIALS"


async def test_login_rate_limit(client: AsyncClient, redis_client: Redis):
    for _ in range(10):
        await client.post("/api/auth/login", json={"username": "nobody", "password": "x"})

    resp = await client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert resp.status_code == 429
    assert resp.json()["code"] == "RATE_LIMIT_EXCEEDED"


async def test_refresh_success(client: AsyncClient, super_admin, redis_client: Redis):
    await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})

    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 200
    assert "access_token" in resp.cookies


async def test_refresh_invalid_token(client: AsyncClient, redis_client: Redis):
    client.cookies.set("refresh_token", "totally_invalid_token")
    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 401
    assert resp.json()["code"] == "NOT_AUTHENTICATED"


async def test_refresh_missing_cookie(client: AsyncClient, redis_client: Redis):
    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 401


async def test_logout_invalidates_refresh(client: AsyncClient, super_admin, redis_client: Redis):
    await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})

    logout_resp = await client.post("/api/auth/logout")
    assert logout_resp.status_code == 200

    # cookies очищены
    assert "access_token" not in client.cookies

    # refresh больше не работает
    refresh_resp = await client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 401


async def test_must_change_password_blocks_endpoints(
    client: AsyncClient, super_admin, redis_client: Redis, db_session: AsyncSession
):
    from app.admins.models import Admin
    from app.core.security import hash_password

    new_admin = Admin(
        username="newadmin_pwd",
        password_hash=hash_password("password123"),
        fio="Новый Тест",
        role_id=super_admin.role_id,
        is_active=True,
        password_changed=False,
    )
    db_session.add(new_admin)
    await db_session.flush()

    login_resp = await client.post(
        "/api/auth/login", json={"username": "newadmin_pwd", "password": "password123"}
    )
    assert login_resp.status_code == 200
    assert login_resp.json()["must_change_password"] is True

    # /api/auth/me — заблокирован
    me_resp = await client.get("/api/auth/me")
    assert me_resp.status_code == 403
    assert me_resp.json()["code"] == "PASSWORD_CHANGE_REQUIRED"

    # /api/auth/logout — разрешён
    logout_resp = await client.post("/api/auth/logout")
    assert logout_resp.status_code == 200


async def test_must_change_password_allows_change_password(
    client: AsyncClient, super_admin, redis_client: Redis, db_session: AsyncSession
):
    from app.admins.models import Admin
    from app.core.security import hash_password

    new_admin = Admin(
        username="newadmin_pwd2",
        password_hash=hash_password("password123"),
        fio="Новый Тест 2",
        role_id=super_admin.role_id,
        is_active=True,
        password_changed=False,
    )
    db_session.add(new_admin)
    await db_session.flush()

    await client.post("/api/auth/login", json={"username": "newadmin_pwd2", "password": "password123"})

    resp = await client.post(
        "/api/auth/change-password",
        json={"old_password": "password123", "new_password": "newpassword123"},
    )
    assert resp.status_code == 200

    # Теперь /api/auth/me должен работать
    me_resp = await client.get("/api/auth/me")
    assert me_resp.status_code == 200


async def test_change_password_wrong_old_password(
    client: AsyncClient, super_admin, redis_client: Redis
):
    await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})

    resp = await client.post(
        "/api/auth/change-password",
        json={"old_password": "wrong", "new_password": "newpassword123"},
    )
    assert resp.status_code == 401


async def test_change_password_same_as_old(
    client: AsyncClient, super_admin, redis_client: Redis
):
    await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})

    resp = await client.post(
        "/api/auth/change-password",
        json={"old_password": "password123", "new_password": "password123"},
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "SAME_PASSWORD"


async def test_change_password_invalidates_other_sessions(
    client: AsyncClient, super_admin, redis_client: Redis
):
    await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})

    # Эмулируем "другую сессию" — кладём фейковый refresh в Redis
    fake_hash = "a" * 64
    fake_data = json.dumps({"admin_id": super_admin.id, "expires_at": "2099-01-01T00:00:00+00:00"})
    await redis_client.set(f"refresh:{fake_hash}", fake_data, ex=86400)
    await redis_client.sadd(f"admin_refresh:{super_admin.id}", fake_hash)

    resp = await client.post(
        "/api/auth/change-password",
        json={"old_password": "password123", "new_password": "newpassword456"},
    )
    assert resp.status_code == 200

    # Фейковый refresh инвалидирован
    assert await redis_client.get(f"refresh:{fake_hash}") is None

    # Текущий refresh по-прежнему работает
    refresh_resp = await client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 200


async def test_invalid_access_cookie_returns_401(client: AsyncClient, redis_client: Redis):
    client.cookies.set("access_token", "not.a.valid.jwt")
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401
    assert resp.json()["code"] == "NOT_AUTHENTICATED"


async def test_me_returns_correct_data(client: AsyncClient, super_admin, redis_client: Redis):
    await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})

    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "test_superadmin"
    assert data["role"] == "super_admin"
    assert "admins:manage" in data["permissions"]
