# QueueSmart Backend

FastAPI backend for the Service Management and Queue Management modules. Data is held in memory
(no database yet) and resets to the seed data when the server restarts.

Run it with `uv run fastapi dev` (see `SETUP.md`).
Full request and response details are at http://localhost:8000/docs while the server is running.

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
