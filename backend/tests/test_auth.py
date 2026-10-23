"""Authentication module: registration, login, role checks, and input validation."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers.auth import DEMO_VERIFICATION_CODE
from app.security import hash_password, verify_password
from app.store import Store, get_store, utc_now

NEW_USER = {
    "displayName": "Sam Lee",
    "username": "SamLee",
    "password": "secret123",
    "email": "Sam@Example.com",
    "channel": "email",
}


@pytest.fixture
def store():
    return Store()


@pytest.fixture
def client(store):
    app.dependency_overrides[get_store] = lambda: store
    yield TestClient(app)
    app.dependency_overrides.clear()


def login(client, username="user", password="password"):
    response = client.post("/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.json()
    return {"Authorization": f"Bearer {response.json()['token']}"}


def register_and_verify(client, **changes):
    challenge = client.post("/auth/register", json={**NEW_USER, **changes})
    assert challenge.status_code == 201, challenge.json()
    return client.post("/auth/verify", json={
        "verificationId": challenge.json()["verificationId"], "code": DEMO_VERIFICATION_CODE,
    })


# ---- passwords ---------------------------------------------------------------------------


def test_passwords_are_hashed_and_salted(store):
    first, second = hash_password("secret123"), hash_password("secret123")
    assert "secret123" not in first and first != second
    assert verify_password("secret123", first)
    assert not verify_password("secret124", first)
    assert not verify_password("secret123", "garbage")
    assert all(u.password_hash.startswith("pbkdf2_sha256$") for u in store.users.values())


# ---- login -------------------------------------------------------------------------------


def test_login_returns_token_and_account(client):
    response = client.post("/auth/login", json={"username": " Admin ", "password": "password"})
    assert response.status_code == 200
    body = response.json()
    assert body["token"] and body["expiresAt"]
    assert body["account"]["role"] == "admin"
    assert "password" not in str(body["account"]).lower()


@pytest.mark.parametrize("username, password", [("user", "wrong"), ("nobody", "password")])
def test_login_failures_share_one_message(client, username, password):
    response = client.post("/auth/login", json={"username": username, "password": password})
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect username or password."


def test_login_requires_both_fields(client):
    response = client.post("/auth/login", json={"username": "  ", "password": ""})
    assert response.status_code == 422
    assert {e["field"] for e in response.json()["errors"]} == {"username", "password"}


def test_me_and_logout(client):
    headers = login(client)
    assert client.get("/auth/me", headers=headers).json()["username"] == "user"
    assert client.post("/auth/logout", headers=headers).status_code == 204
    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"] == "Your session has expired. Sign in again."


def test_me_without_token(client):
    response = client.get("/auth/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_expired_session_is_rejected(client, store):
    headers = login(client)
    for session in store.sessions.values():
        session.expires_at = utc_now() - timedelta(seconds=1)
    assert client.get("/auth/me", headers=headers).status_code == 401
    assert not store.sessions


# ---- registration ------------------------------------------------------------------------


def test_register_verify_then_login(client):
    challenge = client.post("/auth/register", json=NEW_USER).json()
    assert challenge["destination"] == "s•••@example.com"
    assert challenge["channels"] == ["email"]

    # Pending accounts can't sign in yet.
    assert client.post("/auth/login", json={"username": "samlee", "password": "secret123"}).status_code == 401

    session = client.post("/auth/verify", json={
        "verificationId": challenge["verificationId"], "code": DEMO_VERIFICATION_CODE,
    })
    assert session.status_code == 200
    account = session.json()["account"]
    assert account["username"] == "samlee"
    assert account["email"] == "sam@example.com"
    assert account["role"] == "client"
    login(client, "SAMLEE", "secret123")


def test_register_cannot_choose_role(client):
    response = client.post("/auth/register", json={**NEW_USER, "role": "admin"})
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": "role", "message": "Unknown field."}]


@pytest.mark.parametrize("changes, field, message", [
    ({"displayName": "   "}, "displayName", "This field is required."),
    ({"displayName": "x" * 61}, "displayName", "Must be at most 60 characters."),
    ({"username": "ab"}, "username", "Use 3 to 32 characters."),
    ({"username": "sam lee"}, "username", "Use letters, numbers, dots, dashes or underscores."),
    ({"password": "short1"}, "password", "Use at least 8 characters."),
    ({"password": "lettersonly"}, "password", "Include at least one letter and one number."),
    ({"email": "not-an-email"}, "email", "Enter a valid email address."),
    ({"phone": "12345"}, "phone", "Enter a valid phone number, including area code."),
    ({"channel": "sms"}, "", "Enter a phone number to receive a text."),
    ({"channel": "pigeon"}, "channel", "Must be one of: email or sms."),
    ({"username": 123}, "username", "Must be text."),
])
def test_register_validation(client, changes, field, message):
    response = client.post("/auth/register", json={**NEW_USER, **changes})
    assert response.status_code == 422
    assert {"field": field, "message": message} in response.json()["errors"]


def test_register_requires_fields(client):
    response = client.post("/auth/register", json={})
    assert response.status_code == 422
    fields = {e["field"] for e in response.json()["errors"]}
    assert fields == {"displayName", "username", "password", "email"}


def test_register_sms_with_phone(client):
    challenge = client.post("/auth/register", json={**NEW_USER, "phone": "(555) 012-3456", "channel": "sms"})
    assert challenge.status_code == 201
    assert challenge.json()["destination"] == "•••• 3456"
    assert challenge.json()["channels"] == ["email", "sms"]


@pytest.mark.parametrize("changes, message", [
    ({"username": "USER", "email": "other@example.com"}, "That username is already taken."),
    ({"username": "someone"}, "An account with that email already exists. Try signing in."),
])
def test_register_duplicates(client, changes, message):
    register_and_verify(client)
    response = client.post("/auth/register", json={**NEW_USER, **changes})
    assert response.status_code == 409
    assert response.json()["detail"] == message


def test_pending_registration_holds_username(client):
    assert client.post("/auth/register", json=NEW_USER).status_code == 201
    response = client.post("/auth/register", json={**NEW_USER, "email": "other@example.com"})
    assert response.status_code == 409


def test_wrong_code_counts_attempts(client):
    challenge = client.post("/auth/register", json=NEW_USER).json()
    body = {"verificationId": challenge["verificationId"], "code": "000000"}
    messages = [client.post("/auth/verify", json=body).json()["detail"] for _ in range(5)]
    assert messages[0] == "That code is incorrect. 4 attempts left."
    assert messages[3] == "That code is incorrect. 1 attempt left."
    assert messages[4] == "Too many incorrect attempts. Send a new code."
    # Even the right code is refused until a new one is sent.
    right = client.post("/auth/verify", json={**body, "code": DEMO_VERIFICATION_CODE})
    assert right.status_code == 429


def test_verify_rejects_malformed_code(client):
    challenge = client.post("/auth/register", json=NEW_USER).json()
    response = client.post("/auth/verify", json={"verificationId": challenge["verificationId"], "code": "12ab"})
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": "code", "message": "Enter the 6-digit code."}]


def test_verify_unknown_and_expired(client, store):
    assert client.post("/auth/verify", json={"verificationId": "ver-x", "code": "123456"}).status_code == 404
    challenge = client.post("/auth/register", json=NEW_USER).json()
    store.pending_registrations[challenge["verificationId"]].expires_at = utc_now() - timedelta(seconds=1)
    response = client.post("/auth/verify", json={"verificationId": challenge["verificationId"], "code": "123456"})
    assert response.status_code == 410


def test_resend_cooldown_and_channel(client, store):
    challenge = client.post("/auth/register", json={**NEW_USER, "phone": "5550123456"}).json()
    vid = challenge["verificationId"]
    assert client.post("/auth/verify/resend", json={"verificationId": vid}).status_code == 429

    store.pending_registrations[vid].resend_available_at = utc_now()
    resent = client.post("/auth/verify/resend", json={"verificationId": vid, "channel": "sms"})
    assert resent.status_code == 200
    assert resent.json()["channel"] == "sms"


def test_resend_sms_without_phone(client, store):
    vid = client.post("/auth/register", json=NEW_USER).json()["verificationId"]
    store.pending_registrations[vid].resend_available_at = utc_now()
    response = client.post("/auth/verify/resend", json={"verificationId": vid, "channel": "sms"})
    assert response.status_code == 409


# ---- roles -------------------------------------------------------------------------------

NEW_SERVICE = {"name": "Mailroom", "description": "Package pickup.", "durationMinutes": 5}


@pytest.mark.parametrize("method, path, body", [
    ("POST", "/services", NEW_SERVICE),
    ("PATCH", "/services/advising", {"isOpen": False}),
    ("DELETE", "/services/advising", None),
    ("POST", "/queues/advising/serve-next", None),
    ("POST", "/queues/advising/complete", None),
    ("DELETE", "/queues/advising/entries/entry-101", None),
    ("POST", "/queues/advising/entries/entry-101/move", {"direction": "down"}),
])
def test_admin_routes(client, method, path, body):
    assert client.request(method, path, json=body).status_code == 401
    forbidden = client.request(method, path, json=body, headers=login(client))
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"] == "Administrator access required."
    allowed = client.request(method, path, json=body, headers=login(client, "admin"))
    assert allowed.status_code < 400 or allowed.status_code in (404, 409), allowed.json()


def test_admin_creates_service(client):
    response = client.post("/services", json=NEW_SERVICE, headers=login(client, "admin"))
    assert response.status_code == 201


def test_public_reads_need_no_session(client):
    assert client.get("/services").status_code == 200
    assert client.get("/queues").status_code == 200
    assert client.get("/queues/advising").status_code == 200


def test_user_acts_only_as_themself(client):
    user = login(client)
    join = {"name": "Jordan Reyes", "userId": "usr-client"}
    assert client.post("/queues/advising/join", json=join).status_code == 401
    assert client.post("/queues/advising/join", json={**join, "userId": "usr-admin"}, headers=user).status_code == 403
    assert client.post("/queues/advising/join", json=join, headers=user).status_code == 201

    assert client.get("/queues/history?userId=usr-client", headers=user).status_code == 200
    assert client.get("/queues/history?userId=usr-admin", headers=user).status_code == 403
    assert client.get("/notifications?userId=usr-client", headers=user).status_code == 200
    assert client.get("/notifications?userId=usr-client").status_code == 401
    assert client.delete("/notifications?userId=usr-admin", headers=user).status_code == 403

    leave = {"userId": "usr-client"}
    assert client.post("/queues/advising/leave", json=leave).status_code == 401
    assert client.post("/queues/advising/leave", json=leave, headers=user).status_code == 200


def test_mark_read_only_own_notifications(client):
    user = login(client)
    client.post("/queues/advising/join", json={"name": "Jordan", "userId": "usr-client"}, headers=user)
    notification = client.get("/notifications?userId=usr-client", headers=user).json()[0]
    path = f"/notifications/{notification['id']}/read"
    assert client.post(path, headers=login(client, "admin")).status_code == 404
    assert client.post(path, headers=user).json()["read"] is True


def test_guests_join_and_leave_without_session(client):
    entry = client.post("/queues/advising/join", json={"name": "Walk In"})
    assert entry.status_code == 201
    left = client.post("/queues/advising/leave", json={"entryId": entry.json()["id"]})
    assert left.status_code == 200
