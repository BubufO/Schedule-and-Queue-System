"""Queue ordering and bookkeeping, kept separate from the HTTP layer so it is easy to test.

Ordering rule: a queue is served by priority first (high, then medium, then low) and by
arrival order within the same priority. New entries are inserted in the right place when
they join, so the front of the list is always the next person to serve.
"""

from datetime import datetime

from app.store import QueueEntryRecord, ServiceRecord, Store, VisitRecord, utc_now

PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


def insert_index(queue: list[QueueEntryRecord], priority: str) -> int:
    """Position for a new arrival: behind everyone of the same or higher priority."""
    rank = PRIORITY_RANK[priority]
    for index, entry in enumerate(queue):
        if PRIORITY_RANK[entry.priority] > rank:
            return index
    return len(queue)


def add_entry(
    store: Store,
    service: ServiceRecord,
    name: str,
    *,
    priority: str = "medium",
    user_id: str | None = None,
    joined_at: datetime | None = None,
) -> QueueEntryRecord:
    number = store.next_sequence()
    entry = QueueEntryRecord(
        id=f"entry-{number}",
        service_id=service.id,
        name=name,
        ticket=f"{service.ticket_prefix}{number:03d}",
        joined_at=joined_at or utc_now(),
        priority=priority,
        user_id=user_id,
    )
    queue = store.queues.setdefault(service.id, [])
    queue.insert(insert_index(queue, priority), entry)
    return entry


def find_user_visit(store: Store, user_id: str) -> tuple[str, QueueEntryRecord, bool] | None:
    """The user's current visit as (service id, entry, is being served), or None."""
    for service_id, serving in store.now_serving.items():
        if serving.entry.user_id == user_id:
            return service_id, serving.entry, True
    for service_id, queue in store.queues.items():
        for entry in queue:
            if entry.user_id == user_id:
                return service_id, entry, False
    return None


def archive(store: Store, entry: QueueEntryRecord, outcome: str) -> None:
    service = store.services.get(entry.service_id)
    store.history.insert(
        0,
        VisitRecord(
            entry=entry,
            service_name=service.name if service else "Deleted service",
            ended_at=utc_now(),
            outcome=outcome,
        ),
    )


def wait_minutes(store: Store, service: ServiceRecord, people_ahead: int) -> int:
    """Estimated minutes until service starts, using the current ordered position.

    Position 1 has zero waiting people ahead. Count an active visit as one full
    duration; this intentionally does not promise a countdown or infer progress.
    Recomputed from live state after joins, departures, reordering, and duration edits.
    """
    serving = 1 if service.id in store.now_serving else 0
    return service.duration_minutes * (people_ahead + serving)


def join_wait_minutes(store: Store, service: ServiceRecord, priority: str = "medium") -> int:
    """Estimate a new arrival's wait at their priority's actual insertion position."""
    queue = store.queues.get(service.id, [])
    return wait_minutes(store, service, insert_index(queue, priority))
