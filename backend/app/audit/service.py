from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import AuditLog


async def write_audit(
    db: AsyncSession,
    event: str,
    *,
    actor_id: int | None = None,
    actor_username: str | None = None,
    ip: str | None = None,
    request_id: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    details: dict | None = None,
) -> None:
    db.add(AuditLog(
        event=event,
        actor_id=actor_id,
        actor_username=actor_username,
        ip=ip,
        request_id=request_id,
        target_type=target_type,
        target_id=target_id,
        details=details or {},
    ))
