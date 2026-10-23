"""Notification Module: a user's inbox. Each user can only see and change their own."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.schemas import ID_MAX, NotificationOut
from app.security import current_user, ensure_self, require_user
from app.store import Store, UserRecord, get_store

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    user_id: str = Query(alias="userId", min_length=1, max_length=ID_MAX),
    unread_only: bool = Query(False, alias="unreadOnly"),
    user: UserRecord | None = Depends(current_user),
    store: Store = Depends(get_store),
):
    """A user's notifications, newest first."""
    ensure_self(user, user_id)
    with store.lock:
        return [n for n in store.notifications
                if n.user_id == user_id and (not unread_only or not n.read)]


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: str, user: UserRecord = Depends(require_user), store: Store = Depends(get_store)):
    with store.lock:
        for n in store.notifications:
            # Someone else's notification is reported as missing, not forbidden.
            if n.id == notification_id and n.user_id == user.id:
                n.read = True
                return n
    raise HTTPException(status.HTTP_404_NOT_FOUND, f'Notification "{notification_id}" was not found.')


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_notifications(
    user_id: str = Query(alias="userId", min_length=1, max_length=ID_MAX),
    user: UserRecord | None = Depends(current_user),
    store: Store = Depends(get_store),
):
    """Delete all of a user's notifications."""
    ensure_self(user, user_id)
    with store.lock:
        store.notifications = [n for n in store.notifications if n.user_id != user_id]
    return Response(status_code=status.HTTP_204_NO_CONTENT)
