from unittest.mock import MagicMock

import pytest

from app.core.dependencies import require_permission
from app.core.errors import PermissionDenied


def _make_admin(permissions: list[str]):
    admin = MagicMock()
    admin.role = MagicMock()
    admin.role.permissions = permissions
    return admin


@pytest.mark.asyncio
async def test_allowed():
    checker = require_permission("admins:manage")
    admin = _make_admin(["admins:manage", "roles:manage"])
    result = await checker(admin=admin)
    assert result is admin


@pytest.mark.asyncio
async def test_denied_missing_permission():
    checker = require_permission("admins:manage")
    admin = _make_admin(["employees:view"])
    with pytest.raises(PermissionDenied):
        await checker(admin=admin)


@pytest.mark.asyncio
async def test_denied_empty_permissions():
    checker = require_permission("admins:manage")
    admin = _make_admin([])
    with pytest.raises(PermissionDenied):
        await checker(admin=admin)


@pytest.mark.asyncio
async def test_denied_no_role():
    checker = require_permission("admins:manage")
    admin = MagicMock()
    admin.role = None
    with pytest.raises(PermissionDenied):
        await checker(admin=admin)


@pytest.mark.asyncio
async def test_multiple_permissions_all_checked():
    for perm in ["employees:view", "rooms:manage", "admins:manage", "roles:manage"]:
        checker = require_permission(perm)
        admin = _make_admin([perm])
        result = await checker(admin=admin)
        assert result is admin
