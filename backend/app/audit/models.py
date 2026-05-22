from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(BigInteger, primary_key=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    event = Column(Text, nullable=False)
    actor_id = Column(Integer, ForeignKey("admins.id", ondelete="SET NULL"))
    actor_username = Column(Text)
    target_type = Column(Text)
    target_id = Column(Integer)
    ip = Column(Text)
    request_id = Column(Text)
    details = Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    __table_args__ = (
        Index("idx_audit_log_actor_ts", "actor_id", "timestamp"),
        Index("idx_audit_log_ts", "timestamp"),
        Index("idx_audit_log_event", "event"),
    )
