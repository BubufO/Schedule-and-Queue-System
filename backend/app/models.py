"""Table models for the Supabase database.

These mirror the tables created in Supabase, constraints included, so the database enforces the
same rules as the API: required fields, length limits, types, and unique service names.
"""

from sqlalchemy import Boolean, CheckConstraint, Index, Integer, String, false, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Service(Base):
    __tablename__ = "services"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, server_default="medium")
    is_open: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=false())
    ticket_prefix: Mapped[str] = mapped_column(String(1), nullable=False)

    __table_args__ = (
        CheckConstraint("LENGTH(TRIM(id)) > 0", name="chk_services_id_not_blank"),
        CheckConstraint("LENGTH(TRIM(name)) > 0", name="chk_services_name_not_blank"),
        CheckConstraint("LENGTH(TRIM(description)) > 0", name="chk_services_description_not_blank"),
        CheckConstraint("duration_minutes BETWEEN 1 AND 480", name="chk_services_duration_range"),
        CheckConstraint("priority IN ('low', 'medium', 'high')", name="chk_services_priority"),
        # Service names are unique ignoring case.
        Index("uq_services_name", func.lower(name), unique=True),
    )

    def __repr__(self) -> str:
        return f"Service(id={self.id!r}, name={self.name!r})"
