"""Connection to the Supabase Postgres database.

The connection string comes from DATABASE_URL in backend/.env (see .env.example). Each request
gets its own SQLAlchemy session through the get_db dependency, closed when the request ends.
"""

import os
from collections.abc import Iterator

from dotenv import load_dotenv
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

load_dotenv()


class Base(DeclarativeBase):
    """Base class for the table models in app.models."""


class DatabaseNotConfigured(RuntimeError):
    """Raised when DATABASE_URL is missing, so the API can say exactly what to fix."""


def database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise DatabaseNotConfigured(
            "The database is not configured. Copy backend/.env.example to backend/.env "
            "and set DATABASE_URL to your Supabase connection string."
        )
    # Supabase hands out postgresql:// (or postgres://) URLs; use the psycopg 3 driver for them.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    """Created on first use, so importing the app (for example in tests) needs no database."""
    global _engine, _session_factory
    if _engine is None:
        _engine = create_engine(
            database_url(),
            # Drop connections Supabase closed while idle instead of failing the next request.
            pool_pre_ping=True,
            # Supabase's transaction pooler doesn't support prepared statements.
            connect_args={"prepare_threshold": None},
        )
        _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request. Tests override it with a test database."""
    get_engine()
    session = _session_factory()
    try:
        yield session
    finally:
        session.close()
