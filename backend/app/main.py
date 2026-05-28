from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.errors import (
    APIError,
    api_error_handler,
    internal_error_handler,
    validation_error_handler,
)
from app.auth.router import router as auth_router
from app.admins.router import router as admins_router
from app.roles.router import router as roles_router
from app.rooms.router import router as rooms_router
from app.groups.router import router as groups_router
from app.employees.router import router as employees_router
from app.core.logging import RequestLoggingMiddleware, configure_logging
from app.core.middleware import ContentTypeMiddleware, PasswordChangeRequiredMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    yield


app = FastAPI(title="АСПиРС CRM", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
    max_age=86400,
)
app.add_middleware(PasswordChangeRequiredMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(ContentTypeMiddleware)

app.add_exception_handler(APIError, api_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(Exception, internal_error_handler)

app.include_router(auth_router)
app.include_router(admins_router)
app.include_router(roles_router)
app.include_router(rooms_router)
app.include_router(groups_router)
app.include_router(employees_router)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}
