"""Validation boundaries are tested directly, without HTTP."""

import pytest
from pydantic import ValidationError

from app.schemas import JoinQueueRequest, LeaveQueueRequest, ServiceCreate, ServiceUpdate


VALID_SERVICE = {"name": "Advising", "description": "Course advice", "durationMinutes": 10}


@pytest.mark.parametrize("field,value", [
    ("name", ""), ("name", "   "), ("name", "a" * 101), ("name", 123),
    ("description", ""), ("description", "d" * 501), ("description", False),
    ("durationMinutes", 0), ("durationMinutes", 481), ("durationMinutes", 1.5),
    ("durationMinutes", "10"), ("durationMinutes", True), ("priority", "urgent"),
    ("unexpected", "value"),
])
def test_invalid_service_fields(field, value):
    with pytest.raises(ValidationError):
        ServiceCreate.model_validate({**VALID_SERVICE, field: value})


@pytest.mark.parametrize("field", ["name", "description", "durationMinutes"])
def test_service_required_fields(field):
    body = VALID_SERVICE.copy()
    del body[field]
    with pytest.raises(ValidationError):
        ServiceCreate.model_validate(body)


@pytest.mark.parametrize("duration", [1, 480])
def test_service_accepts_boundaries_trims_text_and_defaults_priority(duration):
    model = ServiceCreate(name=" " + "n" * 100 + " ", description="d" * 500,
                          durationMinutes=duration)
    assert model.name == "n" * 100
    assert model.duration_minutes == duration
    assert model.priority == "medium"


@pytest.mark.parametrize("body", [{}, {"name": None}, {"isOpen": None},
                                       {"isOpen": "true"}, {"isOpen": 1}])
def test_update_rejects_empty_null_and_non_boolean_values(body):
    with pytest.raises(ValidationError):
        ServiceUpdate.model_validate(body)


def test_partial_update_accepts_false_without_inventing_other_changes():
    assert ServiceUpdate(isOpen=False).model_dump(exclude_unset=True) == {"is_open": False}


@pytest.mark.parametrize("body", [
    {}, {"name": " "}, {"name": "n" * 61}, {"name": 1},
    {"name": "Alice", "userId": ""}, {"name": "Alice", "userId": "u" * 65},
    {"name": "Alice", "priority": "urgent"},
])
def test_invalid_join_fields(body):
    with pytest.raises(ValidationError):
        JoinQueueRequest.model_validate(body)


def test_join_accepts_maximum_lengths():
    model = JoinQueueRequest(name="n" * 60, userId="u" * 64)
    assert len(model.name) == 60
    assert len(model.user_id) == 64


@pytest.mark.parametrize("body", [{}, {"userId": "u", "entryId": "e"},
                                       {"userId": " "}, {"entryId": "e" * 65}])
def test_leave_requires_exactly_one_valid_identifier(body):
    with pytest.raises(ValidationError):
        LeaveQueueRequest.model_validate(body)


@pytest.mark.parametrize("body", [{"userId": "u"}, {"entryId": "e"}])
def test_leave_accepts_either_identifier(body):
    assert LeaveQueueRequest.model_validate(body).model_dump(by_alias=True, exclude_none=True) == body
