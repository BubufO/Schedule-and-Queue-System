"""Queue Management module.

Each service's queue is a row in the queues table (its status and created date), and the people
in it are rows in the queue_entries table.

Users join and leave a service's queue. Administrators view the queue, serve the next
person, and can remove or reorder people. Waiting lists are kept in serving order: priority
first, then arrival (see app.queueing).

Administrator actions need an admin session. Anything done for a userId needs that user's own
session; guests who joined with a link act by entryId and need no session.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import QueueEntry, Service
from app.queueing import (
    QueueState,
    add_entry,
    all_queue_states,
    archive,
    find_user_visit,
    finished_visits,
    join_wait_minutes,
    queue_state,
    start_serving,
    wait_minutes,
)
from app.routers.services import all_services, find_service
from app.notifications import forget, notify_joined, notify_left, notify_now_serving, notify_removed, refresh_positions #hook the triggers
from app.schemas import (
    ID_MAX,
    JoinQueueRequest,
    LeaveQueueRequest,
    MoveEntryRequest,
    QueueEntryOut,
    QueueOut,
    ServingOut,
    VisitOut,
    WaitingEntryOut,
)
from app.security import current_user, ensure_self, require_admin
from app.store import Store, UserRecord, get_store

router = APIRouter(prefix="/queues", tags=["queues"])

ACTIVE_VISIT = "You already have an active queue visit."
NOT_WAITING = "That person is not waiting in this queue."


# ---- response builders ----------------------------------------------------------------


def _waiting_out(service: Service, state: QueueState, index: int, entry: QueueEntry) -> WaitingEntryOut:
    return WaitingEntryOut(
        **QueueEntryOut.model_validate(entry).model_dump(),
        position=index + 1,
        estimated_wait_minutes=wait_minutes(service, index, state.serving is not None),
    )


def _serving_out(entry: QueueEntry | None) -> ServingOut | None:
    if entry is None:
        return None
    return ServingOut(entry=QueueEntryOut.model_validate(entry), started_at=entry.started_at)


def _queue_out(service: Service, state: QueueState) -> QueueOut:
    return QueueOut(
        queue_id=service.queue.queue_id if service.queue else None,
        created_at=service.queue.created_at if service.queue else None,
        service_id=service.id,
        service_name=service.name,
        is_open=service.is_open,
        waiting=[_waiting_out(service, state, i, e) for i, e in enumerate(state.waiting)],
        now_serving=_serving_out(state.serving),
        estimated_wait_minutes=join_wait_minutes(state, service),
    )


def _find_waiting(state: QueueState, entry_id: str) -> int:
    for index, entry in enumerate(state.waiting):
        if entry.id == entry_id:
            return index
    raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_WAITING)


def _commit_and_notify(db: Session, store: Store, service: Service, state_after: QueueState, notify=None) -> None:
    """Save the change, then save its notifications, so a failed change never notifies anyone."""
    db.commit()
    with store.lock:
        if notify:
            notify()
        refresh_positions(db, store, service, state_after.waiting)
    db.commit()


# ---- viewing --------------------------------------------------------------------------


@router.get("", response_model=list[QueueOut])
def list_queues(db: Session = Depends(get_db)):
    """Every service's queue, for dashboards that show all of them at once."""
    states = all_queue_states(db)
    return [_queue_out(s, states.get(s.id, QueueState())) for s in all_services(db)]


@router.get("/history", response_model=list[VisitOut])
def visit_history(
    user_id: str = Query(alias="userId", min_length=1, max_length=ID_MAX),
    user: UserRecord | None = Depends(current_user),
    db: Session = Depends(get_db),
):
    """A user's finished visits, newest first."""
    ensure_self(user, user_id)
    return finished_visits(db, user_id)


@router.get("/{service_id}", response_model=QueueOut)
def view_queue(service_id: str, db: Session = Depends(get_db)):
    service = find_service(db, service_id)
    return _queue_out(service, queue_state(db, service))


# ---- users ----------------------------------------------------------------------------


@router.post("/{service_id}/join", response_model=WaitingEntryOut, status_code=status.HTTP_201_CREATED)
def join_queue(
    service_id: str,
    body: JoinQueueRequest,
    user: UserRecord | None = Depends(current_user),
    db: Session = Depends(get_db),
    store: Store = Depends(get_store),
):
    if body.user_id is not None:
        ensure_self(user, body.user_id)
    service = find_service(db, service_id)
    if not service.is_open:
        raise HTTPException(status.HTTP_409_CONFLICT, "This service is currently closed.")
    if body.user_id and find_user_visit(db, body.user_id):
        raise HTTPException(status.HTTP_409_CONFLICT, ACTIVE_VISIT)
    try:
        entry = add_entry(db, service, body.name, priority=body.priority, user_id=body.user_id)
        state = queue_state(db, service)
        db.commit()
    except IntegrityError:
        # Another request for the same user got in first (uq_queue_entries_user_active).
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, ACTIVE_VISIT)
    index = entry.position - 1
    with store.lock:
        notify_joined(db, service, entry, wait_minutes(service, index, state.serving is not None))
        refresh_positions(db, store, service, state.waiting)
    db.commit()
    return _waiting_out(service, state, index, entry)


@router.post("/{service_id}/leave", response_model=VisitOut)
def leave_queue(
    service_id: str,
    body: LeaveQueueRequest,
    user: UserRecord | None = Depends(current_user),
    db: Session = Depends(get_db),
    store: Store = Depends(get_store),
):
    if body.user_id is not None:
        ensure_self(user, body.user_id)
    service = find_service(db, service_id)
    state = queue_state(db, service, lock=True)
    serving = state.serving
    if body.user_id is not None:
        if serving and serving.user_id == body.user_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Your service has started. Please contact staff.")
        entry = next((e for e in state.waiting if e.user_id == body.user_id), None)
        if entry is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "You are not waiting in this queue.")
    else:
        if serving and serving.id == body.entry_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Your service has started. Please contact staff.")
        entry = state.waiting[_find_waiting(state, body.entry_id)]
    archive(db, entry, "left", service.name)

    def notify():
        forget(store, entry.id)
        notify_left(db, service, entry)

    _commit_and_notify(db, store, service, queue_state(db, service), notify)
    return entry


# ---- administrators -------------------------------------------------------------------


@router.post("/{service_id}/serve-next", response_model=ServingOut, dependencies=[Depends(require_admin)])
def serve_next(service_id: str, db: Session = Depends(get_db), store: Store = Depends(get_store)):
    """Finish the current visit, if any, and call the person at the front of the line."""
    service = find_service(db, service_id)
    state = queue_state(db, service, lock=True)
    if not state.waiting:
        raise HTTPException(status.HTTP_409_CONFLICT, "No one is waiting in this queue.")
    if state.serving:
        archive(db, state.serving, "served", service.name)
    entry = state.waiting[0]
    start_serving(db, entry)

    def notify():
        forget(store, entry.id)
        notify_now_serving(db, service, entry)

    _commit_and_notify(db, store, service, queue_state(db, service), notify)
    return _serving_out(entry)


@router.post("/{service_id}/complete", response_model=VisitOut, dependencies=[Depends(require_admin)])
def complete_current(service_id: str, db: Session = Depends(get_db)):
    """Mark the person being served as done without calling anyone else."""
    service = find_service(db, service_id)
    current = queue_state(db, service, lock=True).serving
    if current is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No one is being served right now.")
    archive(db, current, "served", service.name)
    db.commit()
    return current


@router.delete("/{service_id}/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def remove_entry(service_id: str, entry_id: str, db: Session = Depends(get_db), store: Store = Depends(get_store)):
    service = find_service(db, service_id)
    state = queue_state(db, service, lock=True)
    entry = state.waiting[_find_waiting(state, entry_id)]
    archive(db, entry, "removed", service.name)

    def notify():
        forget(store, entry.id)
        notify_removed(db, service, entry)

    _commit_and_notify(db, store, service, queue_state(db, service), notify)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{service_id}/entries/{entry_id}/move", response_model=QueueOut, dependencies=[Depends(require_admin)])
def move_entry(service_id: str, entry_id: str, body: MoveEntryRequest, db: Session = Depends(get_db), store: Store = Depends(get_store)):
    """Manual override: swap someone with the person directly ahead of or behind them."""
    service = find_service(db, service_id)
    state = queue_state(db, service, lock=True)
    index = _find_waiting(state, entry_id)
    target = index - 1 if body.direction == "up" else index + 1
    if not 0 <= target < len(state.waiting):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already at the {'front' if body.direction == 'up' else 'back'} of the queue.")
    queue = state.waiting
    queue[index].position, queue[target].position = queue[target].position, queue[index].position
    queue[index], queue[target] = queue[target], queue[index]
    _commit_and_notify(db, store, service, state)
    return _queue_out(service, state)
