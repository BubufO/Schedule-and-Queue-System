# QueueSmart Backend

FastAPI backend for services, queues, notifications, and participation history. Data is held in memory
(no database yet) and resets to the seed data when the server restarts.

Run it with `uv run fastapi dev` (see `SETUP.md`).
Full request and response details are at http://localhost:8000/docs while the server is running.

## Tests and coverage (Assignment 3)

From the repository root:

```bash
cd backend
uv sync --locked --group dev
uv run --locked python -m pytest --cov=app --cov-report=term-missing --cov-report=html --cov-report=xml
```

Alternatively, after installing `requirements.txt` into an activated Python 3.13+
environment, run the same `python -m pytest` command without `uv run --locked`.
No running API server, database, or environment secrets are required.

The suite contains direct unit tests and in-process API tests:

| File | Coverage focus |
| --- | --- |
| `tests/test_queueing.py` | Priority ordering, FIFO within a priority, unique tickets, wait estimates, visit lookup, history, seed data isolation |
| `tests/test_schemas.py` | Required fields, strict types, length/range boundaries, trimming, partial updates, leave identifiers |
| `tests/test_services_api.py` | Service lifecycle, duplicate names, ID collisions, validation error responses, deletion cancelling visits |
| `tests/test_queues_api.py` | Join/leave/serve/complete workflows, positions and waits, duplicate visits, manual reordering, history filtering, error responses |
| `tests/test_notifications.py` | Logged notification records, guest handling, close-to-front boundary, position changes, approaching-alert deduplication, tracking cleanup |
| `tests/test_notifications_api.py` | Queue event triggers, distinct approaching/turn alerts, user inbox filtering, mark-read, unread filtering, clearing, validation |
| `tests/test_history_api.py` | Served/left/removed/cancelled outcomes, active visits excluded, preserved visit details, user filtering, newest-first ordering across services |

Each test gets a fresh `Store(seed=False)`. API tests override the `get_store`
dependency and restore overrides afterwards, so tests do not alter the application's
shared store. Seed data is tested separately. Tests check state changes as well as
HTTP responses, including that rejected requests leave state intact.

Coverage includes all code under `app`, with branch measurement enabled. Coverage
runs fail below 80%. Open `htmlcov/index.html` for the detailed report; `coverage.xml`
is available for tooling. These generated reports are ignored by Git and can be
regenerated for submission screenshots.

The `Backend tests` GitHub Actions workflow runs this command on pushes and pull
requests affecting the backend and uploads HTML/XML coverage as a
`backend-coverage` artifact. The workflow needs to be pushed to GitHub before it
can run; the results below were verified locally.

Verified against merged `main` commit `0060597` on October 23, 2026:
**124 passed; 99.17% combined statement and branch coverage**, using Python 3.13.2.
Services, queue logic/endpoints, notifications logic/endpoints, and schemas each
achieved 100% measured statement and branch coverage. The shared store measured
94%; its default global-store getter is bypassed by test dependency overrides.
This exceeds A3's 70–80% target. The installed
FastAPI/Starlette stack emits two dependency deprecation warnings; they do not fail
the tests.

Scope: these tests cover the currently implemented service, queue, notification,
wait-time, and history behavior. Authentication, administrator role enforcement,
and profile settings are deferred to a later testing phase. User-ID filtering tests
check filtering behavior; they do not establish authenticated access control.
This coverage percentage does not establish
that all assignment modules are complete. `database.py` and `models.py` are empty
placeholders and contain no executable statements.

## Layout

| Path | What it does |
| --- | --- |
| `app/main.py` | Creates the app, enables CORS, registers routers and error handlers |
| `app/store.py` | In-memory store and seed data |
| `app/schemas.py` | Request/response models and their validation rules |
| `app/errors.py` | Turns validation failures into clear 422 responses |
| `app/queueing.py` | Queue ordering and bookkeeping |
| `app/routers/services.py` | Service Management endpoints |
| `app/routers/queues.py` | Queue Management endpoints |
| `app/notifications.py` | Notification triggers, position tracking, approaching-alert deduplication |
| `app/routers/notifications.py` | List, mark read, and clear user notifications |

## Endpoints

### Service Management

| Method | Path | Description |
| --- | --- | --- |
| GET | `/services` | List all services |
| GET | `/services/{id}` | Get one service |
| POST | `/services` | Create a service (starts closed) |
| PATCH | `/services/{id}` | Update any of a service's fields, including opening or closing its queue |
| DELETE | `/services/{id}` | Delete a service and cancel its queue |

### Queue Management

| Method | Path | Who | Description |
| --- | --- | --- | --- |
| POST | `/queues/{id}/join` | User | Join a queue. Body: `name`, optional `userId` and `priority` |
| POST | `/queues/{id}/leave` | User | Leave a queue. Body: `userId`, or `entryId` for guests |
| GET | `/queues/{id}` | Admin | View a queue: who is waiting, positions, wait times, who is being served |
| POST | `/queues/{id}/serve-next` | Admin | Finish the current visit and call the next person |
| POST | `/queues/{id}/complete` | Admin | Finish the current visit without calling anyone |
| DELETE | `/queues/{id}/entries/{entryId}` | Admin | Remove someone from the queue |
| POST | `/queues/{id}/entries/{entryId}/move` | Admin | Move someone up or down one place |
| GET | `/queues` | Both | Every service's queue at once |
| GET | `/queues/history?userId=` | User | A user's finished visits, newest first |

### Notifications

| Method | Path | Description |
| --- | --- | --- |
| GET | `/notifications?userId=` | User inbox, newest first; optional `unreadOnly=true` |
| POST | `/notifications/{id}/read` | Mark a notification read |
| DELETE | `/notifications?userId=` | Clear one user's inbox |

Queue changes trigger joined, left, removed, position-update, approaching, and turn
notifications. Approaching means position 1 or 2, once per visit. Notifications are
stored in memory and logged; no email or SMS service is required.

**Queue ordering:** people are served by priority first (high, then medium, then low), and in
arrival order within the same priority.

## Validation

Every request body is checked before it reaches the endpoint code:

| Field | Rules |
| --- | --- |
| Service `name` | Required, text, 1 to 100 characters, unique (ignoring case) |
| Service `description` | Required, text, 1 to 500 characters |
| `durationMinutes` | Required, whole number, 1 to 480 |
| `priority` | `low`, `medium` or `high` (defaults to `medium`) |
| `isOpen` | `true` or `false` (update only) |
| Visitor `name` | Required, text, 1 to 60 characters |
| `userId` / `entryId` | Text, 1 to 64 characters |

Text is trimmed first, so a name of only spaces counts as missing. Unknown fields are rejected.

Error responses:

| Status | When | Body |
| --- | --- | --- |
| 422 | Missing fields, wrong types, values out of range | `{"detail": "Some fields are invalid.", "errors": [{"field": "name", "message": "Must be at most 100 characters."}]}` |
| 404 | Unknown service or queue entry | `{"detail": "Service \"x\" was not found."}` |
| 409 | Request conflicts with the current state (queue closed, already in a queue, duplicate name, nobody waiting) | `{"detail": "This service is currently closed."}` |
