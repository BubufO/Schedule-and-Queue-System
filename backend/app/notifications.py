"""Notification logic. Notifications are saved in the notifications table; email/SMS are only logged.

Every trigger adds rows to the session without committing, so the caller commits them.
Which positions each visitor was last told about is still tracked in memory (Store).
"""

import logging
import uuid
from datetime import datetime, timedelta
from threading import Lock

from sqlalchemy.orm import Session

from app.models import Notification, QueueEntry, Service
from app.store import Store, utc_now
from app.users import get_user

logger = logging.getLogger("queuesmart.notifications")

# "Close to being served" means this many places from the front, or fewer (1 = next up).
NEAR_FRONT_POSITION = 2

_last_stamp: datetime | None = None
_stamp_lock = Lock()


def _stamp() -> datetime:
    """The current time, always later than the previous call's.

    The inbox is sorted by created_at, so two notifications from one request (such as "joined"
    and "approaching") must never share a timestamp.
    """
    global _last_stamp
    with _stamp_lock:
        now = utc_now()
        if _last_stamp is not None and now <= _last_stamp:
            now = _last_stamp + timedelta(microseconds=1)
        _last_stamp = now
        return now


def notify(
    db: Session,
    user_id: str,
    type_: str,
    title: str,
    message: str,
    service_id: str | None = None,
    old_position: int | None = None,
    new_position: int | None = None,
) -> Notification | None:
    """Delivers a notification through the channels the user turned on in profile settings.

    Email and SMS are mocked: they are logged, never sent. Returns the saved in-app row, or None
    when the user turned in-app notifications off or has no account (notifications.user_id must
    name a row in user_credentials).
    """
    user = get_user(db, user_id)
    if user is None:
        logger.warning("no account %s; dropped [%s]: %s", user_id, type_, message)
        return None
    if user.notify_email and user.email:
        logger.info("would email %s [%s]: %s", user_id, type_, message)
    if user.notify_sms and user.phone:
        logger.info("would text %s [%s]: %s", user_id, type_, message)
    if not user.notify_in_app:
        return None
    record = Notification(
        id=f"notif-{uuid.uuid4().hex}",
        user_id=user_id,
        type=type_,
        title=title,
        message=message,
        timestamp=_stamp(),
        service_id=service_id,
        old_position=old_position,
        new_position=new_position,
        status="sent",
    )
    db.add(record)
    db.flush()  # checks the row now, inside the caller's transaction
    logger.info("notification for %s [%s]: %s", user_id, type_, message)
    return record


def notify_joined(db: Session, service: Service, entry: QueueEntry, wait: int) -> None:
    if entry.user_id:
        notify(db, entry.user_id, "joined", "Queue Joined",
               f"You successfully joined {service.name}. Estimated wait: {wait} minutes.",
               service_id=service.id)


def notify_left(db: Session, service: Service, entry: QueueEntry) -> None:
    if entry.user_id:
        notify(db, entry.user_id, "left", "Left Queue",
               f"You left the queue for {service.name}.",
               service_id=service.id)


def notify_removed(db: Session, service: Service, entry: QueueEntry) -> None:
    if entry.user_id:
        notify(db, entry.user_id, "removed", "Removed from Queue",
               f"Staff removed you from the queue for {service.name}.",
               service_id=service.id)


def notify_now_serving(db: Session, service: Service, entry: QueueEntry) -> None:
    if entry.user_id:
        notify(db, entry.user_id, "turn", "It's your turn!",
               f"Your turn at {service.name}. Please report to staff.", service_id=service.id)


def forget(store: Store, entry_id: str) -> None:
    """Drop tracking for an entry that left the waiting list."""
    store.last_position.pop(entry_id, None)
    store.approaching_notified.discard(entry_id)


def refresh_positions(db: Session, store: Store, service: Service, waiting: list[QueueEntry]) -> None:
    """Call after any change to a service's waiting list, passing the list in serving order."""
    for index, entry in enumerate(waiting):
        if entry.user_id is None:
            continue
        position = index + 1
        old = store.last_position.get(entry.id)
        if old is not None and old != position:
            notify(db, entry.user_id, "update", "Queue Updated",
                   f"Your position changed from #{old} to #{position}.",
                   service_id=service.id, old_position=old, new_position=position)
        if position <= NEAR_FRONT_POSITION and entry.id not in store.approaching_notified:
            store.approaching_notified.add(entry.id)
            notify(db, entry.user_id, "approaching", "Your turn is approaching!",
                   f"You are currently #{position} in {service.name}.",
                   service_id=service.id, new_position=position)
        store.last_position[entry.id] = position
