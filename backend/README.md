# QueueSmart Backend

FastAPI backend for authentication, services, queues, notifications, and participation history.
Services, queues, the people in each queue (and their visit history), accounts, and
notifications are stored in a Supabase Postgres database. Sessions are still held in memory and
reset when the server restarts.

Run it with `uv run fastapi dev` (see `SETUP.md`). See the test commands below.
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
| `tests/test_wait_times.py` | Duration boundaries, priority-aware join previews, isolation between services, live waits after leaving/serving/completing/reordering/removing and editing duration |
| `tests/test_auth.py` | Teammate-owned authentication and access-control suite, preserved unchanged from PR #10 |

Business tests get a fresh `Store(seed=False)`. API tests override the `get_store`
dependency and restore overrides afterwards, so tests do not alter the application's
shared store. Their `ScenarioClient` defaults to a fixture administrator session;
personal operations explicitly pass `client.headers_for(user_id)` for that user's
fixture session. Requests still exercise the real session/role/ownership checks;
no auth dependency is bypassed. Authentication tests keep their own seeded-store
and login fixtures. Seed data is tested separately. Tests check state changes as well as
HTTP responses, including that rejected requests leave state intact.

Coverage includes all code under `app`, with branch measurement enabled. Coverage
runs fail below 80%. Open `htmlcov/index.html` for the detailed report; `coverage.xml`
is available for tooling. These generated reports are ignored by Git and can be
regenerated for submission screenshots.

The `Backend tests` GitHub Actions workflow runs this command on pushes and pull
requests affecting the backend and uploads HTML/XML coverage as a
`backend-coverage` artifact. The results below were verified locally.

Verified after integrating `main` commit `bc32d47` (authentication PR #10):
**181 passed; 98.40% combined statement and branch coverage**, using Python 3.13.2.
This includes **138 business/validation tests** and the teammate's **43 existing
authentication tests**, which were not modified or duplicated. Services, queue
logic/endpoints, and notifications logic/endpoints each achieved 100% measured
statement and branch coverage. The shared store measured 96%; its default
global-store getter is bypassed by test dependency overrides.
This exceeds A3's 70–80% target. The installed
FastAPI/Starlette stack emits two dependency deprecation warnings; they do not fail
the tests.

Scope of this contribution: services, queues, notifications, wait-time estimation,
history, and their validation. Authentication and access-control testing remain
owned by the teammate's existing suite; profile settings remain outside this work.
To run only this contribution's tests, use `uv run --locked python -m pytest
--ignore=tests/test_auth.py` (without coverage flags). Run the full command above
for the team's aggregate coverage report. Coverage does not establish that all
assignment modules are complete. Tests use a temporary in-memory SQLite database
built from `app/models.py`, so they never touch Supabase.

## Layout

| Path | What it does |
| --- | --- |
| `app/main.py` | Creates the app, enables CORS, registers routers and error handlers |
| `app/database.py` | Connection to the Supabase database (`DATABASE_URL`) and the per-request session |
| `app/models.py` | Table models (`services`, `queues`, `queue_entries`, users), with the same constraints as the database |
| `app/store.py` | In-memory store for sessions, pending registrations and notifications |
| `app/schemas.py` | Request/response models and their validation rules |
| `app/errors.py` | Turns validation failures into clear 422 responses |
| `app/queueing.py` | Queue ordering and bookkeeping on the `queue_entries` table |
| `scripts/create_queue_entries.py` | Creates `queue_entries` in Supabase; `--seed-visitors` adds demo visitors |
| `app/security.py` | Password hashing, session tokens, and the `require_user` / `require_admin` checks |
| `app/routers/auth.py` | Authentication endpoints |
| `app/routers/services.py` | Service Management endpoints |
| `app/routers/queues.py` | Queue Management endpoints |
| `app/notifications.py` | Notification triggers, position tracking, approaching-alert deduplication |
| `app/routers/notifications.py` | List, mark read, and clear user notifications |

## Database

1. Copy `backend/.env.example` to `backend/.env`.
2. In Supabase, open your project, click **Connect**, and copy the **Session pooler** connection
   string. Paste it as `DATABASE_URL` and replace `[YOUR-PASSWORD]` with your database password.
   The pooler works on any network; the direct connection needs IPv6.
3. Start the backend and open http://localhost:8000/health/db. It should say
   `{"database": "connected"}`.

`.env` is git-ignored, so the password is never committed. Without it, or if Supabase can't be
reached, database endpoints return 503 with a message saying what to fix.

| Table | Used for |
| --- | --- |
| `services` | Every service. Create, update, list and delete read and write this table. |
| `queues` | One row per service: its open/closed status and created date. Opening or closing a queue updates `queues.status` and keeps `services.is_open` matching. A new service gets a queue row, and deleting a service deletes it. |
| `queue_entries` | One row per visit. A visit is `waiting` (with a `position`, 1 = next), then `serving`, then ends as `served`, `left`, `removed` or `cancelled` with `ended_at` set; finished rows are the visit history. Each row keeps its service's id and name, so deleting a service cancels its visits but keeps them in history (`queue_id` becomes NULL). Partial unique indexes allow one active visit per user and one person being served per queue. |
| `notifications` | Each user's inbox, newest first by `created_at`. Joining, leaving, being removed or served, and position changes add rows with `status` `sent`; mark-read sets `status` to `viewed` and fills `viewed_at`, and clearing deletes the user's rows. Only users with an account get rows; deleting an account deletes its notifications, and deleting a service sets their `service_id` to NULL. |

`queue_entries` is created from the model with `python scripts/create_queue_entries.py`
(run once; safe to repeat). Add `--seed-visitors` to insert the demo visitors into an empty table.

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

## Wait-time estimation (A3)

The backend calculates the approximate minutes until a visitor starts service:

```text
wait = expected duration × (waiting people ahead + active service count)
```

The active service count is 0 or 1 for that service only. For example, with a
10-minute duration, a visitor in position 3 waits approximately 20 minutes when
nobody is being served, or 30 minutes with an active visit. The person currently
being served has no further queue wait.

`app/queueing.py` implements `wait_minutes` for existing visitors and
`join_wait_minutes` for new arrivals. Queue response `estimatedWaitMinutes` is the
preview for a default medium-priority arrival, using the same insertion position
as joining; lower-priority visitors behind that position do not inflate the
preview. Each waiting entry also returns its actual `position` and
`estimatedWaitMinutes` for its priority and any manual staff reordering.

The user join screen, active-visit view, and guest visit view display backend
estimates. Polling and successful queue actions refresh them. Estimates recompute
after joining, leaving, serving, completing, removing/reordering entries, and
editing a service's expected duration. They are approximate, not a wall-clock
countdown: an active visit counts as one full duration until completed. No database
or advanced prediction algorithm is involved.

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

## A4: credentials and profiles

Apply `sql/001_users.sql` once in the Supabase SQL editor before using authentication.
It creates `user_credentials` and `user_profiles` without modifying services/queues.
The two tables share a string user ID (up to 64 characters), which other tables can
reference as `user_credentials.id`. Email is stored once on credentials; a profile
references that email's owner through its user ID. Roles remain `client` (User)
and `admin` (Administrator) for compatibility with the existing UI.

Verified registrations write credentials and profile in one transaction, using
random UUID-based IDs that stay unique across restarts. Username and email have
case-insensitive unique database indexes. Passwords use the existing salted PBKDF2
hash format; password hashes are never included in API responses. Profile edits,
notification preferences, and password changes are persisted too. Self-registration
cannot choose an administrator role.

Sessions and pending verification challenges remain in memory: after restarting,
users sign in again and unfinished registrations must restart. Accounts survive.
The in-memory demo accounts are not automatically copied to the database. Register
an account normally; a database administrator can grant its `user_credentials` row
the `admin` role explicitly. Queue entries/history/notifications remain separate
team-owned persistence work.

Tests use isolated SQLite databases and never contact Supabase. Run:

```sh
uv sync --locked --group dev
uv run --locked python -m pytest --cov=app --cov-report=term-missing --cov-report=html --cov-report=xml
```
