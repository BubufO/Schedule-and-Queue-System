"""Table models for the Supabase database.

These mirror the tables created in Supabase, constraints included, so the database enforces the
same rules as the API: required fields, length limits, types, and unique service names.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Sequence,
    String,
    false,
    func,
    text,
)
from sqlalchemy.types import TypeDecorator
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


class UserCredentials(Base):
    """Authentication data; profile details share the same stable user ID."""

    __tablename__ = "user_credentials"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False, default="client")
    profile: Mapped["UserProfile"] = relationship(
        cascade="all, delete-orphan", uselist=False, lazy="joined"
    )

    __table_args__ = (
        CheckConstraint("length(trim(id)) BETWEEN 1 AND 64", name="chk_user_id"),
        CheckConstraint("length(username) BETWEEN 3 AND 32", name="chk_username_length"),
        CheckConstraint("length(trim(email)) BETWEEN 3 AND 254", name="chk_email_length"),
        CheckConstraint("length(password_hash) BETWEEN 1 AND 255", name="chk_password_hash_length"),
        CheckConstraint("role IN ('client', 'admin')", name="chk_user_role"),
        Index("uq_user_username", func.lower(username), unique=True),
        Index("uq_user_email", func.lower(email), unique=True),
    )


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("user_credentials.id", ondelete="CASCADE"), primary_key=True
    )
    display_name: Mapped[str] = mapped_column(String(60), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(16))
    notify_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_sms: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notify_in_app: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        CheckConstraint("length(trim(display_name)) BETWEEN 1 AND 60", name="chk_profile_name"),
        CheckConstraint("phone IS NULL OR length(phone) BETWEEN 10 AND 16", name="chk_profile_phone"),
        CheckConstraint("NOT notify_sms OR phone IS NOT NULL", name="chk_sms_phone"),
    )


class UTCDateTime(TypeDecorator):
    """timestamptz that always reads back as UTC-aware, even on SQLite (which drops the zone)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


# Ticket numbers and entry ids ("entry-101", "A101") come from this Postgres sequence.
queue_entry_seq = Sequence("queue_entry_seq", start=101, metadata=Base.metadata)

ACTIVE_STATUSES = ("waiting", "serving")
FINISHED_STATUSES = ("served", "left", "removed", "cancelled")


class QueueEntry(Base):
    """One visit to a service's queue: waiting (with a position), then being served, then finished.

    Finished rows are the visit history. They keep the service's id and name, so history
    survives the service being deleted (queue_id is then set to NULL).
    """

    __tablename__ = "queue_entries"

    id: Mapped[str] = mapped_column("entry_id", String(64), primary_key=True)
    queue_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("queues.queue_id", ondelete="SET NULL"))
    service_id: Mapped[str] = mapped_column(String(64), nullable=False)
    service_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # NULL for guests who joined with a link.
    user_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("user_credentials.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    ticket: Mapped[str] = mapped_column(String(10), nullable=False)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, server_default="medium")
    status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="waiting")
    # 1 is next in line. Only set while waiting.
    position: Mapped[int | None] = mapped_column(Integer)
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    __table_args__ = (
        CheckConstraint("LENGTH(TRIM(name)) > 0", name="chk_queue_entries_name_not_blank"),
        CheckConstraint("priority IN ('low', 'medium', 'high')", name="chk_queue_entries_priority"),
        CheckConstraint(
            "status IN ('waiting', 'serving', 'served', 'left', 'removed', 'cancelled')",
            name="chk_queue_entries_status",
        ),
        CheckConstraint("(status = 'waiting') = (position IS NOT NULL)", name="chk_queue_entries_position"),
        CheckConstraint("(status IN ('waiting', 'serving')) = (ended_at IS NULL)", name="chk_queue_entries_ended"),
        Index("ix_queue_entries_queue_status_pos", "queue_id", "status", "position"),
        Index("ix_queue_entries_user", "user_id", "ended_at"),
        # A user holds at most one active visit; a queue serves one person at a time.
        Index("uq_queue_entries_user_active", "user_id", unique=True,
              postgresql_where=text("status IN ('waiting', 'serving')"),
              sqlite_where=text("status IN ('waiting', 'serving')")),
        Index("uq_queue_entries_queue_serving", "queue_id", unique=True,
              postgresql_where=text("status = 'serving'"),
              sqlite_where=text("status = 'serving'")),
    )

    @property
    def outcome(self) -> str:
        """How a finished visit ended (the API's name for status)."""
        return self.status

    def __repr__(self) -> str:
        return f"QueueEntry(id={self.id!r}, service_id={self.service_id!r}, status={self.status!r})"
