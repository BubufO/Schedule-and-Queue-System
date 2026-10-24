"""Request and response models.

Pydantic enforces the validation rules here before any route code runs: required fields,
field types, and length/range limits. Requests that fail come back as 422 responses.

The API speaks camelCase JSON (durationMinutes, isOpen) to match the frontend, while the
Python side uses snake_case.
"""

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    StringConstraints,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel

# Limits shared with the frontend's service form.
SERVICE_NAME_MAX = 100
SERVICE_DESCRIPTION_MAX = 500
DURATION_MIN = 1
DURATION_MAX = 480  # eight hours
VISITOR_NAME_MAX = 60  # same limit as a display name on the register screen
ID_MAX = 64

Priority = Literal["low", "medium", "high"]

ServiceName = Annotated[StrictStr, Field(min_length=1, max_length=SERVICE_NAME_MAX)]
ServiceDescription = Annotated[StrictStr, Field(min_length=1, max_length=SERVICE_DESCRIPTION_MAX)]
DurationMinutes = Annotated[StrictInt, Field(ge=DURATION_MIN, le=DURATION_MAX)]
VisitorName = Annotated[StrictStr, Field(min_length=1, max_length=VISITOR_NAME_MAX)]
Identifier = Annotated[StrictStr, Field(min_length=1, max_length=ID_MAX)]


class ApiModel(BaseModel):
    """Base for every request and response model."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        # "   " counts as empty, so whitespace-only names fail the required check.
        str_strip_whitespace=True,
        from_attributes=True,
    )


class RequestModel(ApiModel):
    # Unknown fields are rejected rather than silently ignored.
    model_config = ConfigDict(extra="forbid")


class ServiceCreate(RequestModel):
    name: ServiceName
    description: ServiceDescription
    duration_minutes: DurationMinutes
    priority: Priority = "medium"


class ServiceUpdate(RequestModel):
    """Partial update: send only the fields that change."""

    name: ServiceName | None = None
    description: ServiceDescription | None = None
    duration_minutes: DurationMinutes | None = None
    priority: Priority | None = None
    is_open: StrictBool | None = None

    @model_validator(mode="after")
    def at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        for field in self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{to_camel(field)} cannot be null.")
        return self


class ServiceOut(ApiModel):
    id: str
    name: str
    description: str
    duration_minutes: int
    priority: Priority
    is_open: bool
    ticket_prefix: str


# ---- Queue Management ---------------------------------------------------------------------


class JoinQueueRequest(RequestModel):
    name: VisitorName
    # Omitted for guests joining with a one-time link; a user can only hold one visit at a time.
    user_id: Identifier | None = None
    priority: Priority = "medium"


class LeaveQueueRequest(RequestModel):
    """Identify the visit to cancel by the user's id, or by the entry id for a guest."""

    user_id: Identifier | None = None
    entry_id: Identifier | None = None

    @model_validator(mode="after")
    def exactly_one_identifier(self):
        if (self.user_id is None) == (self.entry_id is None):
            raise ValueError("Provide either userId or entryId.")
        return self


class MoveEntryRequest(RequestModel):
    direction: Literal["up", "down"]


class QueueEntryOut(ApiModel):
    id: str
    service_id: str
    name: str
    ticket: str
    joined_at: datetime
    priority: Priority
    user_id: str | None


class WaitingEntryOut(QueueEntryOut):
    position: int  # 1 is next in line
    estimated_wait_minutes: int


class ServingOut(ApiModel):
    entry: QueueEntryOut
    started_at: datetime


class QueueOut(ApiModel):
    service_id: str
    service_name: str
    is_open: bool
    waiting: list[WaitingEntryOut]
    now_serving: ServingOut | None
    # How long a default (medium-priority) arrival joining now would wait.
    estimated_wait_minutes: int


class VisitOut(QueueEntryOut):
    service_name: str
    ended_at: datetime
    outcome: Literal["served", "left", "removed", "cancelled"]

# ---- Authentication -----------------------------------------------------------------------

# Same rules as the register screen (frontend/src/lib/validation.ts), so a request that skips
# the form still gets the same answer.
DISPLAY_NAME_MAX = 60
USERNAME_MIN = 3
USERNAME_MAX = 32
PASSWORD_MIN = 8
PASSWORD_MAX = 128
EMAIL_MAX = 254
PHONE_DIGITS_MIN = 10
PHONE_DIGITS_MAX = 15
VERIFICATION_CODE_LENGTH = 6

USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9._-]+$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

Role = Literal["client", "admin"]
VerificationChannel = Literal["email", "sms"]

DisplayName = Annotated[StrictStr, Field(min_length=1, max_length=DISPLAY_NAME_MAX)]
# Passwords are never trimmed: leading or trailing spaces are part of the password.
Password = Annotated[StrictStr, StringConstraints(strip_whitespace=False, max_length=PASSWORD_MAX)]


def normalize_phone(value: str) -> str:
    """Keeps digits and a leading +, so "(555) 012-3456" and "555.012.3456" compare equal."""
    digits = re.sub(r"\D", "", value)
    return f"+{digits}" if value.strip().startswith("+") and digits else digits


class LoginRequest(RequestModel):
    username: Annotated[StrictStr, Field(min_length=1, max_length=USERNAME_MAX)]
    password: Password

    @field_validator("username")
    @classmethod
    def lowercase(cls, value: str) -> str:
        return value.lower()

    @field_validator("password")
    @classmethod
    def present(cls, value: str) -> str:
        if not value:
            raise ValueError("This field is required.")
        return value


class RegisterRequest(RequestModel):
    """Self-registration. Always creates a client account; admins are not self-registered."""

    display_name: DisplayName
    username: StrictStr
    password: Password
    email: Annotated[StrictStr, Field(max_length=EMAIL_MAX)]
    # Optional unless the code should be sent by text.
    phone: StrictStr | None = None
    channel: VerificationChannel = "email"

    @field_validator("username")
    @classmethod
    def valid_username(cls, value: str) -> str:
        if not value:
            raise ValueError("Choose a username.")
        if not USERNAME_MIN <= len(value) <= USERNAME_MAX:
            raise ValueError(f"Use {USERNAME_MIN} to {USERNAME_MAX} characters.")
        if not USERNAME_PATTERN.match(value):
            raise ValueError("Use letters, numbers, dots, dashes or underscores.")
        return value.lower()

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if len(value) < PASSWORD_MIN:
            raise ValueError(f"Use at least {PASSWORD_MIN} characters.")
        if not re.search(r"[a-zA-Z]", value) or not re.search(r"[0-9]", value):
            raise ValueError("Include at least one letter and one number.")
        return value

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        if not value:
            raise ValueError("Enter your email address.")
        if not EMAIL_PATTERN.match(value):
            raise ValueError("Enter a valid email address.")
        return value.lower()

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, value: str | None) -> str | None:
        phone = normalize_phone(value or "")
        if not phone:
            return None
        if not PHONE_DIGITS_MIN <= len(phone.lstrip("+")) <= PHONE_DIGITS_MAX:
            raise ValueError("Enter a valid phone number, including area code.")
        return phone

    @model_validator(mode="after")
    def phone_for_sms(self):
        if self.channel == "sms" and not self.phone:
            raise ValueError("Enter a phone number to receive a text.")
        return self


class VerifyRequest(RequestModel):
    verification_id: Identifier
    code: StrictStr

    @field_validator("code")
    @classmethod
    def six_digits(cls, value: str) -> str:
        if not (len(value) == VERIFICATION_CODE_LENGTH and value.isdigit()):
            raise ValueError(f"Enter the {VERIFICATION_CODE_LENGTH}-digit code.")
        return value


class ResendVerificationRequest(RequestModel):
    verification_id: Identifier
    # Leave out to resend through the same channel as last time.
    channel: VerificationChannel | None = None


class AccountOut(ApiModel):
    id: str
    username: str
    display_name: str
    role: Role
    email: str | None = None
    phone: str | None = None


class SessionOut(ApiModel):
    token: str
    expires_at: datetime
    account: AccountOut


class VerificationChallengeOut(ApiModel):
    verification_id: str
    channel: VerificationChannel
    destination: str  # masked, e.g. j•••@example.com or •••• 4821
    expires_at: datetime
    resend_available_at: datetime
    channels: list[VerificationChannel]  # every channel this account can be verified through


# ---- Profile settings ---------------------------------------------------------------------
# A signed-in user editing their own account. The field rules match registration.


PHONE_MAX = 32  # characters as typed, before formatting like "(555) 012-3456" is stripped


def _valid_username(value: str) -> str:
    if not value:
        raise ValueError("Username is required.")
    if not USERNAME_MIN <= len(value) <= USERNAME_MAX:
        raise ValueError(f"Use {USERNAME_MIN} to {USERNAME_MAX} characters.")
    if not USERNAME_PATTERN.match(value):
        raise ValueError("Use letters, numbers, dots, dashes or underscores.")
    return value.lower()


def _valid_email(value: str) -> str:
    if not value:
        raise ValueError("Email is required.")
    if not EMAIL_PATTERN.match(value):
        raise ValueError("Enter a valid email address.")
    return value.lower()


def _valid_new_password(value: str) -> str:
    if len(value) < PASSWORD_MIN:
        raise ValueError(f"Use at least {PASSWORD_MIN} characters.")
    if not re.search(r"[a-zA-Z]", value) or not re.search(r"[0-9]", value):
        raise ValueError("Include at least one letter and one number.")
    return value


class ProfileUpdate(RequestModel):
    """Partial update: send only the fields that change. Send phone as "" or null to remove it.

    Validation:
    - Required: at least one field; display name, username and email can't be emptied or nulled.
    - Types: strings must be strings and preferences must be true/false (no "yes" or 1).
    - Lengths: display name 1-60, username 3-32, email up to 254, phone up to 32 characters
      with 10-15 digits. Unknown fields such as role are rejected.
    """

    display_name: DisplayName | None = None
    username: Annotated[StrictStr, Field(max_length=USERNAME_MAX)] | None = None
    email: Annotated[StrictStr, Field(max_length=EMAIL_MAX)] | None = None
    phone: Annotated[StrictStr, Field(max_length=PHONE_MAX)] | None = None
    notify_email: StrictBool | None = None
    notify_sms: StrictBool | None = None
    notify_in_app: StrictBool | None = None

    @field_validator("username")
    @classmethod
    def valid_username(cls, value: str | None) -> str | None:
        return None if value is None else _valid_username(value)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str | None) -> str | None:
        return None if value is None else _valid_email(value)

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, value: str | None) -> str | None:
        phone = normalize_phone(value or "")
        if not phone:
            return None
        if not PHONE_DIGITS_MIN <= len(phone.lstrip("+")) <= PHONE_DIGITS_MAX:
            raise ValueError("Enter a valid phone number, including area code.")
        return phone

    @model_validator(mode="after")
    def at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")
        for field in self.model_fields_set - {"phone"}:
            if getattr(self, field) is None:
                raise ValueError(f"{to_camel(field)} cannot be null.")
        return self


class PasswordChange(RequestModel):
    """Both fields required, strings, at most 128 characters. The new one needs 8+ characters
    with a letter and a number, and must differ from the current one."""

    current_password: Password
    new_password: Password

    @field_validator("current_password")
    @classmethod
    def present(cls, value: str) -> str:
        if not value:
            raise ValueError("Enter your current password.")
        return value

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return _valid_new_password(value)

    @model_validator(mode="after")
    def different(self):
        if self.new_password == self.current_password:
            raise ValueError("Choose a password different from your current one.")
        return self


class ProfileOut(AccountOut):
    notify_email: bool
    notify_sms: bool
    notify_in_app: bool


#---- Notifications -------------------------------------------------------------------------
class NotificationOut(ApiModel):
    id: str
    user_id: str
    type: Literal["joined", "left", "removed", "update", "approaching", "turn", "service"]
    title: str
    message: str
    timestamp: datetime
    service_id: str | None
    old_position: int | None
    new_position: int | None
    read: bool
