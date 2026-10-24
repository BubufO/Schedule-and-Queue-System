"""Profile settings: the signed-in user views and edits their own account.

Covers display name, username, email, phone, password, and notification preferences
(email, SMS, in-app). 

Every route works on the caller's own account, taken from their session token, so no user id is ever sent and nobody can edit someone else's profile.

no real email/SMS required
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.schemas import PasswordChange, ProfileOut, ProfileUpdate
from app.security import current_session, hash_password, require_user, verify_password
from app.store import SessionRecord, Store, UserRecord, get_store

router = APIRouter(prefix="/profile", tags=["profile"])


def _profile_out(user: UserRecord) -> ProfileOut:
    return ProfileOut.model_validate(user)


@router.get("", response_model=ProfileOut)
def get_profile(user: UserRecord = Depends(require_user)):
    """The signed-in account, with its notification preferences."""
    return _profile_out(user)


@router.patch("", response_model=ProfileOut)
def update_profile(body: ProfileUpdate, user: UserRecord = Depends(require_user), store: Store = Depends(get_store)):
    changes = body.model_dump(exclude_unset=True)
    with store.lock:
        # Usernames and emails stay unique, including those held by pending registrations.
        others = [u for u in store.users.values() if u.id != user.id]
        others += [p.user for p in store.pending_registrations.values()]
        if "username" in changes and any(u.username == changes["username"] for u in others):
            raise HTTPException(status.HTTP_409_CONFLICT, "That username is already taken.")
        if "email" in changes and any(u.email == changes["email"] for u in others):
            raise HTTPException(status.HTTP_409_CONFLICT, "Another account already uses that email.")

        phone = changes.get("phone", user.phone)
        if changes.get("notify_sms", user.notify_sms) and not phone:
            raise HTTPException(status.HTTP_409_CONFLICT, "Add a phone number to get text notifications.")

        for field, value in changes.items():
            setattr(user, field, value)
        return _profile_out(user)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: PasswordChange,
    user: UserRecord = Depends(require_user),
    session: SessionRecord = Depends(current_session),
    store: Store = Depends(get_store),
):
    """Changes the password and signs out the account's other sessions. This one stays signed in."""
    # 400 rather than 401: the caller is signed in, they just typed the wrong current password.
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is incorrect.")
    # Hashing is slow on purpose, so do it before taking the lock.
    new_hash = hash_password(body.new_password)
    with store.lock:
        user.password_hash = new_hash
        for token, other in list(store.sessions.items()):
            if other.user_id == user.id and token != session.token:
                del store.sessions[token]
    return Response(status_code=status.HTTP_204_NO_CONTENT)
