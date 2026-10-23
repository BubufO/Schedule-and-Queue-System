"""Direct tests of notification rules, including the close-to-front boundary."""

import logging

import pytest

from app.notifications import (
    forget, notify, notify_joined, notify_left, notify_now_serving,
    notify_removed, refresh_positions,
)
from app.queueing import add_entry


def test_notify_stores_newest_first_and_logs_without_external_delivery(store, caplog):
    with caplog.at_level(logging.INFO, logger="queuesmart.notifications"):
        first = notify(store, "alice", "joined", "Joined", "You joined", service_id="advising")
        second = notify(store, "alice", "update", "Moved", "Position changed",
                        old_position=3, new_position=2)
    assert store.notifications == [second, first]
    assert first.id != second.id
    assert first.read is False
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
def test_visit_notification_triggers_only_for_registered_users(store, service, trigger, type_, message, guest):
    entry = add_entry(store, service, "Alice", user_id=None if guest else "alice")
    args = (20,) if trigger is notify_joined else ()
    trigger(store, service, entry, *args)
    if guest:
        assert store.notifications == []
    else:
        assert len(store.notifications) == 1
        notification = store.notifications[0]
        assert notification.user_id == "alice"
        assert notification.service_id == service.id
        assert notification.type == type_
        assert service.name in notification.message
        assert message in notification.message


def test_approaching_threshold_counts_guests_and_does_not_repeat(store, service):
    guest = add_entry(store, service, "Guest")
    second = add_entry(store, service, "Alice", user_id="alice")
    third = add_entry(store, service, "Bob", user_id="bob")
    refresh_positions(store, service)
    assert [(n.user_id, n.type, n.new_position) for n in store.notifications] == [
        ("alice", "approaching", 2)
    ]
    assert store.last_position == {second.id: 2, third.id: 3}
    refresh_positions(store, service)
    assert len(store.notifications) == 1

    store.queues[service.id].remove(guest)
    refresh_positions(store, service)
    assert [(n.user_id, n.type, n.old_position, n.new_position) for n in store.notifications[:3]] == [
        ("bob", "approaching", None, 2), ("bob", "update", 3, 2), ("alice", "update", 2, 1)
    ]
    assert store.approaching_notified == {second.id, third.id}
    refresh_positions(store, service)
    assert len(store.notifications) == 4


def test_moving_away_and_back_does_not_repeat_approaching_for_same_visit(store, service):
    entry = add_entry(store, service, "Alice", user_id="alice")
    refresh_positions(store, service)
    for name in ["Guest 1", "Guest 2"]:
        add_entry(store, service, name, priority="high")
    refresh_positions(store, service)
    assert store.notifications[0].type == "update"
    assert (store.notifications[0].old_position, store.notifications[0].new_position) == (1, 3)
    store.queues[service.id] = [entry]
    refresh_positions(store, service)
    assert sum(n.type == "approaching" for n in store.notifications) == 1
    assert store.notifications[0].new_position == 1


def test_forget_cleans_tracking_and_is_safe_to_repeat(store, service):
    entry = add_entry(store, service, "Alice", user_id="alice")
    refresh_positions(store, service)
    forget(store, entry.id)
    forget(store, entry.id)
    assert entry.id not in store.last_position
    assert entry.id not in store.approaching_notified
    assert len(store.notifications) == 1  # Forgetting tracking preserves inbox history.
