"""A3 wait estimates: people ahead plus an active visit, times expected duration."""

import pytest

from app.queueing import add_entry, join_wait_minutes, wait_minutes
from app.store import ServiceRecord, ServingRecord, utc_now


@pytest.mark.parametrize("duration,ahead,active,expected", [
    (1, 0, False, 0), (1, 1, False, 1), (480, 2, False, 960),
    (15, 0, True, 15), (15, 3, True, 60), (10, 100, False, 1000),
])
def test_wait_formula_at_valid_duration_boundaries(store, service, duration, ahead, active, expected):
    service.duration_minutes = duration
    if active:
        entry = add_entry(store, service, "Being served")
        store.queues[service.id].remove(entry)
        store.now_serving[service.id] = ServingRecord(entry, utc_now())
    assert wait_minutes(store, service, ahead) == expected


def test_another_services_active_visit_does_not_increase_wait(store, service):
    other = ServiceRecord("other", "Other", "Other service", 60, "medium", True, "O")
    store.services[other.id] = other
    entry = add_entry(store, other, "Other visitor")
    store.now_serving[other.id] = ServingRecord(entry, utc_now())
    assert wait_minutes(store, service, 2) == 20


@pytest.mark.parametrize("priority,expected", [("high", 10), ("medium", 30), ("low", 40)])
def test_new_arrival_estimate_uses_priority_position(store, service, priority, expected):
    for existing in ["high", "medium", "medium", "low"]:
        add_entry(store, service, existing, priority=existing)
    assert join_wait_minutes(store, service, priority) == expected


def test_empty_service_without_queue_has_zero_join_wait(store, service):
    del store.queues[service.id]
    assert join_wait_minutes(store, service) == 0


def join(client, name, **fields):
    response = client.post("/queues/advising/join", json={"name": name, **fields})
    assert response.status_code == 201
    return response.json()


def snapshot(client):
    response = client.get("/queues/advising")
    assert response.status_code == 200
    return response.json()


def test_queue_preview_matches_default_join_even_with_low_priority_waiters(client, service):
    join(client, "High", priority="high")
    join(client, "Low", priority="low")
    preview = snapshot(client)["estimatedWaitMinutes"]
    arrival = join(client, "Medium")
    assert preview == arrival["estimatedWaitMinutes"] == 10
    assert arrival["position"] == 2
    assert [e["estimatedWaitMinutes"] for e in snapshot(client)["waiting"]] == [0, 10, 20]


def test_waits_recompute_after_leave_serve_complete_and_duration_change(client, service):
    first = join(client, "First")
    join(client, "Second")
    join(client, "Third")
    assert snapshot(client)["estimatedWaitMinutes"] == 30
    assert client.post("/queues/advising/leave", json={"entryId": first["id"]}).status_code == 200
    assert [e["estimatedWaitMinutes"] for e in snapshot(client)["waiting"]] == [0, 10]
    assert snapshot(client)["estimatedWaitMinutes"] == 20
    assert client.post("/queues/advising/serve-next").status_code == 200
    assert snapshot(client)["waiting"][0]["estimatedWaitMinutes"] == 10
    assert snapshot(client)["estimatedWaitMinutes"] == 20
    assert client.patch("/services/advising", json={"durationMinutes": 25}).status_code == 200
    assert snapshot(client)["waiting"][0]["estimatedWaitMinutes"] == 25
    assert snapshot(client)["estimatedWaitMinutes"] == 50
    assert client.post("/queues/advising/complete").status_code == 200
    assert snapshot(client)["waiting"][0]["estimatedWaitMinutes"] == 0
    assert snapshot(client)["estimatedWaitMinutes"] == 25
    assert client.post("/queues/advising/serve-next").status_code == 200
    assert snapshot(client)["waiting"] == []
    assert snapshot(client)["estimatedWaitMinutes"] == 25
    assert client.post("/queues/advising/complete").status_code == 200
    assert snapshot(client)["estimatedWaitMinutes"] == 0


def test_manual_reorder_and_removal_update_each_visitors_wait(client, service):
    first = join(client, "First")
    second = join(client, "Second")
    third = join(client, "Third")
    response = client.post(f"/queues/advising/entries/{third['id']}/move", json={"direction": "up"})
    assert response.status_code == 200
    assert [(e["id"], e["estimatedWaitMinutes"]) for e in response.json()["waiting"]] == [
        (first["id"], 0), (third["id"], 10), (second["id"], 20)
    ]
    assert client.delete(f"/queues/advising/entries/{first['id']}").status_code == 204
    assert [(e["id"], e["estimatedWaitMinutes"]) for e in snapshot(client)["waiting"]] == [
        (third["id"], 0), (second["id"], 10)
    ]
