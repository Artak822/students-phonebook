import pytest
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.rooms.models import Room

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _login_super(client: AsyncClient):
    r = await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})
    assert r.status_code == 200


async def _login_tutor(client: AsyncClient):
    r = await client.post("/api/auth/login", json={"username": "test_tutor", "password": "password123"})
    assert r.status_code == 200


async def _create_room(client: AsyncClient, building=1, entrance=1, room_number=101, capacity=2) -> dict:
    resp = await client.post(
        "/api/rooms",
        json={"building": building, "entrance": entrance, "room_number": room_number, "capacity": capacity},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------- list ----------

async def test_list_rooms_empty(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.get("/api/rooms")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_list_rooms_filter(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    await _create_room(client, building=2, entrance=1, room_number=201)
    await _create_room(client, building=3, entrance=1, room_number=301)

    resp = await client.get("/api/rooms?building=2")
    assert resp.status_code == 200
    data = resp.json()
    assert all(r["building"] == 2 for r in data)


# ---------- create ----------

async def test_create_room(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.post(
        "/api/rooms",
        json={"building": 1, "entrance": 2, "room_number": 102, "capacity": 3},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["building"] == 1
    assert data["capacity"] == 3
    assert "id" in data


async def test_create_room_duplicate(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    await _create_room(client, building=5, entrance=1, room_number=500)
    resp = await client.post(
        "/api/rooms",
        json={"building": 5, "entrance": 1, "room_number": 500, "capacity": 2},
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "ROOM_DUPLICATE"


async def test_create_room_invalid_capacity(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.post(
        "/api/rooms",
        json={"building": 1, "entrance": 1, "room_number": 999, "capacity": 0},
    )
    assert resp.status_code == 422


# ---------- get ----------

async def test_get_room(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    created = await _create_room(client, building=1, entrance=3, room_number=103)
    resp = await client.get(f"/api/rooms/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


async def test_get_room_not_found(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.get("/api/rooms/99999")
    assert resp.status_code == 404
    assert resp.json()["code"] == "ROOM_NOT_FOUND"


# ---------- update ----------

async def test_update_room(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    created = await _create_room(client, building=1, entrance=4, room_number=104)
    resp = await client.patch(f"/api/rooms/{created['id']}", json={"capacity": 5})
    assert resp.status_code == 200
    assert resp.json()["capacity"] == 5


# ---------- delete ----------

async def test_delete_room(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    created = await _create_room(client, building=1, entrance=5, room_number=105)
    resp = await client.delete(f"/api/rooms/{created['id']}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/rooms/{created['id']}")
    assert resp.status_code == 404


async def test_delete_room_not_found(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    resp = await client.delete("/api/rooms/99998")
    assert resp.status_code == 404


# ---------- bulk create ----------

async def test_bulk_create(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    items = [{"room_number": n, "capacity": 2} for n in range(600, 610)]
    resp = await client.post(
        "/api/rooms/bulk",
        json={"building": 10, "entrance": 1, "items": items},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["created"] == 10
    assert data["skipped"] == 0


async def test_bulk_create_skips_duplicates(client: AsyncClient, super_admin, redis_client: Redis):
    await _login_super(client)
    # Создаём одну комнату заранее
    await _create_room(client, building=11, entrance=1, room_number=700)

    items = [{"room_number": n, "capacity": 2} for n in range(700, 705)]
    resp = await client.post(
        "/api/rooms/bulk",
        json={"building": 11, "entrance": 1, "items": items},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["created"] == 4
    assert data["skipped"] == 1
    assert 700 in data["skipped_numbers"]


# ---------- permissions ----------

async def test_rooms_manage_requires_permission(client: AsyncClient, tutor_admin, redis_client: Redis):
    await _login_tutor(client)
    resp = await client.post(
        "/api/rooms",
        json={"building": 9, "entrance": 9, "room_number": 999, "capacity": 2},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "PERMISSION_DENIED"


async def test_rooms_view_allowed_for_tutor(client: AsyncClient, tutor_admin, redis_client: Redis):
    await _login_tutor(client)
    resp = await client.get("/api/rooms")
    assert resp.status_code == 200
