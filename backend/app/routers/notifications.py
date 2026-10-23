"""Notification Module: a user's inbox."""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.schemas import ID_MAX, NotificationOut
from app.store import Store, get_store

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    user_id: str = Query(alias="userId", min_length=1, max_length=ID_MAX),
    unread_only: bool = Query(False, alias="unreadOnly"),
    store: Store = Depends(get_store),
):
    """A user's notifications, newest first."""
    with store.lock:
        return [n for n in store.notifications
                if n.user_id == user_id and (not unread_only or not n.read)]


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: str, store: Store = Depends(get_store)):
    with store.lock:
        for n in store.notifications:
            if n.id == notification_id:
                n.read = True
                return n
    raise HTTPException(status.HTTP_404_NOT_FOUND, f'Notification "{notification_id}" was not found.')