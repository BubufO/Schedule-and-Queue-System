"""Password hashing, session tokens, and the auth checks routes depend on.

This is the "auth check" half of the API gateway: a route that needs a signed-in caller
depends on require_user, and one for staff only depends on require_admin. Either rejects the
request before any route code runs.

Passwords are hashed with PBKDF2-SHA256 from the standard library, salted per account, and
compared in constant time. Plain-text passwords are never stored.

Callers send the token from /auth/login or /auth/verify as `Authorization: Bearer <token>`.
"""

import base64
import hashlib
import hmac
import secrets
from datetime import timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.store import SessionRecord, Store, UserRecord, get_store, utc_now

HASH_ALGORITHM = "pbkdf2_sha256"
HASH_ITERATIONS = 310_000  # OWASP's recommendation for PBKDF2-SHA256
SESSION_LIFETIME = timedelta(hours=12)


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def hash_password(password: str, *, salt: bytes | None = None, iterations: int = HASH_ITERATIONS) -> str:
    """Returns "pbkdf2_sha256$<iterations>$<salt>$<hash>", safe to store."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"{HASH_ALGORITHM}${iterations}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, expected = stored.split("$")
        if algorithm != HASH_ALGORITHM:
            return False
        actual = hash_password(password, salt=base64.b64decode(salt), iterations=int(iterations))
    except ValueError:
        return False
    return hmac.compare_digest(actual.rsplit("$", 1)[1], expected)


# Checked against when a username doesn't exist, so a wrong username takes as long to reject
# as a wrong password and response times don't reveal which accounts exist.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def authenticate(store: Store, username: str, password: str) -> UserRecord | None:
    user = store.find_user_by_username(username)
    if user is None:
        verify_password(password, _DUMMY_HASH)
        return None
    return user if verify_password(password, user.password_hash) else None


def issue_session(store: Store, user: UserRecord) -> SessionRecord:
    session = SessionRecord(
        token=secrets.token_urlsafe(32),
        user_id=user.id,
        expires_at=utc_now() + SESSION_LIFETIME,
    )
    store.sessions[session.token] = session
    return session


# ---- dependencies ---------------------------------------------------------------------

# auto_error=False so a missing header reaches our own 401 message instead of FastAPI's 403.
_bearer = HTTPBearer(auto_error=False, description="Token from /auth/login or /auth/verify.")


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, message, headers={"WWW-Authenticate": "Bearer"})


def current_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    store: Store = Depends(get_store),
) -> SessionRecord | None:
    """The caller's session, or None when no valid token was sent."""
    if credentials is None:
        return None
    with store.lock:
        session = store.sessions.get(credentials.credentials)
        if session is None:
            return None
        if session.expires_at <= utc_now() or session.user_id not in store.users:
            del store.sessions[session.token]
            return None
        return session


def current_user(
    session: SessionRecord | None = Depends(current_session),
    store: Store = Depends(get_store),
) -> UserRecord | None:
    """The signed-in user, or None for guests. For routes that also serve guests."""
    return store.users.get(session.user_id) if session else None


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    user: UserRecord | None = Depends(current_user),
) -> UserRecord:
    if user is None:
        raise _unauthorized("Sign in to continue." if credentials is None else "Your session has expired. Sign in again.")
    return user


def require_admin(user: UserRecord = Depends(require_user)) -> UserRecord:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access required.")
    return user


def ensure_self(user: UserRecord | None, user_id: str) -> None:
    """Stops one account from acting as, or reading the data of, another."""
    if user is None:
        raise _unauthorized("Sign in to continue.")
    if user.id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only access your own account.")
