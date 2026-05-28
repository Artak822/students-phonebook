import pytest
from httpx import AsyncClient
from redis.asyncio import Redis

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _login(client: AsyncClient):
    r = await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})
    assert r.status_code == 200


async def _create_group(client: AsyncClient, name: str) -> dict:
    resp = await client.post("/api/groups", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------- CRUD ----------

async def test_create_group(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    data = await _create_group(client, "ИТ-21")
    assert data["name"] == "ИТ-21"
    assert "id" in data


async def test_list_groups(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    await _create_group(client, "ИТ-22")
    resp = await client.get("/api/groups")
    assert resp.status_code == 200
    names = [g["name"] for g in resp.json()]
    assert "ИТ-22" in names


async def test_list_groups_search(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    await _create_group(client, "ЭЭ-10")
    await _create_group(client, "ФИЗ-10")
    resp = await client.get("/api/groups?search=ЭЭ")
    assert resp.status_code == 200
    names = [g["name"] for g in resp.json()]
    assert "ЭЭ-10" in names
    assert "ФИЗ-10" not in names


async def test_update_group(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    g = await _create_group(client, "СТАРОЕ")
    resp = await client.patch(f"/api/groups/{g['id']}", json={"name": "НОВОЕ"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "НОВОЕ"


async def test_delete_empty_group(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    g = await _create_group(client, "УДАЛИТЬ")
    resp = await client.delete(f"/api/groups/{g['id']}")
    assert resp.status_code == 204


async def test_delete_group_not_found(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    resp = await client.delete("/api/groups/99999")
    assert resp.status_code == 404
    assert resp.json()["code"] == "GROUP_NOT_FOUND"


async def test_delete_group_with_students(client: AsyncClient, super_admin, redis_client: Redis):
    from datetime import date
    await _login(client)
    g = await _create_group(client, "НЕ_УДАЛЯТЬ")
    # Create a room first
    room_resp = await client.post("/api/rooms", json={"building": 1, "entrance": 1, "room_number": 999, "capacity": 2})
    # Create student in group
    emp_resp = await client.post("/api/employees", json={
        "fio": "Студент Тест",
        "phone": "+79991112233",
        "group_id": g["id"],
        "birth_date": "2003-05-15",
        "notes": "",
    })
    assert emp_resp.status_code == 201, emp_resp.text
    resp = await client.delete(f"/api/groups/{g['id']}")
    assert resp.status_code == 400
    assert resp.json()["code"] == "GROUP_HAS_STUDENTS"
