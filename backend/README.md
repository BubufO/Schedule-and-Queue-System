# QueueSmart Backend

FastAPI backend for the Authentication, Service Management, Queue Management and Notification modules. Data is held in memory
(no database yet) and resets to the seed data when the server restarts.

Run it with `uv run fastapi dev` (see `SETUP.md`). Run the tests with `uv run --with pytest pytest`.
Full request and response details are at http://localhost:8000/docs while the server is running.

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
