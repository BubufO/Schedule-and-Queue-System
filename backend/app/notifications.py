"""Notification logic. Notifications are stored in memory and logged; no real email/SMS."""

import logging

from app.store import NotificationRecord, QueueEntryRecord, ServiceRecord, Store, utc_now

logger = logging.getLogger("queuesmart.notifications")

# "Close to being served" means this many places from the front, or fewer (1 = next up).
NEAR_FRONT_POSITION = 2


def notify(
    store: Store,
    user_id: str,
    type_: str,
    title: str,
    message: str,
    service_id: str | None = None,
    old_position: int | None = None,
    new_position: int | None = None,
) -> NotificationRecord:
    record = NotificationRecord(
        id=f"notif-{store.next_sequence()}",
        user_id=user_id,
        type=type_,
        title=title,
        message=message,
        timestamp=utc_now(),
        service_id=service_id,
        old_position=old_position,
        new_position=new_position,
    )
    store.notifications.insert(0, record)
    logger.info("notification for %s [%s]: %s", user_id, type_, message)
    return record


def notify_joined(store: Store, service: ServiceRecord, entry: QueueEntryRecord, wait: int) -> None:
    if entry.user_id:
        notify(store, entry.user_id, "joined", "Queue Joined",
               f"You successfully joined {service.name}. Estimated wait: {wait} minutes.",
               service_id=service.id)


def notify_left(store: Store, service: ServiceRecord, entry: QueueEntryRecord) -> None:
    if entry.user_id:
        notify(store, entry.user_id, "left", "Left Queue",
               f"You left the queue for {service.name}.",
               service_id=service.id)


def notify_removed(store: Store, service: ServiceRecord, entry: QueueEntryRecord) -> None:
    if entry.user_id:
        notify(store, entry.user_id, "removed", "Removed from Queue",
               f"Staff removed you from the queue for {service.name}.",
               service_id=service.id)


def notify_now_serving(store: Store, service: ServiceRecord, entry: QueueEntryRecord) -> None:
    if entry.user_id:
        notify(store, entry.user_id, "turn", "It's your turn!",
               f"Your turn at {service.name}. Please report to staff.", service_id=service.id)


def forget(store: Store, entry_id: str) -> None:
    """Drop tracking for an entry that left the waiting list."""
    store.last_position.pop(entry_id, None)
    store.approaching_notified.discard(entry_id)


def refresh_positions(store: Store, service: ServiceRecord) -> None:
    """Call after any change to a service's waiting list."""
    for index, entry in enumerate(store.queues.get(service.id, [])):
        if entry.user_id is None:
            continue
        position = index + 1
        old = store.last_position.get(entry.id)
        if old is not None and old != position:
            notify(store, entry.user_id, "update", "Queue Updated",
                   f"Your position changed from #{old} to #{position}.",
                   service_id=service.id, old_position=old, new_position=position)
        if position <= NEAR_FRONT_POSITION and entry.id not in store.approaching_notified:
            store.approaching_notified.add(entry.id)
            notify(store, entry.user_id, "turn", "Your turn is approaching!",
                   f"You are currently #{position} in {service.name}.",
                   service_id=service.id, new_position=position)
        store.last_position[entry.id] = position