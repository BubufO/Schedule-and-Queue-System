"""Request and response models.

Pydantic enforces the validation rules here before any route code runs: required fields,
field types, and length/range limits. Requests that fail come back as 422 responses.

The API speaks camelCase JSON (durationMinutes, isOpen) to match the frontend, while the
Python side uses snake_case.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, model_validator
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
    # How long someone joining now would wait.
    estimated_wait_minutes: int


class VisitOut(QueueEntryOut):
    service_name: str
    ended_at: datetime
    outcome: Literal["served", "left", "removed", "cancelled"]

#---- Notifications -------------------------------------------------------------------------
class NotificationOut(ApiModel):
    id: str
    user_id: str
    type: Literal["joined", "left", "removed", "update", "turn", "service"]
    title: str
    message: str
    timestamp: datetime
    service_id: str | None
    old_position: int | None
    new_position: int | None
    read: bool