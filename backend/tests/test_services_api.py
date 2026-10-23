"""Service endpoints: state changes, conflicts, and client-facing errors."""

import pytest


BODY = {"name": "IT Help", "description": "Technical support", "durationMinutes": 15}


def test_create_list_get_and_update_service(client):
    assert client.get("/services").json() == []
    response = client.post("/services", json=BODY)
    assert response.status_code == 201
    created = response.json()
    assert created == {**BODY, "id": "it-help", "priority": "medium",
                       "isOpen": False, "ticketPrefix": "I"}
    assert client.get("/services").json() == [created]
    assert client.get("/services/it-help").json() == created
    changes = {"name": "IT Support", "description": "Updated description",
               "durationMinutes": 20, "priority": "high", "isOpen": True}
    updated = client.patch("/services/it-help", json=changes)
    assert updated.status_code == 200
    assert updated.json() == {**created, **changes}
    assert client.get("/services/it-help").json() == updated.json()


def test_duplicate_names_are_case_insensitive_on_create_and_update(client, service):
    response = client.post("/services", json={**BODY, "name": " advising "})
    assert response.status_code == 409
    client.post("/services", json=BODY)
    assert client.patch("/services/it-help", json={"name": "ADVISING"}).status_code == 409
    assert client.patch("/services/advising", json={"name": "Advising"}).status_code == 200
    assert client.get("/services/it-help").json()["name"] == BODY["name"]


def test_distinct_names_with_same_slug_get_unique_ids(client):
    ids = [client.post("/services", json={**BODY, "name": name}).json()["id"]
           for name in ["IT Help", "IT-Help", "IT.Help"]]
    assert ids == ["it-help", "it-help-2", "it-help-3"]
    special = client.post("/services", json={**BODY, "name": "!!!"}).json()
    assert special["id"] == "service"
    assert special["ticketPrefix"] == "Q"


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_unknown_service_returns_404(client, method):
    kwargs = {"json": {"isOpen": True}} if method == "patch" else {}
    response = getattr(client, method)("/services/missing", **kwargs)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


@pytest.mark.parametrize("body,field,message", [
    ({}, "name", "This field is required."),
    ({**BODY, "name": 1}, "name", "Must be text."),
    ({**BODY, "name": " "}, "name", "This field is required."),
    ({**BODY, "name": "a" * 101}, "name", "Must be at most 100 characters."),
    ({**BODY, "durationMinutes": True}, "durationMinutes", "Must be a whole number."),
    ({**BODY, "durationMinutes": 0}, "durationMinutes", "Must be at least 1."),
    ({**BODY, "durationMinutes": 481}, "durationMinutes", "Must be at most 480."),
    ({**BODY, "priority": "urgent"}, "priority", "Must be one of: low, medium or high."),
    ({**BODY, "extra": 1}, "extra", "Unknown field."),
])
def test_invalid_create_returns_field_errors_without_mutation(client, body, field, message):
    response = client.post("/services", json=body)
    assert response.status_code == 422
    assert response.json()["detail"] == "Some fields are invalid."
    assert {"field": field, "message": message} in response.json()["errors"]
    assert client.get("/services").json() == []


def test_invalid_update_does_not_change_service(client, service):
    before = client.get("/services/advising").json()
    response = client.patch("/services/advising", json={"name": "Changed", "isOpen": "yes"})
    assert response.status_code == 422
    assert {"field": "isOpen", "message": "Must be true or false."} in response.json()["errors"]
    assert client.get("/services/advising").json() == before


def test_empty_update_explains_model_validation_error(client, service):
    response = client.patch("/services/advising", json={})
    assert response.status_code == 422
    assert response.json()["errors"] == [
        {"field": "", "message": "Provide at least one field to update."}
    ]


def test_invalid_json_and_non_object_bodies(client):
    response = client.post("/services", content="{bad", headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["errors"] == [
        {"field": "", "message": "The request body is not valid JSON."}
    ]
    response = client.post("/services", json=[])
    assert response.status_code == 422
    assert response.json()["errors"][0]["message"] == "The request body must be a JSON object."
    response = client.post("/services")
    assert response.status_code == 422
    assert response.json()["errors"][0]["message"] == "A request body is required."


def test_delete_cancels_waiting_and_serving_visits(client, service, store):
    for user in ["alice", "bob"]:
        assert client.post("/queues/advising/join", json={"name": user, "userId": user}, headers=client.headers_for(user)).status_code == 201
    client.post("/queues/advising/serve-next")
    assert client.delete("/services/advising").status_code == 204
    assert client.get("/services/advising").status_code == 404
    assert "advising" not in store.queues
    assert "advising" not in store.now_serving
    for user in ["alice", "bob"]:
        visits = client.get("/queues/history", params={"userId": user}, headers=client.headers_for(user)).json()
        assert len(visits) == 1
        assert visits[0]["outcome"] == "cancelled"
        assert visits[0]["serviceName"] == "Advising"
