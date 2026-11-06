"""Table models for the Supabase database.

These mirror the tables created in Supabase, constraints included, so the database enforces the
same rules as the API: required fields, length limits, types, and unique service names.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    false,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Service(Base):
    __tablename__ = "services"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, server_default="medium")
    # The services.is_open column. Read is_open instead, which follows the queue's status.
    open_flag: Mapped[bool] = mapped_column("is_open", Boolean, nullable=False, server_default=false())
    ticket_prefix: Mapped[str] = mapped_column(String(1), nullable=False)

    # Each service has one queue row; deleting the service deletes it.
    queue: Mapped["Queue | None"] = relationship(
        back_populates="service", uselist=False, cascade="all, delete-orphan", lazy="joined"
    )

    __table_args__ = (
        CheckConstraint("LENGTH(TRIM(id)) > 0", name="chk_services_id_not_blank"),
        CheckConstraint("LENGTH(TRIM(name)) > 0", name="chk_services_name_not_blank"),
        CheckConstraint("LENGTH(TRIM(description)) > 0", name="chk_services_description_not_blank"),
        CheckConstraint("duration_minutes BETWEEN 1 AND 480", name="chk_services_duration_range"),
        CheckConstraint("priority IN ('low', 'medium', 'high')", name="chk_services_priority"),
        # Service names are unique ignoring case.
        Index("uq_services_name", func.lower(name), unique=True),
    )

    @property
    def is_open(self) -> bool:
        """Whether people can join. The queue's status is the source of truth."""
        if self.queue is not None:
            return self.queue.status == "open"
        return self.open_flag

    @is_open.setter
    def is_open(self, value: bool) -> None:
        # Update the queue row (creating it if the service doesn't have one yet) and keep the
        # services.is_open column in step, so the two never disagree.
        status = "open" if value else "closed"
        if self.queue is None:
            self.queue = Queue(status=status)
        else:
            self.queue.status = status
        self.open_flag = value

    def __repr__(self) -> str:
        return f"Service(id={self.id!r}, name={self.name!r})"


class Queue(Base):
    """The active queue for a service: whether it is open, and when it was created."""

    __tablename__ = "queues"

    queue_id: Mapped[int] = mapped_column(Integer, Identity(always=True), primary_key=True)
    service_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("services.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="closed")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    service: Mapped[Service] = relationship(back_populates="queue")

    __table_args__ = (
        CheckConstraint("status IN ('open', 'closed')", name="chk_queues_status"),
    )

    def __repr__(self) -> str:
        return f"Queue(queue_id={self.queue_id!r}, service_id={self.service_id!r}, status={self.status!r})"
