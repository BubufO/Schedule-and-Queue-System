"""Every test gets its own empty store and its own in-memory database; Supabase is never used."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Service
from app.store import SEED_SERVICES, SessionRecord, Store, UserRecord, get_store, utc_now


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
def db():
    """A fresh SQLite database with the same tables and constraints as Supabase."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    engine.dispose()


@pytest.fixture
def seeded_db(db):
    """The test database with the same 16 services that were inserted into Supabase."""
    db.add_all(
        Service(id=id_, name=name, description=description, duration_minutes=duration,
                priority=priority, is_open=is_open, ticket_prefix=prefix)
        for id_, name, description, duration, priority, is_open, prefix in SEED_SERVICES
    )
    db.commit()
    return db


@pytest.fixture
def service(store, db):
    record = Service(id="advising", name="Advising", description="Course advice", duration_minutes=10,
                     priority="medium", is_open=True, ticket_prefix="A")
    db.add(record)
    db.commit()
    store.queues[record.id] = []
    return record


@pytest.fixture
def client(store, db):
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_db] = lambda: db
    try:
        with ScenarioClient(store) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
