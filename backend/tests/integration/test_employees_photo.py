"""Photo upload/replace/delete with mocked S3."""
import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from PIL import Image
from redis.asyncio import Redis

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _make_jpeg(w=200, h=200) -> bytes:
    img = Image.new("RGB", (w, h), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_png() -> bytes:
    img = Image.new("RGB", (100, 100), color=(10, 20, 30))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def _login(client: AsyncClient):
    r = await client.post("/api/auth/login", json={"username": "test_superadmin", "password": "password123"})
    assert r.status_code == 200


async def _create_group(client: AsyncClient, name: str) -> int:
    resp = await client.post("/api/groups", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_employee(client: AsyncClient, gid: int, phone: str) -> dict:
    resp = await client.post("/api/employees", json={
        "fio": "Фото Студент",
        "phone": phone,
        "group_id": gid,
        "birth_date": "2002-01-01",
        "notes": "",
    })
    assert resp.status_code == 201
    return resp.json()


async def test_upload_photo(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    gid = await _create_group(client, "ФТ-ГР1")
    emp = await _create_employee(client, gid, "+79600000001")

    with patch("app.employees.router.upload_object", new_callable=AsyncMock) as mock_upload, \
         patch("app.employees.router.delete_object", new_callable=AsyncMock):
        resp = await client.post(
            f"/api/employees/{emp['id']}/photo",
            files={"file": ("photo.jpg", _make_jpeg(), "image/jpeg")},
        )
        assert resp.status_code == 204
        mock_upload.assert_called_once()


async def test_replace_photo_deletes_old(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    gid = await _create_group(client, "ФТ-ГР2")
    emp = await _create_employee(client, gid, "+79600000002")

    with patch("app.employees.router.upload_object", new_callable=AsyncMock), \
         patch("app.employees.router.delete_object", new_callable=AsyncMock) as mock_delete:
        # Upload first
        await client.post(
            f"/api/employees/{emp['id']}/photo",
            files={"file": ("photo.jpg", _make_jpeg(), "image/jpeg")},
        )
        # Upload second (replace)
        await client.post(
            f"/api/employees/{emp['id']}/photo",
            files={"file": ("photo2.jpg", _make_jpeg(), "image/jpeg")},
        )
        # delete_object should have been called for old key
        assert mock_delete.call_count >= 1


async def test_delete_photo(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    gid = await _create_group(client, "ФТ-ГР3")
    emp = await _create_employee(client, gid, "+79600000003")

    with patch("app.employees.router.upload_object", new_callable=AsyncMock), \
         patch("app.employees.router.delete_object", new_callable=AsyncMock) as mock_del:
        await client.post(
            f"/api/employees/{emp['id']}/photo",
            files={"file": ("photo.jpg", _make_jpeg(), "image/jpeg")},
        )
        resp = await client.delete(f"/api/employees/{emp['id']}/photo")
        assert resp.status_code == 204
        mock_del.assert_called()


async def test_upload_oversized_photo(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    gid = await _create_group(client, "ФТ-ГР4")
    emp = await _create_employee(client, gid, "+79600000004")

    big_data = b"x" * (6 * 1024 * 1024)
    resp = await client.post(
        f"/api/employees/{emp['id']}/photo",
        files={"file": ("big.jpg", big_data, "image/jpeg")},
    )
    assert resp.status_code == 400


async def test_upload_unsupported_format(client: AsyncClient, super_admin, redis_client: Redis):
    await _login(client)
    gid = await _create_group(client, "ФТ-ГР5")
    emp = await _create_employee(client, gid, "+79600000005")

    # Send a text file disguised as image
    resp = await client.post(
        f"/api/employees/{emp['id']}/photo",
        files={"file": ("file.heic", b"not-an-image", "image/heic")},
    )
    assert resp.status_code in (400, 415)
