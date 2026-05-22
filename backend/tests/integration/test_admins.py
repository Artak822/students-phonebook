import pytest
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admins.models import Admin
from app.core.security import hash_password
from app.roles.models import Role

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ---------- helpers ----------

async def _get_role(db: AsyncSession, name: str) -> Role:
    result = await db.execute(select(Role).where(Role.name == name))
    return result.scalar_one()


async def _login_super(client: AsyncClient):
    r = await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})
    assert r.status_code == 200


# ---------- list ----------

async def test_list_admins(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.get("/api/admins")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert data["total"] >= 1
    assert data["page"] == 1


async def test_list_admins_search(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.get("/api/admins", params={"search": "test_superadmin"})
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


# ---------- create ----------

async def test_create_admin_returns_generated_password(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    role = await _get_role(db_session, "super_admin")
    await _login_super(client)
    resp = await client.post(
        "/api/admins",
        json={"username": "new_admin_1", "fio": "Новый Пользователь", "role_id": role.id, "is_active": True},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "new_admin_1"
    assert "generated_password" in data
    assert len(data["generated_password"]) == 16
    assert data["password_changed"] is False


async def test_create_admin_duplicate_username(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    role = await _get_role(db_session, "super_admin")
    await _login_super(client)
    payload = {"username": "dup_user", "fio": "Дубль", "role_id": role.id, "is_active": True}
    r1 = await client.post("/api/admins", json=payload)
    assert r1.status_code == 201
    r2 = await client.post("/api/admins", json=payload)
    assert r2.status_code == 409
    assert r2.json()["code"] == "USERNAME_ALREADY_EXISTS"


# ---------- get ----------

async def test_get_admin(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.get(f"/api/admins/{super_admin.id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == super_admin.id


async def test_get_admin_not_found(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.get("/api/admins/99999")
    assert resp.status_code == 404
    assert resp.json()["code"] == "ADMIN_NOT_FOUND"


# ---------- update ----------

async def test_update_admin_fio(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.patch(f"/api/admins/{super_admin.id}", json={"fio": "Обновлённое ФИО"})
    assert resp.status_code == 200
    assert resp.json()["fio"] == "Обновлённое ФИО"


async def test_update_admin_role_changed_audit(
    client: AsyncClient, db_session: AsyncSession, super_admin, tutor_admin, redis_client: Redis
):
    from app.audit.models import AuditLog

    tutor = await _get_role(db_session, "tutor")
    sa_role = await _get_role(db_session, "super_admin")

    target = Admin(
        username="role_change_target",
        password_hash=hash_password("pw"),
        fio="Смена Роли",
        role_id=sa_role.id,
        is_active=True,
        password_changed=True,
    )
    db_session.add(target)
    await db_session.flush()

    await _login_super(client)
    resp = await client.patch(f"/api/admins/{target.id}", json={"role_id": tutor.id})
    assert resp.status_code == 200
    assert resp.json()["role"]["name"] == "tutor"

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.event == "admin.role_changed", AuditLog.target_id == target.id
        )
    )
    log = result.scalar_one_or_none()
    assert log is not None
    assert log.details["from_role_id"] == sa_role.id
    assert log.details["to_role_id"] == tutor.id


# ---------- delete ----------

async def test_delete_self_forbidden(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.delete(f"/api/admins/{super_admin.id}")
    assert resp.status_code == 400
    assert resp.json()["code"] == "SELF_DELETE_FORBIDDEN"


async def test_delete_last_super_admin_forbidden(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    mgr_role = Role(name="mgr_test", label="Менеджер", description="", permissions=["admins:manage"])
    db_session.add(mgr_role)
    await db_session.flush()

    mgr = Admin(
        username="mgr_test_user",
        password_hash=hash_password("password123"),
        fio="Менеджер",
        role_id=mgr_role.id,
        is_active=True,
        password_changed=True,
    )
    db_session.add(mgr)
    await db_session.flush()

    r = await client.post("/api/auth/login", json={"username": "mgr_test_user", "password": "password123"})
    assert r.status_code == 200

    resp = await client.delete(f"/api/admins/{super_admin.id}")
    assert resp.status_code == 400
    assert resp.json()["code"] == "LAST_SUPER_ADMIN"


async def test_delete_admin_success(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    sa_role = await _get_role(db_session, "super_admin")
    second = Admin(
        username="second_to_delete",
        password_hash=hash_password("pw"),
        fio="Второй",
        role_id=sa_role.id,
        is_active=True,
        password_changed=True,
    )
    db_session.add(second)
    await db_session.flush()

    await _login_super(client)
    resp = await client.delete(f"/api/admins/{second.id}")
    assert resp.status_code == 204


# ---------- reset-password ----------

async def test_reset_password_returns_new_password(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    sa_role = await _get_role(db_session, "super_admin")
    target = Admin(
        username="reset_pw_target",
        password_hash=hash_password("old_password"),
        fio="Сброс Пароля",
        role_id=sa_role.id,
        is_active=True,
        password_changed=True,
    )
    db_session.add(target)
    await db_session.flush()

    await _login_super(client)
    resp = await client.post(f"/api/admins/{target.id}/reset-password")
    assert resp.status_code == 200
    data = resp.json()
    assert "generated_password" in data
    assert len(data["generated_password"]) == 16


async def test_reset_password_invalidates_old_session(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    sa_role = await _get_role(db_session, "super_admin")
    target = Admin(
        username="reset_session_target",
        password_hash=hash_password("old_password123"),
        fio="Сессия",
        role_id=sa_role.id,
        is_active=True,
        password_changed=True,
    )
    db_session.add(target)
    await db_session.flush()

    # Login as target to create a session
    r = await client.post(
        "/api/auth/login", json={"username": "reset_session_target", "password": "old_password123"}
    )
    assert r.status_code == 200

    # Login as super_admin to do the reset
    await _login_super(client)
    await client.post(f"/api/admins/{target.id}/reset-password")

    # Old password should no longer work
    r2 = await client.post(
        "/api/auth/login", json={"username": "reset_session_target", "password": "old_password123"}
    )
    assert r2.status_code == 401


# ---------- permissions ----------

async def test_permission_denied_without_admins_manage(
    client: AsyncClient, tutor_admin, redis_client: Redis
):
    r = await client.post("/api/auth/login", json={"username": "test_tutor", "password": "password123"})
    assert r.status_code == 200

    resp = await client.get("/api/admins")
    assert resp.status_code == 403
    assert resp.json()["code"] == "PERMISSION_DENIED"
