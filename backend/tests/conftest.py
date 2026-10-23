"""Every test gets its own empty store; no server or database is needed."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store import ServiceRecord, Store, get_store


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
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
