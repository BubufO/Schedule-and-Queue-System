"""Participation history: outcomes, user filtering, and completed visits only."""

import pytest


def history(client, user="alice"):
    response = client.get("/queues/history", params={"userId": user}, headers=client.headers_for(user))
    assert response.status_code == 200
    return response.json()


@pytest.mark.parametrize("action,outcome", [
    ("leave", "left"), ("remove", "removed"), ("complete", "served"),
    ("serve-next", "served"), ("delete", "cancelled"),
])
def test_finished_visits_preserve_details_and_filter_users(client, service, action, outcome):
    assert history(client) == []
    entry = client.post("/queues/advising/join", json={"name": "Alice", "userId": "alice"}, headers=client.headers_for("alice")).json()
    assert history(client) == []
    if action == "leave":
        response = client.post("/queues/advising/leave", json={"userId": "alice"}, headers=client.headers_for("alice"))
    elif action == "remove":
        response = client.delete(f"/queues/advising/entries/{entry['id']}")
    elif action == "delete":
        response = client.delete("/services/advising")
    else:
        assert client.post("/queues/advising/serve-next").status_code == 200
        assert history(client) == []  # Being served is still an active visit.
        if action == "serve-next":
            client.post("/queues/advising/join", json={"name": "Bob", "userId": "bob"}, headers=client.headers_for("bob"))
        response = client.post(f"/queues/advising/{action}")
    assert response.status_code in (200, 204)
    visits = history(client)
    assert len(visits) == 1
    visit = visits[0]
    for field in ["id", "serviceId", "name", "ticket", "joinedAt", "priority", "userId"]:
        assert visit[field] == entry[field]
    assert visit["serviceName"] == "Advising"
    assert visit["outcome"] == outcome
    assert visit["endedAt"] >= visit["joinedAt"]
    assert history(client, "bob") == []
    assert history(client, "unknown") == []


def test_history_newest_first_across_services_without_duplicates(client, service):
    first = client.post("/queues/advising/join", json={"name": "Alice", "userId": "alice"}, headers=client.headers_for("alice")).json()
    client.post("/queues/advising/leave", json={"userId": "alice"}, headers=client.headers_for("alice"))
    other = client.post("/services", json={"name": "Other", "description": "Other service", "durationMinutes": 5}).json()
    client.patch(f"/services/{other['id']}", json={"isOpen": True})
    second = client.post(f"/queues/{other['id']}/join", json={"name": "Alice", "userId": "alice"}, headers=client.headers_for("alice")).json()
    client.post(f"/queues/{other['id']}/serve-next")
    client.post(f"/queues/{other['id']}/complete")
    assert client.post(f"/queues/{other['id']}/complete").status_code == 409
    visits = history(client)
    assert [v["id"] for v in visits] == [second["id"], first["id"]]
    assert [v["serviceName"] for v in visits] == ["Other", "Advising"]
    assert [v["outcome"] for v in visits] == ["served", "left"]
