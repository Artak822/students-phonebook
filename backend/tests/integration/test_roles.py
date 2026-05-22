import pytest
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.roles.models import Role

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _login_super(client: AsyncClient):
    r = await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})
    assert r.status_code == 200


# ---------- list ----------

async def test_list_roles(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.get("/api/roles")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


# ---------- create ----------

async def test_create_role(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.post(
        "/api/roles",
        json={"name": "custom_one", "label": "Кастом", "description": "Тест", "permissions": ["employees:view"]},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "custom_one"
    assert data["is_system"] is False
    assert "employees:view" in data["permissions"]


# ---------- get ----------

async def test_get_role(client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis):
    result = await db_session.execute(select(Role).where(Role.name == "super_admin"))
    role = result.scalar_one()

    await _login_super(client)
    resp = await client.get(f"/api/roles/{role.id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "super_admin"


async def test_get_role_not_found(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.get("/api/roles/99999")
    assert resp.status_code == 404
    assert resp.json()["code"] == "ROLE_NOT_FOUND"


# ---------- update ----------

async def test_update_custom_role_label(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    role = Role(name="upd_label_role", label="Старый", description="", permissions=[])
    db_session.add(role)
    await db_session.flush()

    await _login_super(client)
    resp = await client.patch(f"/api/roles/{role.id}", json={"label": "Новый"})
    assert resp.status_code == 200
    assert resp.json()["label"] == "Новый"


async def test_patch_system_role_forbidden(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    result = await db_session.execute(select(Role).where(Role.name == "super_admin"))
    role = result.scalar_one()

    await _login_super(client)
    resp = await client.patch(f"/api/roles/{role.id}", json={"label": "Взломали"})
    assert resp.status_code == 400
    assert resp.json()["code"] == "IS_SYSTEM_ROLE"


async def test_permissions_changed_audit_log(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    from app.audit.models import AuditLog

    role = Role(name="audit_perm_role", label="Аудит", description="", permissions=["employees:view"])
    db_session.add(role)
    await db_session.flush()

    await _login_super(client)
    resp = await client.patch(
        f"/api/roles/{role.id}",
        json={"permissions": ["employees:view", "rooms:view"]},
    )
    assert resp.status_code == 200

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.event == "role.permissions_changed", AuditLog.target_id == role.id
        )
    )
    log = result.scalar_one_or_none()
    assert log is not None
    assert "rooms:view" in log.details["added"]
    assert log.details["removed"] == []


async def test_permissions_removed_in_audit(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    from app.audit.models import AuditLog

    role = Role(
        name="rm_perm_role", label="Удаление", description="",
        permissions=["employees:view", "rooms:view"]
    )
    db_session.add(role)
    await db_session.flush()

    await _login_super(client)
    await client.patch(f"/api/roles/{role.id}", json={"permissions": ["employees:view"]})

    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.event == "role.permissions_changed", AuditLog.target_id == role.id
        )
    )
    log = result.scalar_one_or_none()
    assert log is not None
    assert "rooms:view" in log.details["removed"]


# ---------- delete ----------

async def test_delete_custom_role(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    role = Role(name="del_me_role", label="Удалить", description="", permissions=[])
    db_session.add(role)
    await db_session.flush()

    await _login_super(client)
    resp = await client.delete(f"/api/roles/{role.id}")
    assert resp.status_code == 204


async def test_delete_system_role_forbidden(
    client: AsyncClient, db_session: AsyncSession, super_admin, redis_client: Redis
):
    result = await db_session.execute(select(Role).where(Role.name == "super_admin"))
    role = result.scalar_one()

    await _login_super(client)
    resp = await client.delete(f"/api/roles/{role.id}")
    assert resp.status_code == 400
    assert resp.json()["code"] == "IS_SYSTEM_ROLE"


# ---------- permissions ----------

async def test_permission_denied_without_roles_manage(
    client: AsyncClient, tutor_admin, redis_client: Redis
):
    r = await client.post("/api/auth/login", json={"username": "test_tutor", "password": "password123"})
    assert r.status_code == 200

    resp = await client.get("/api/roles")
    assert resp.status_code == 403
    assert resp.json()["code"] == "PERMISSION_DENIED"
