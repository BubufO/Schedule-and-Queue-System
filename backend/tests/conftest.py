"""Every test gets its own empty store; no server or database is needed."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import ServiceRecord, SessionRecord, Store, UserRecord, get_store, utc_now


class ScenarioClient(TestClient):
    """Business tests use real session checks with explicitly selected test actors.

    Default requests act as staff. Use headers_for(user_id) for personal operations.
    Accounts/sessions are fixture data; login and role tests remain in test_auth.py.
    """

    def __init__(self, store):
        self.store = store
        super().__init__(app)
        self.headers.update(self.headers_for("test-admin", role="admin"))

    def headers_for(self, user_id, *, role="client"):
        if user_id not in self.store.users:
            self.store.users[user_id] = UserRecord(user_id, user_id, "unused", user_id, role)
        token = f"test-session-{user_id}"
        self.store.sessions[token] = SessionRecord(token, user_id, utc_now() + timedelta(hours=1))
        return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def store():
    return Store(seed=False)


@pytest.fixture
def service(store):
    record = ServiceRecord("advising", "Advising", "Course advice", 10, "medium", True, "A")
    store.services[record.id] = record
    store.queues[record.id] = []
    return record


@pytest.fixture
def client(store):
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_store] = lambda: store
    try:
        with ScenarioClient(store) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
