"""Direct tests of notification rules, including the close-to-front boundary."""

import logging

import pytest
from sqlalchemy import select

from app.models import Notification
from app.notifications import (
    forget, notify, notify_joined, notify_left, notify_now_serving,
    notify_removed, refresh_positions,
)
from app.queueing import add_entry, archive, queue_state
from app.store import UserRecord
from app.users import save_user


def waiting(db, service):
    return queue_state(db, service).waiting


def saved(db):
    """Every saved notification, newest first."""
    return list(db.scalars(select(Notification).order_by(Notification.timestamp.desc(), Notification.id.desc())))


@pytest.fixture(autouse=True)
def accounts(db):
    """notifications.user_id must name an account, so the users in these tests have one."""
    for user_id in ("alice", "bob"):
        save_user(db, UserRecord(user_id, user_id, "unused", user_id.title(), "client", f"{user_id}@example.com"))


def test_notify_stores_newest_first_and_logs_without_external_delivery(db, caplog):
    with caplog.at_level(logging.INFO, logger="queuesmart.notifications"):
        first = notify(db, "alice", "joined", "Joined", "You joined", service_id="advising")
        second = notify(db, "alice", "update", "Moved", "Position changed",
                        old_position=3, new_position=2)
    assert saved(db) == [second, first]
    assert first.id != second.id
    assert first.id.startswith("notif-")
    assert first.read is False
    assert (first.status, first.viewed_at) == ("sent", None)
    assert second.timestamp > first.timestamp
    assert first.timestamp.tzinfo is not None
    assert first.service_id == "advising"
    assert (second.old_position, second.new_position) == (3, 2)
    assert "notification for alice [joined]: You joined" in caplog.text


@pytest.mark.parametrize("trigger,type_,message", [
    (notify_joined, "joined", "Estimated wait: 20 minutes."),
    (notify_left, "left", "You left the queue"),
    (notify_removed, "removed", "Staff removed you"),
    (notify_now_serving, "turn", "Please report to staff."),
])
@pytest.mark.parametrize("guest", [False, True])
def test_visit_notification_triggers_only_for_registered_users(db, service, trigger, type_, message, guest):
    entry = add_entry(db, service, "Alice", user_id=None if guest else "alice")
    args = (20,) if trigger is notify_joined else ()
    trigger(db, service, entry, *args)
    if guest:
        assert saved(db) == []
    else:
        assert len(saved(db)) == 1
        notification = saved(db)[0]
        assert notification.user_id == "alice"
        assert notification.service_id == service.id
        assert notification.type == type_
        assert service.name in notification.message
        assert message in notification.message


def test_approaching_threshold_counts_guests_and_does_not_repeat(store, db, service):
    guest = add_entry(db, service, "Guest")
    second = add_entry(db, service, "Alice", user_id="alice")
    third = add_entry(db, service, "Bob", user_id="bob")
    refresh_positions(db, store, service, waiting(db, service))
    assert [(n.user_id, n.type, n.new_position) for n in saved(db)] == [
        ("alice", "approaching", 2)
    ]
    assert store.last_position == {second.id: 2, third.id: 3}
    refresh_positions(db, store, service, waiting(db, service))
    assert len(saved(db)) == 1

    archive(db, guest, "left")
    refresh_positions(db, store, service, waiting(db, service))
    assert [(n.user_id, n.type, n.old_position, n.new_position) for n in saved(db)[:3]] == [
        ("bob", "approaching", None, 2), ("bob", "update", 3, 2), ("alice", "update", 2, 1)
    ]
    assert store.approaching_notified == {second.id, third.id}
    refresh_positions(db, store, service, waiting(db, service))
    assert len(saved(db)) == 4


def test_moving_away_and_back_does_not_repeat_approaching_for_same_visit(store, db, service):
    entry = add_entry(db, service, "Alice", user_id="alice")
    refresh_positions(db, store, service, waiting(db, service))
    guests = [add_entry(db, service, name, priority="high") for name in ["Guest 1", "Guest 2"]]
    refresh_positions(db, store, service, waiting(db, service))
    assert saved(db)[0].type == "update"
    assert (saved(db)[0].old_position, saved(db)[0].new_position) == (1, 3)
    for guest in guests:
        archive(db, guest, "left")
    refresh_positions(db, store, service, waiting(db, service))
    assert sum(n.type == "approaching" for n in saved(db)) == 1
    assert saved(db)[0].new_position == 1


def test_forget_cleans_tracking_and_is_safe_to_repeat(store, db, service):
    entry = add_entry(db, service, "Alice", user_id="alice")
    refresh_positions(db, store, service, waiting(db, service))
    forget(store, entry.id)
    forget(store, entry.id)
    assert entry.id not in store.last_position
    assert entry.id not in store.approaching_notified
    assert len(saved(db)) == 1  # Forgetting tracking preserves inbox history.


def test_notify_follows_saved_channel_preferences(db, caplog):
    save_user(db, UserRecord("alice", "alice", "unused", "Alice", "client", "alice@example.com",
                             "5551234567", notify_email=True, notify_sms=True, notify_in_app=False))
    with caplog.at_level(logging.INFO, logger="queuesmart.notifications"):
        assert notify(db, "alice", "joined", "Joined", "You joined") is None
    assert saved(db) == []
    assert "would email alice [joined]" in caplog.text
    assert "would text alice [joined]" in caplog.text


def test_users_without_an_account_get_no_notification(db, caplog):
    with caplog.at_level(logging.INFO, logger="queuesmart.notifications"):
        assert notify(db, "nobody", "joined", "Joined", "You joined") is None
    assert saved(db) == []
    assert "no account nobody" in caplog.text


def test_mark_viewed_sets_status_and_time_once(db):
    notification = notify(db, "alice", "joined", "Joined", "You joined")
    first = notification.timestamp
    notification.mark_viewed(first)
    notification.mark_viewed(first.replace(year=first.year + 1))
    db.commit()
    assert (notification.read, notification.status, notification.viewed_at) == (True, "viewed", first)


def test_notifications_survive_a_new_session(db):
    """They are rows in the database, so a restart (a new store and session) keeps them."""
    notify(db, "alice", "joined", "Joined", "You joined")
    db.commit()
    db.expunge_all()
    assert [(n.user_id, n.type, n.read) for n in saved(db)] == [("alice", "joined", False)]
