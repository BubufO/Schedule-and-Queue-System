"""Notification Module: a user's inbox. Each user can only see and change their own."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Notification
from app.schemas import ID_MAX, NotificationOut
from app.security import current_user, ensure_self, require_user
from app.store import UserRecord, utc_now

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    user_id: str = Query(alias="userId", min_length=1, max_length=ID_MAX),
    unread_only: bool = Query(False, alias="unreadOnly"),
    user: UserRecord | None = Depends(current_user),
    db: Session = Depends(get_db),
):
    """A user's notifications, newest first."""
    ensure_self(user, user_id)
    query = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        query = query.where(Notification.status == "sent")
    return list(db.scalars(query.order_by(Notification.timestamp.desc(), Notification.id.desc())))


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: str, user: UserRecord = Depends(require_user), db: Session = Depends(get_db)):
    notification = db.get(Notification, notification_id)
    # Someone else's notification is reported as missing, not forbidden.
    if notification is None or notification.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'Notification "{notification_id}" was not found.')
    notification.mark_viewed(utc_now())
    db.commit()
    return notification


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_notifications(
    user_id: str = Query(alias="userId", min_length=1, max_length=ID_MAX),
    user: UserRecord | None = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Delete all of a user's notifications."""
    ensure_self(user, user_id)
    db.execute(delete(Notification).where(Notification.user_id == user_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
