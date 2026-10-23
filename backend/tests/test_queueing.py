"""Direct unit tests of queue ordering, wait estimates, and bookkeeping."""

from datetime import datetime, timezone

import pytest

from app.queueing import add_entry, archive, find_user_visit, wait_minutes
from app.store import ServingRecord, Store


def test_priority_order_preserves_arrival_order_within_priority(store, service):
    for name, priority in [("Low", "low"), ("First", "medium"), ("High", "high"),
                           ("Second", "medium"), ("High again", "high")]:
        add_entry(store, service, name, priority=priority)
    assert [e.name for e in store.queues[service.id]] == [
        "High", "High again", "First", "Second", "Low"
    ]


def test_entries_have_unique_tickets_and_preserve_visit_details(store, service):
    joined = datetime(2026, 1, 1, tzinfo=timezone.utc)
    first = add_entry(store, service, "Alice", user_id="alice", joined_at=joined)
    second = add_entry(store, service, "Bob")
    assert first.id != second.id
    assert first.ticket == "A101"
    assert second.ticket == "A102"
    assert first.joined_at == joined
    assert first.service_id == service.id
    assert first.user_id == "alice"


@pytest.mark.parametrize("ahead,serving,expected", [
    (0, False, 0), (3, False, 30), (0, True, 10), (3, True, 40)
])
def test_wait_estimate(store, service, ahead, serving, expected):
    if serving:
        entry = add_entry(store, service, "Alice")
        store.now_serving[service.id] = ServingRecord(entry, entry.joined_at)
    assert wait_minutes(store, service, ahead) == expected


def test_find_visit_waiting_serving_and_missing(store, service):
    assert find_user_visit(store, "alice") is None
    entry = add_entry(store, service, "Alice", user_id="alice")
    assert find_user_visit(store, "alice") == (service.id, entry, False)
    store.queues[service.id].remove(entry)
    store.now_serving[service.id] = ServingRecord(entry, entry.joined_at)
    assert find_user_visit(store, "alice") == (service.id, entry, True)
    assert find_user_visit(store, "unknown") is None


def test_archive_keeps_newest_first_and_handles_deleted_service(store, service):
    first = add_entry(store, service, "Alice")
    second = add_entry(store, service, "Bob")
    archive(store, first, "left")
    del store.services[service.id]
    archive(store, second, "removed")
    assert [v.entry for v in store.history] == [second, first]
    assert [v.outcome for v in store.history] == ["removed", "left"]
    assert store.history[0].service_name == "Deleted service"
    assert store.history[1].service_name == "Advising"
    assert store.history[0].ended_at >= second.joined_at


def test_seed_store_contains_ordered_queues_and_independent_state():
    store = Store()
    other = Store()
    assert store.services
    assert any(store.queues.values())
    rank = {"high": 0, "medium": 1, "low": 2}
    for queue in store.queues.values():
        assert queue == sorted(queue, key=lambda entry: (rank[entry.priority], entry.joined_at))
    store.services.clear()
    assert other.services
