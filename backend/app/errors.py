"""Consistent error responses.

Every error body has a human-readable "detail". Validation failures (422) also list each
problem field with a plain message, so the frontend can show it next to the right input:

    {"detail": "Some fields are invalid.",
     "errors": [{"field": "name", "message": "Must be at most 100 characters."}]}
"""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _field_name(loc: tuple[Any, ...]) -> str:
    # loc looks like ("body", "durationMinutes"); drop where it came from, keep the field path.
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    return ".".join(parts)


def _message(error: dict[str, Any]) -> str:
    kind = error["type"]
    ctx = error.get("ctx") or {}
    if kind == "missing":
        return "This field is required." if _field_name(error["loc"]) else "A request body is required."
    if kind == "string_too_short":
        return "This field is required." if ctx.get("min_length") == 1 else f"Must be at least {ctx['min_length']} characters."
    if kind == "string_too_long":
        return f"Must be at most {ctx['max_length']} characters."
    if kind == "string_type":
        return "Must be text."
    if kind == "int_type":
        return "Must be a whole number."
    if kind == "bool_type":
        return "Must be true or false."
    if kind == "greater_than_equal":
        return f"Must be at least {ctx['ge']}."
    if kind == "less_than_equal":
        return f"Must be at most {ctx['le']}."
    if kind == "literal_error":
        return f"Must be one of: {ctx['expected'].replace(chr(39), '')}."
    if kind == "extra_forbidden":
        return "Unknown field."
    if kind == "json_invalid":
        return "The request body is not valid JSON."
    if kind in ("model_type", "model_attributes_type", "dict_type"):
        return "The request body must be a JSON object."
    if kind == "value_error":
        return error["msg"].removeprefix("Value error, ")
    return error["msg"]


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {
            # For unparseable JSON the location is a character offset, not a field.
            "field": "" if e["type"] == "json_invalid" else _field_name(e["loc"]),
            "message": _message(e),
        }
        for e in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"detail": "Some fields are invalid.", "errors": errors},
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, validation_error_handler)
