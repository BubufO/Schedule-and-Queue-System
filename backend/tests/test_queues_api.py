"""Queue API workflows use fresh stores and assert observable behavior."""

import pytest


def join(client, name="Alice", **fields):
    response = client.post("/queues/advising/join", json={"name": name, **fields})
    assert response.status_code == 201
    return response.json()


def test_join_order_positions_waits_and_list(client, service):
    alice = join(client, userId="alice")
    bob = join(client, "Bob")
    urgent = join(client, "Urgent", priority="high")
    assert alice["position"] == 1
    assert alice["estimatedWaitMinutes"] == 0
    assert bob["position"] == 2
    assert bob["estimatedWaitMinutes"] == 10
    queue = client.get("/queues/advising").json()
    assert [e["id"] for e in queue["waiting"]] == [urgent["id"], alice["id"], bob["id"]]
    assert [e["position"] for e in queue["waiting"]] == [1, 2, 3]
    assert [e["estimatedWaitMinutes"] for e in queue["waiting"]] == [0, 10, 20]
    assert queue["estimatedWaitMinutes"] == 30
    assert queue["nowServing"] is None
    assert client.get("/queues").json() == [queue]


def test_closed_service_rejects_join_without_mutation(client, service, store):
    service.is_open = False
    assert client.post("/queues/advising/join", json={"name": "Alice"}).status_code == 409
    assert store.queues[service.id] == []


@pytest.mark.parametrize("being_served", [False, True])
def test_user_cannot_hold_two_visits_even_at_another_service(client, service, being_served):
    join(client, userId="alice")
    if being_served:
        client.post("/queues/advising/serve-next")
    created = client.post("/services", json={"name": "Other", "description": "Other", "durationMinutes": 5}).json()
    client.patch(f"/services/{created['id']}", json={"isOpen": True})
    for service_id in ["advising", created["id"]]:
        response = client.post(f"/queues/{service_id}/join", json={"name": "Alice", "userId": "alice"})
        assert response.status_code == 409


@pytest.mark.parametrize("guest", [False, True])
def test_leave_removes_entry_updates_wait_and_records_history(client, service, guest):
    entry = join(client, **({} if guest else {"userId": "alice"}))
    join(client, "Bob")
    identifier = {"entryId": entry["id"]} if guest else {"userId": "alice"}
    response = client.post("/queues/advising/leave", json=identifier)
    assert response.status_code == 200
    assert response.json()["id"] == entry["id"]
    assert response.json()["outcome"] == "left"
    waiting = client.get("/queues/advising").json()["waiting"]
    assert len(waiting) == 1
    assert waiting[0]["name"] == "Bob"
    assert waiting[0]["estimatedWaitMinutes"] == 0
    assert client.post("/queues/advising/leave", json=identifier).status_code == 404
    if not guest:
        join(client, userId="alice")  # A finished visit must not prevent rejoining.


@pytest.mark.parametrize("guest", [False, True])
def test_serving_visitor_cannot_leave(client, service, guest):
    entry = join(client, **({} if guest else {"userId": "alice"}))
    client.post("/queues/advising/serve-next")
    identifier = {"entryId": entry["id"]} if guest else {"userId": "alice"}
    assert client.post("/queues/advising/leave", json=identifier).status_code == 409
    assert client.get("/queues/advising").json()["nowServing"]["entry"]["id"] == entry["id"]


def test_serve_next_and_complete_archive_history_newest_first(client, service):
    alice = join(client, userId="alice")
    bob = join(client, "Bob", userId="bob")
    serving = client.post("/queues/advising/serve-next")
    assert serving.status_code == 200
    assert serving.json()["entry"]["id"] == alice["id"]
    queue = client.get("/queues/advising").json()
    assert queue["waiting"][0]["estimatedWaitMinutes"] == 10
    assert queue["estimatedWaitMinutes"] == 20
    assert client.post("/queues/advising/serve-next").json()["entry"]["id"] == bob["id"]
    completed = client.post("/queues/advising/complete")
    assert completed.status_code == 200
    assert completed.json()["outcome"] == "served"
    assert client.get("/queues/advising").json()["nowServing"] is None
    history = client.get("/queues/history", params={"userId": "alice"}).json()
    assert [v["id"] for v in history] == [alice["id"]]
    join(client, userId="alice")
    client.post("/queues/advising/leave", json={"userId": "alice"})
    assert [v["outcome"] for v in client.get("/queues/history", params={"userId": "alice"}).json()] == ["left", "served"]
    assert client.get("/queues/history", params={"userId": "unknown"}).json() == []


def test_empty_serve_next_does_not_discard_current_visit(client, service):
    assert client.post("/queues/advising/serve-next").status_code == 409
    assert client.post("/queues/advising/complete").status_code == 409
    alice = join(client)
    client.post("/queues/advising/serve-next")
    assert client.post("/queues/advising/serve-next").status_code == 409
    assert client.get("/queues/advising").json()["nowServing"]["entry"]["id"] == alice["id"]


def test_remove_waiting_entry_records_removed_history(client, service):
    entry = join(client, userId="alice")
    path = f"/queues/advising/entries/{entry['id']}"
    response = client.delete(path)
    assert response.status_code == 204
    assert response.content == b""
    assert client.get("/queues/advising").json()["waiting"] == []
    assert client.get("/queues/history", params={"userId": "alice"}).json()[0]["outcome"] == "removed"
    assert client.delete(path).status_code == 404


def test_move_entry_up_down_and_reject_boundaries(client, service):
    alice = join(client)
    bob = join(client, "Bob")
    path = f"/queues/advising/entries/{bob['id']}/move"
    response = client.post(path, json={"direction": "up"})
    assert response.status_code == 200
    assert [e["id"] for e in response.json()["waiting"]] == [bob["id"], alice["id"]]
    assert client.post(path, json={"direction": "up"}).status_code == 409
    response = client.post(path, json={"direction": "down"})
    assert response.status_code == 200
    assert [e["id"] for e in response.json()["waiting"]] == [alice["id"], bob["id"]]
    assert client.post(path, json={"direction": "down"}).status_code == 409
    assert client.post(path, json={"direction": "sideways"}).status_code == 422
    assert client.post("/queues/advising/entries/missing/move", json={"direction": "up"}).status_code == 404


@pytest.mark.parametrize("method,suffix,body", [
    ("get", "", None), ("post", "/join", {"name": "Alice"}),
    ("post", "/leave", {"userId": "alice"}), ("post", "/serve-next", None),
    ("post", "/complete", None), ("delete", "/entries/missing", None),
    ("post", "/entries/missing/move", {"direction": "up"}),
])
def test_unknown_queue_returns_404(client, method, suffix, body):
    kwargs = {"json": body} if body is not None else {}
    assert getattr(client, method)(f"/queues/missing{suffix}", **kwargs).status_code == 404


@pytest.mark.parametrize("query", [{}, {"userId": ""}, {"userId": "u" * 65}])
def test_history_requires_valid_user_id(client, query):
    assert client.get("/queues/history", params=query).status_code == 422


def test_invalid_join_and_leave_do_not_mutate_queue(client, service):
    assert client.post("/queues/advising/join", json={"name": " "}).status_code == 422
    entry = join(client, userId="alice")
    assert client.post("/queues/advising/leave", json={"userId": "alice", "entryId": entry["id"]}).status_code == 422
    assert [e["id"] for e in client.get("/queues/advising").json()["waiting"]] == [entry["id"]]


def test_health_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "QueueSmart" in response.json()["message"]
