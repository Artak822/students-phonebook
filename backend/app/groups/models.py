from sqlalchemy import Column, DateTime, Index, Integer, Text, text

from app.database import Base


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True)
    name = Column(Text, unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    __table_args__ = (Index("idx_groups_name", "name"),)
