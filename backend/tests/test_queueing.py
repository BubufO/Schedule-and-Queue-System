"""Direct unit tests of queue ordering, wait estimates, and bookkeeping."""

from datetime import datetime, timezone

import pytest

from app.models import QueueEntry
from app.queueing import (
    add_entry, archive, cancel_all, find_user_visit, finished_visits, queue_state, start_serving, wait_minutes,
)


def names(db, service):
    return [e.name for e in queue_state(db, service).waiting]


def test_priority_order_preserves_arrival_order_within_priority(db, service):
    for name, priority in [("Low", "low"), ("First", "medium"), ("High", "high"),
                           ("Second", "medium"), ("High again", "high")]:
        add_entry(db, service, name, priority=priority)
    assert names(db, service) == ["High", "High again", "First", "Second", "Low"]
    assert [e.position for e in queue_state(db, service).waiting] == [1, 2, 3, 4, 5]


def test_entries_have_unique_tickets_and_preserve_visit_details(db, service):
    joined = datetime(2026, 1, 1, tzinfo=timezone.utc)
    first = add_entry(db, service, "Alice", user_id="alice", joined_at=joined)
    second = add_entry(db, service, "Bob")
    assert first.id != second.id
    assert first.ticket == "A101"
    assert second.ticket == "A102"
    assert first.joined_at == joined
    assert first.service_id == service.id
    assert first.queue_id == service.queue.queue_id
    assert first.user_id == "alice"


@pytest.mark.parametrize("ahead,serving,expected", [
    (0, False, 0), (3, False, 30), (0, True, 10), (3, True, 40)
])
def test_wait_estimate(service, ahead, serving, expected):
    assert wait_minutes(service, ahead, serving) == expected


def test_find_visit_waiting_serving_and_missing(db, service):
    assert find_user_visit(db, "alice") is None
    entry = add_entry(db, service, "Alice", user_id="alice")
    assert find_user_visit(db, "alice") is entry and entry.status == "waiting"
    start_serving(db, entry)
    assert find_user_visit(db, "alice") is entry and entry.status == "serving"
    assert queue_state(db, service).serving is entry
    archive(db, entry, "served")
    assert find_user_visit(db, "alice") is None
    assert find_user_visit(db, "unknown") is None


def test_leaving_closes_the_gap(db, service):
    first, second, third = (add_entry(db, service, n) for n in ["First", "Second", "Third"])
    archive(db, second, "left")
    assert [(e.name, e.position) for e in queue_state(db, service).waiting] == [("First", 1), ("Third", 2)]
    assert second.position is None and second.ended_at is not None


def test_history_is_newest_first_and_keeps_service_name(db, service):
    first = add_entry(db, service, "Alice", user_id="alice")
    archive(db, first, "left", service.name)
    second = add_entry(db, service, "Alice", user_id="alice")
    archive(db, second, "removed", "Renamed Advising")
    assert finished_visits(db, "alice") == [second, first]
    assert [v.outcome for v in finished_visits(db, "alice")] == ["removed", "left"]
    assert second.service_name == "Renamed Advising"
    assert first.service_name == "Advising"
    assert second.ended_at >= second.joined_at


def test_cancel_all_finishes_waiting_and_serving_visits(db, service):
    serving = add_entry(db, service, "Served")
    start_serving(db, serving)
    waiting = add_entry(db, service, "Waiting")
    cancel_all(db, service)
    assert queue_state(db, service).waiting == [] and queue_state(db, service).serving is None
    assert {serving.status, waiting.status} == {"cancelled"}
    assert db.get(QueueEntry, waiting.id).ended_at is not None
