"""Account persistence. Credentials and profile writes commit as one transaction."""

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import UserCredentials, UserProfile
from app.store import UserRecord


def as_record(row: UserCredentials) -> UserRecord:
    profile = row.profile
    return UserRecord(row.id, row.username, row.password_hash, profile.display_name,
                      row.role, row.email, profile.phone, profile.notify_email,
                      profile.notify_sms, profile.notify_in_app)


def get_user(db: Session, user_id: str) -> UserRecord | None:
    row = db.get(UserCredentials, user_id)
    return as_record(row) if row else None


def all_users(db: Session) -> list[UserRecord]:
    return [as_record(row) for row in db.scalars(select(UserCredentials)).unique()]


def find_user(db: Session, username: str) -> UserRecord | None:
    row = db.scalar(select(UserCredentials).where(func.lower(UserCredentials.username) == username.lower()))
    return as_record(row) if row else None


def save_user(db: Session, user: UserRecord, *, create: bool = False) -> None:
    row = None if create else db.get(UserCredentials, user.id)
    if row is None:
        row = UserCredentials(id=user.id, profile=UserProfile())
        db.add(row)
    for field in ("username", "email", "password_hash", "role"):
        setattr(row, field, getattr(user, field))
    for field in ("display_name", "phone", "notify_email", "notify_sms", "notify_in_app"):
        setattr(row.profile, field, getattr(user, field))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "That username or email is already taken, or the account data is invalid.") from None
