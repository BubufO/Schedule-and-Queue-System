"""Authentication module: registration with a verification code, login, logout.

Registering creates a pending client account and sends a code. Nothing is signed in until
the code is confirmed at /auth/verify, which activates the account and returns a session.
A pending registration holds its username and email until it is verified or expires.

There is no email or SMS provider yet, so every code is DEMO_VERIFICATION_CODE and is logged
instead of sent, the same way notifications are.
"""

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.schemas import (
    AccountOut,
    LoginRequest,
    RegisterRequest,
    ResendVerificationRequest,
    SessionOut,
    VerificationChallengeOut,
    VerifyRequest,
)
from app.security import authenticate, current_session, hash_password, issue_session, require_user
from app.store import PendingRegistrationRecord, SessionRecord, Store, UserRecord, get_store, utc_now

logger = logging.getLogger("queuesmart.auth")

router = APIRouter(prefix="/auth", tags=["auth"])

# Shown on the frontend's verify screen. Replace with a random code once real email/SMS exists.
DEMO_VERIFICATION_CODE = "123456"
CODE_LIFETIME = timedelta(minutes=10)
RESEND_COOLDOWN = timedelta(seconds=30)
MAX_CODE_ATTEMPTS = 5


def _account_out(user: UserRecord) -> AccountOut:
    return AccountOut.model_validate(user)


def _session_out(store: Store, session: SessionRecord) -> SessionOut:
    return SessionOut(token=session.token, expires_at=session.expires_at,
                      account=_account_out(store.users[session.user_id]))


def _mask_email(email: str) -> str:
    local, domain = email.split("@", 1)
    return f"{local[0]}•••@{domain}"


def _mask_phone(phone: str) -> str:
    return f"•••• {phone[-4:]}"


def _channels(user: UserRecord) -> list[str]:
    return ["email", "sms"] if user.phone else ["email"]


def _send_code(pending: PendingRegistrationRecord) -> VerificationChallengeOut:
    """Stands in for the email/SMS provider: a fresh code goes out and the clock restarts."""
    now = utc_now()
    pending.code = DEMO_VERIFICATION_CODE
    pending.expires_at = now + CODE_LIFETIME
    pending.resend_available_at = now + RESEND_COOLDOWN
    pending.attempts_left = MAX_CODE_ATTEMPTS
    user = pending.user
    destination = _mask_phone(user.phone) if pending.channel == "sms" else _mask_email(user.email)
    logger.info("verification code for %s: %s", destination, pending.code)
    return VerificationChallengeOut(
        verification_id=pending.id,
        channel=pending.channel,
        destination=destination,
        expires_at=pending.expires_at,
        resend_available_at=pending.resend_available_at,
        channels=_channels(user),
    )


def _find_pending(store: Store, verification_id: str) -> PendingRegistrationRecord:
    pending = store.pending_registrations.get(verification_id)
    if pending is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This verification has ended. Register again to get a new code.")
    return pending


def _drop_expired_registrations(store: Store) -> None:
    now = utc_now()
    for id_, pending in list(store.pending_registrations.items()):
        if pending.expires_at < now:
            del store.pending_registrations[id_]


@router.post("/register", response_model=VerificationChallengeOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, store: Store = Depends(get_store)):
    # Hashing is slow on purpose, so do it before taking the lock.
    password_hash = hash_password(body.password)
    with store.lock:
        _drop_expired_registrations(store)
        taken = list(store.users.values()) + [p.user for p in store.pending_registrations.values()]
        if any(u.username == body.username for u in taken):
            raise HTTPException(status.HTTP_409_CONFLICT, "That username is already taken.")
        if any(u.email == body.email for u in taken):
            raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists. Try signing in.")

        number = store.next_sequence()
        pending = PendingRegistrationRecord(
            id=f"ver-{number}",
            user=UserRecord(
                id=f"usr-{number}",
                username=body.username,
                password_hash=password_hash,
                display_name=body.display_name,
                role="client",
                email=body.email,
                phone=body.phone,
            ),
            channel=body.channel,
            code="",
            expires_at=utc_now(),
            resend_available_at=utc_now(),
            attempts_left=0,
        )
        store.pending_registrations[pending.id] = pending
        return _send_code(pending)


@router.post("/verify", response_model=SessionOut)
def verify(body: VerifyRequest, store: Store = Depends(get_store)):
    """Confirms the code, activates the account, and signs it in."""
    with store.lock:
        pending = _find_pending(store, body.verification_id)
        if utc_now() > pending.expires_at:
            raise HTTPException(status.HTTP_410_GONE, "This code has expired. Send a new one.")
        if pending.attempts_left <= 0:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many incorrect attempts. Send a new code.")
        if body.code != pending.code:
            pending.attempts_left -= 1
            left = pending.attempts_left
            if left <= 0:
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many incorrect attempts. Send a new code.")
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"That code is incorrect. {left} {'attempt' if left == 1 else 'attempts'} left.",
            )
        del store.pending_registrations[pending.id]
        store.users[pending.user.id] = pending.user
        return _session_out(store, issue_session(store, pending.user))


@router.post("/verify/resend", response_model=VerificationChallengeOut)
def resend_verification(body: ResendVerificationRequest, store: Store = Depends(get_store)):
    """Sends a fresh code, optionally through a different channel than last time."""
    with store.lock:
        pending = _find_pending(store, body.verification_id)
        wait = (pending.resend_available_at - utc_now()).total_seconds()
        if wait > 0:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Wait {int(wait) + 1}s before sending another code.")
        if body.channel is not None:
            if body.channel not in _channels(pending.user):
                raise HTTPException(status.HTTP_409_CONFLICT, "No phone number on this account to text.")
            pending.channel = body.channel
        return _send_code(pending)


@router.post("/login", response_model=SessionOut)
def login(body: LoginRequest, store: Store = Depends(get_store)):
    user = authenticate(store, body.username, body.password)
    # One message for both failures, so the response never confirms a username exists.
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password.")
    with store.lock:
        return _session_out(store, issue_session(store, user))


@router.get("/me", response_model=AccountOut)
def me(user: UserRecord = Depends(require_user)):
    """The signed-in account."""
    return _account_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_user)])
def logout(session: SessionRecord = Depends(current_session), store: Store = Depends(get_store)):
    """Ends this session. Other sessions for the same account stay signed in."""
    with store.lock:
        store.sessions.pop(session.token, None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
