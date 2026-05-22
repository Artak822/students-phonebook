import os

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — регистрирует все модели в Base.metadata
from app.core.dependencies import get_db
from app.core.redis import get_redis
from app.database import Base
from app.main import app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://aspirs_test:aspirs_test@db_test:5432/aspirs_test",
)
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://redis_test:6379/1")

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    conn = await test_engine.connect()
    trans = await conn.begin()
    session = AsyncSession(conn, expire_on_commit=False, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        await session.close()
        await trans.rollback()
        await conn.close()


@pytest_asyncio.fixture
async def redis_client() -> Redis:
    rc = Redis.from_url(TEST_REDIS_URL, decode_responses=True)
    await rc.flushdb()
    yield rc
    await rc.flushdb()
    await rc.aclose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession, redis_client: Redis) -> AsyncClient:
    async def _override_get_db():
        yield db_session

    async def _override_get_redis():
        yield redis_client

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def super_admin(db_session: AsyncSession):
    from sqlalchemy import select

    from app.admins.models import Admin
    from app.core.security import hash_password
    from app.roles.models import Role

    result = await db_session.execute(select(Role).where(Role.name == "super_admin"))
    role = result.scalar_one_or_none()

    if role is None:
        role = Role(
            name="super_admin",
            label="Суперадминистратор",
            description="",
            permissions=[
                "employees:view", "employees:edit", "employees:delete",
                "employees:assign_room", "rooms:view", "rooms:manage",
                "admins:manage", "roles:manage", "history:view",
            ],
            is_system=True,
        )
        db_session.add(role)
        await db_session.flush()

    admin = Admin(
        username="test_superadmin",
        password_hash=hash_password("password123"),
        fio="Тест Суперадмин",
        role_id=role.id,
        is_active=True,
        password_changed=True,
    )
    db_session.add(admin)
    await db_session.flush()
    return admin


@pytest_asyncio.fixture
async def tutor_admin(db_session: AsyncSession):
    from sqlalchemy import select

    from app.admins.models import Admin
    from app.core.security import hash_password
    from app.roles.models import Role

    result = await db_session.execute(select(Role).where(Role.name == "tutor"))
    role = result.scalar_one_or_none()

    if role is None:
        role = Role(
            name="tutor",
            label="Воспитатель",
            description="",
            permissions=["employees:view", "employees:edit", "employees:assign_room", "rooms:view", "history:view"],
            is_system=True,
        )
        db_session.add(role)
        await db_session.flush()

    admin = Admin(
        username="test_tutor",
        password_hash=hash_password("password123"),
        fio="Тест Воспитатель",
        role_id=role.id,
        is_active=True,
        password_changed=True,
    )
    db_session.add(admin)
    await db_session.flush()
    return admin


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, super_admin) -> AsyncClient:
    response = await client.post(
        "/api/auth/login",
        json={"username": "test_superadmin", "password": "password123"},
    )
    assert response.status_code == 200, response.text
    return client
