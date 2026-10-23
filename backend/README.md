# QueueSmart Backend

FastAPI backend for authentication, services, queues, notifications, and participation history. Data is held in memory
(no database yet) and resets to the seed data when the server restarts.

Run it with `uv run fastapi dev` (see `SETUP.md`). Run the tests with `uv run --with pytest pytest`.
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
| `app/security.py` | Password hashing, session tokens, and the `require_user` / `require_admin` checks |
| `app/routers/auth.py` | Authentication endpoints |
| `app/routers/services.py` | Service Management endpoints |
| `app/routers/queues.py` | Queue Management endpoints |
| `app/notifications.py` | Notification triggers, position tracking, approaching-alert deduplication |
| `app/routers/notifications.py` | List, mark read, and clear user notifications |

## Authentication and roles

Sign in with `POST /auth/login` (or finish registering with `POST /auth/verify`) to get a token,
then send it on every request as `Authorization: Bearer <token>`. Sessions last 12 hours and end
on logout or a server restart.

There are two roles. **Clients** (`client`) join and leave queues and see their own history and
notifications. **Administrators** (`admin`) manage services and run queues. Self-registration
always creates a client; administrator accounts are seeded. The "Who" column below is enforced:

| Who | Needs |
| --- | --- |
| Public | Nothing |
| User | A session for the account named by `userId` (guests acting by `entryId` need none) |
| Admin | An administrator session |

Requests without a valid token get 401; a signed-in user without the right role, or acting for
another account, gets 403.

Seed accounts: `admin` / `password` (administrator) and `user` / `password` (client).

Passwords are hashed with salted PBKDF2-SHA256 and never stored or returned in plain text.
There is no email or SMS provider yet: every verification code is `123456`, and it is written to
the server log instead of being sent.

## Endpoints

### Authentication

| Method | Path | Who | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Start registering a client. Body: `displayName`, `username`, `password`, `email`, optional `phone` and `channel` (`email` or `sms`). Returns a verification challenge |
| POST | `/auth/verify` | Public | Confirm the code. Body: `verificationId`, `code`. Activates the account and returns a session |
| POST | `/auth/verify/resend` | Public | Send a new code (30s cooldown), optionally by another `channel` |
| POST | `/auth/login` | Public | Body: `username`, `password`. Returns `{token, expiresAt, account}` |
| GET | `/auth/me` | User | The signed-in account |
| POST | `/auth/logout` | User | End this session |

A code is good for 10 minutes and 5 tries. A pending registration holds its username and email
until it is verified or expires.

### Service Management

| Method | Path | Who | Description |
| --- | --- | --- | --- |
| GET | `/services` | Public | List all services |
| GET | `/services/{id}` | Public | Get one service |
| POST | `/services` | Admin | Create a service (starts closed) |
| PATCH | `/services/{id}` | Admin | Update any of a service's fields, including opening or closing its queue |
| DELETE | `/services/{id}` | Admin | Delete a service and cancel its queue |

### Queue Management

| Method | Path | Who | Description |
| --- | --- | --- | --- |
| POST | `/queues/{id}/join` | User or guest | Join a queue. Body: `name`, optional `userId` and `priority` |
| POST | `/queues/{id}/leave` | User or guest | Leave a queue. Body: `userId`, or `entryId` for guests |
| GET | `/queues/{id}` | Public | View a queue: who is waiting, positions, wait times, who is being served |
| POST | `/queues/{id}/serve-next` | Admin | Finish the current visit and call the next person |
| POST | `/queues/{id}/complete` | Admin | Finish the current visit without calling anyone |
| DELETE | `/queues/{id}/entries/{entryId}` | Admin | Remove someone from the queue |
| POST | `/queues/{id}/entries/{entryId}/move` | Admin | Move someone up or down one place |
| GET | `/queues` | Public | Every service's queue at once |
| GET | `/queues/history?userId=` | User | A user's finished visits, newest first |

### Notifications

| Method | Path | Who | Description |
| --- | --- | --- | --- |
| GET | `/notifications?userId=` | User | A user's notifications, newest first (`unreadOnly=true` to filter) |
| POST | `/notifications/{id}/read` | User | Mark one of your notifications read |
| DELETE | `/notifications?userId=` | User | Clear a user's notifications |

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
| `displayName` | Required, text, 1 to 60 characters |
| `username` | Required, 3 to 32 letters, numbers, dots, dashes or underscores; unique, ignoring case |
| `password` | Required, 8 to 128 characters with at least one letter and one number (login only checks it is present) |
| `email` | Required, a valid address, at most 254 characters; unique, ignoring case |
| `phone` | Optional, 10 to 15 digits after removing spaces and punctuation; required when `channel` is `sms` |
| `code` | Exactly 6 digits |

Self-registration cannot set `role`: it is an unknown field and is rejected.

Text is trimmed first (except passwords), so a name of only spaces counts as missing. Unknown fields are rejected.

Error responses:

| Status | When | Body |
| --- | --- | --- |
| 422 | Missing fields, wrong types, values out of range | `{"detail": "Some fields are invalid.", "errors": [{"field": "name", "message": "Must be at most 100 characters."}]}` |
| 400 | Wrong verification code (says how many tries are left) | `{"detail": "That code is incorrect. 4 attempts left."}` |
| 401 | Missing or expired token, or wrong username or password | `{"detail": "Incorrect username or password."}` |
| 403 | Signed in, but without the role or the account the request needs | `{"detail": "Administrator access required."}` |
| 404 | Unknown service, queue entry, or verification | `{"detail": "Service \"x\" was not found."}` |
| 410 / 429 | Verification code expired / too many tries or resent too soon | `{"detail": "This code has expired. Send a new one."}` |
| 409 | Request conflicts with the current state (queue closed, already in a queue, duplicate name, username or email taken, nobody waiting) | `{"detail": "This service is currently closed."}` |
