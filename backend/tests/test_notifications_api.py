"""Notification inbox API and end-to-end queue notification triggers."""

import pytest


def join(client, name, **fields):
    headers = client.headers_for(fields["userId"]) if fields.get("userId") else {}
    response = client.post("/queues/advising/join", json={"name": name, **fields}, headers=headers)
    assert response.status_code == 201
    return response.json()


def inbox(client, user="alice", **params):
    response = client.get("/notifications", params={"userId": user, **params}, headers=client.headers_for(user))
    assert response.status_code == 200
    return response.json()


def test_join_inbox_serialization_read_filtering_and_clear_are_user_scoped(client, service):
    assert inbox(client) == []
    join(client, "Alice", userId="alice")
    join(client, "Bob", userId="bob")
    alice = inbox(client)
    bob = inbox(client, "bob")
    assert [n["type"] for n in alice] == ["approaching", "joined"]
    assert all(n["userId"] == "alice" and not n["read"] for n in alice)
    assert set(alice[0]) == {"id", "userId", "type", "title", "message", "timestamp",
                              "serviceId", "oldPosition", "newPosition", "read"}
    assert alice[0]["serviceId"] == service.id
    assert alice[0]["newPosition"] == 1
    assert "Estimated wait: 0 minutes." in alice[1]["message"]
    marked = client.post(f"/notifications/{alice[0]['id']}/read", headers=client.headers_for("alice"))
    assert marked.status_code == 200
    assert marked.json() == {**alice[0], "read": True}
    assert client.post(f"/notifications/{alice[0]['id']}/read", headers=client.headers_for("alice")).json() == marked.json()
    assert inbox(client, unreadOnly="true") == [alice[1]]
    assert len(inbox(client)) == 2
    assert inbox(client, "bob") == bob
    response = client.delete("/notifications", params={"userId": "alice"}, headers=client.headers_for("alice"))
    assert response.status_code == 204
    assert response.content == b""
    assert inbox(client) == []
    assert inbox(client, "bob") == bob
    assert client.delete("/notifications", params={"userId": "alice"}, headers=client.headers_for("alice")).status_code == 204
    assert client.post(f"/notifications/{alice[0]['id']}/read", headers=client.headers_for("alice")).status_code == 404


def test_serve_moves_third_visitor_close_and_sends_distinct_turn_alert(client, service):
    first = join(client, "Alice", userId="alice")
    join(client, "Bob", userId="bob")
    join(client, "Carol", userId="carol")
    assert [n["type"] for n in inbox(client, "carol")] == ["joined"]
    assert "Estimated wait: 20 minutes." in inbox(client, "carol")[0]["message"]
    assert client.post("/queues/advising/serve-next").status_code == 200
    assert [n["type"] for n in inbox(client)] == ["turn", "approaching", "joined"]
    carol = inbox(client, "carol")
    assert [n["type"] for n in carol] == ["approaching", "update", "joined"]
    assert (carol[1]["oldPosition"], carol[1]["newPosition"]) == (3, 2)
    assert client.get("/queues/advising").json()["nowServing"]["entry"]["id"] == first["id"]
    client.get("/queues/advising")
    client.get("/queues")
    assert inbox(client, "carol") == carol  # Reading a queue must not generate alerts.


@pytest.mark.parametrize("action,event", [("leave", "left"), ("remove", "removed"), ("serve", "turn")])
def test_departure_triggers_notifications_and_cleans_tracking(client, service, store, action, event):
    entry = join(client, "Alice", userId="alice")
    join(client, "Bob", userId="bob")
    if action == "leave":
        response = client.post("/queues/advising/leave", json={"userId": "alice"}, headers=client.headers_for("alice"))
    elif action == "remove":
        response = client.delete(f"/queues/advising/entries/{entry['id']}")
    else:
        response = client.post("/queues/advising/serve-next")
    assert response.status_code in (200, 204)
    assert inbox(client)[0]["type"] == event
    assert entry["id"] not in store.last_position
    assert entry["id"] not in store.approaching_notified
    assert inbox(client, "bob")[0]["type"] == "update"
    assert inbox(client, "bob")[0]["newPosition"] == 1


def test_manual_reorder_sends_position_updates(client, service):
    join(client, "Alice", userId="alice")
    bob = join(client, "Bob", userId="bob")
    assert client.post(f"/queues/advising/entries/{bob['id']}/move", json={"direction": "up"}).status_code == 200
    assert (inbox(client)[0]["oldPosition"], inbox(client)[0]["newPosition"]) == (1, 2)
    assert (inbox(client, "bob")[0]["oldPosition"], inbox(client, "bob")[0]["newPosition"]) == (2, 1)
    assert sum(n["type"] == "approaching" for n in inbox(client)) == 1


def test_rejected_requests_do_not_emit_notifications_and_rejoin_warns_again(client, service):
    join(client, "Alice", userId="alice")
    before = inbox(client)
    assert client.post("/queues/advising/join", json={"name": "Alice", "userId": "alice"}, headers=client.headers_for("alice")).status_code == 409
    assert client.post("/queues/advising/join", json={"name": " "}).status_code == 422
    assert client.post("/queues/advising/leave", json={"userId": "missing"}, headers=client.headers_for("missing")).status_code == 404
    assert inbox(client) == before
    client.post("/queues/advising/leave", json={"userId": "alice"}, headers=client.headers_for("alice"))
    join(client, "Alice", userId="alice")
    assert [n["type"] for n in inbox(client)] == ["approaching", "joined", "left", "approaching", "joined"]


def test_guest_served_removed_and_leaving_never_creates_personal_notifications(client, service, store):
    first = join(client, "Guest")
    client.post("/queues/advising/leave", json={"entryId": first["id"]})
    second = join(client, "Guest")
    client.delete(f"/queues/advising/entries/{second['id']}")
    join(client, "Guest")
    client.post("/queues/advising/serve-next")
    assert store.notifications == []


@pytest.mark.parametrize("method", ["get", "delete"])
@pytest.mark.parametrize("params", [{}, {"userId": ""}, {"userId": "u" * 65}])
def test_inbox_validates_user_identifier(client, method, params):
    response = getattr(client, method)("/notifications", params=params)
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "userId"


def test_unknown_notification_and_invalid_unread_filter(client):
    assert client.post("/notifications/missing/read").status_code == 404
    assert client.get("/notifications", params={"userId": "alice", "unreadOnly": "invalid"}, headers=client.headers_for("alice")).status_code == 422
