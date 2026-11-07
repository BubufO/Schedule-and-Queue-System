"""Queue ordering and bookkeeping, kept separate from the HTTP layer so it is easy to test.

The people in each queue are rows in the queue_entries table (app.models.QueueEntry).

Ordering rule: a queue is served by priority first (high, then medium, then low) and by
arrival order within the same priority. New entries get the right `position` when they join,
so position 1 is always the next person to serve.

Functions that change a queue lock its queues row first (queue_state(lock=True)), so
concurrent requests for the same queue run one after another.
"""

from dataclasses import dataclass, field
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ACTIVE_STATUSES, FINISHED_STATUSES, Queue, QueueEntry, Service, queue_entry_seq
from app.store import utc_now

PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


@dataclass
class QueueState:
    """A queue's active visits: who is waiting (in serving order) and who is being served."""

    waiting: list[QueueEntry] = field(default_factory=list)
    serving: QueueEntry | None = None


def _active(stmt):
    return stmt.where(QueueEntry.status.in_(ACTIVE_STATUSES)).order_by(QueueEntry.position)


def _split(entries) -> QueueState:
    state = QueueState()
    for entry in entries:
        if entry.status == "serving":
            state.serving = entry
        else:
            state.waiting.append(entry)
    return state


def queue_state(db: Session, service: Service, *, lock: bool = False) -> QueueState:
    """The service's active visits. With lock, holds its queues row until the transaction ends."""
    if service.queue is None:
        return QueueState()
    if lock:
        db.execute(select(Queue.queue_id).where(Queue.queue_id == service.queue.queue_id).with_for_update())
    return _split(db.scalars(_active(select(QueueEntry).where(QueueEntry.queue_id == service.queue.queue_id))))


def all_queue_states(db: Session) -> dict[str, QueueState]:
    """Active visits for every service in one query, keyed by service id."""
    states: dict[str, list[QueueEntry]] = {}
    for entry in db.scalars(_active(select(QueueEntry).where(QueueEntry.queue_id.is_not(None)))):
        states.setdefault(entry.service_id, []).append(entry)
    return {service_id: _split(entries) for service_id, entries in states.items()}


def finished_visits(db: Session, user_id: str) -> list[QueueEntry]:
    """A user's finished visits, newest first."""
    return list(db.scalars(
        select(QueueEntry)
        .where(QueueEntry.user_id == user_id, QueueEntry.status.in_(FINISHED_STATUSES))
        .order_by(QueueEntry.ended_at.desc(), QueueEntry.id.desc())
    ))


def insert_index(queue: list[QueueEntry], priority: str) -> int:
    """Position for a new arrival: behind everyone of the same or higher priority."""
    rank = PRIORITY_RANK[priority]
    for index, entry in enumerate(queue):
        if PRIORITY_RANK[entry.priority] > rank:
            return index
    return len(queue)


def _next_number(db: Session) -> int:
    if db.get_bind().dialect.name == "postgresql":
        return db.scalar(queue_entry_seq.next_value())
    # The SQLite test database has no sequences, and its rows are never deleted.
    return 101 + db.scalar(select(func.count()).select_from(QueueEntry))


def add_entry(
    db: Session,
    service: Service,
    name: str,
    *,
    priority: str = "medium",
    user_id: str | None = None,
    joined_at: datetime | None = None,
) -> QueueEntry:
    """Add someone to the service's queue in priority order. The caller commits."""
    if service.queue is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This service has no queue yet.")
    queue = queue_state(db, service, lock=True).waiting
    index = insert_index(queue, priority)
    for behind in queue[index:]:
        behind.position += 1
    number = _next_number(db)
    entry = QueueEntry(
        id=f"entry-{number}",
        queue_id=service.queue.queue_id,
        service_id=service.id,
        service_name=service.name,
        user_id=user_id,
        name=name,
        ticket=f"{service.ticket_prefix}{number:03d}",
        priority=priority,
        status="waiting",
        position=index + 1,
        joined_at=joined_at or utc_now(),
    )
    db.add(entry)
    db.flush()
    return entry


def find_user_visit(db: Session, user_id: str) -> QueueEntry | None:
    """The user's current visit (waiting or being served, at any service), or None."""
    return db.scalar(
        select(QueueEntry).where(QueueEntry.user_id == user_id, QueueEntry.status.in_(ACTIVE_STATUSES))
    )


def _leave_line(db: Session, entry: QueueEntry) -> None:
    """Take a waiting entry out of the line and close the gap behind it."""
    if entry.status != "waiting":
        return
    for behind in list(db.scalars(select(QueueEntry).where(
        QueueEntry.queue_id == entry.queue_id, QueueEntry.status == "waiting",
        QueueEntry.position > entry.position,
    ))):
        behind.position -= 1
    entry.position = None


def start_serving(db: Session, entry: QueueEntry) -> None:
    _leave_line(db, entry)
    entry.status = "serving"
    entry.started_at = utc_now()
    db.flush()


def archive(db: Session, entry: QueueEntry, outcome: str, service_name: str | None = None) -> None:
    """Finish a visit; its row stays as history. Pass the service's current name if it changed."""
    _leave_line(db, entry)
    entry.status = outcome
    entry.ended_at = utc_now()
    if service_name:
        entry.service_name = service_name
    # Flushed now so a following start_serving can't trip the one-serving-per-queue index.
    db.flush()


def cancel_all(db: Session, service: Service) -> None:
    """Cancel every active visit at a service (used before the service is deleted)."""
    state = queue_state(db, service, lock=True)
    for entry in ([state.serving] if state.serving else []) + state.waiting:
        entry.status, entry.position, entry.ended_at = "cancelled", None, utc_now()
        entry.service_name = service.name
    db.flush()


def wait_minutes(service: Service, people_ahead: int, someone_serving: bool) -> int:
    """Estimated minutes until service starts, using the current ordered position.

    Position 1 has zero waiting people ahead. Count an active visit as one full
    duration; this intentionally does not promise a countdown or infer progress.
    Recomputed from live state after joins, departures, reordering, and duration edits.
    """
    return service.duration_minutes * (people_ahead + (1 if someone_serving else 0))


def join_wait_minutes(state: QueueState, service: Service, priority: str = "medium") -> int:
    """Estimate a new arrival's wait at their priority's actual insertion position."""
    return wait_minutes(service, insert_index(state.waiting, priority), state.serving is not None)
