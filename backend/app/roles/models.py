from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(Text, unique=True, nullable=False)
    label = Column(Text, nullable=False)
    description = Column(Text, nullable=False, server_default="")
    permissions = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    is_system = Column(Boolean, nullable=False, server_default=text("false"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    __table_args__ = (Index("idx_roles_name", "name"),)
