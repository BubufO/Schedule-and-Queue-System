"""Queue Management module.

Users join and leave a service's queue. Administrators view the queue, serve the next
person, and can remove or reorder people. Waiting lists are kept in serving order: priority
first, then arrival (see app.queueing).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.queueing import add_entry, archive, find_user_visit, wait_minutes
from app.routers.services import find_service
from app.notifications import forget, notify_joined, notify_left, notify_now_serving, refresh_positions #hook the triggers
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
from app.store import QueueEntryRecord, ServiceRecord, ServingRecord, Store, VisitRecord, get_store, utc_now

router = APIRouter(prefix="/queues", tags=["queues"])


# ---- response builders ----------------------------------------------------------------


def _entry_out(entry: QueueEntryRecord) -> dict:
    return QueueEntryOut.model_validate(entry).model_dump()


def _waiting_out(store: Store, service: ServiceRecord, index: int, entry: QueueEntryRecord) -> WaitingEntryOut:
    return WaitingEntryOut(
        **_entry_out(entry),
        position=index + 1,
        estimated_wait_minutes=wait_minutes(store, service, index),
    )


def _serving_out(serving: ServingRecord | None) -> ServingOut | None:
    if serving is None:
        return None
    return ServingOut(entry=QueueEntryOut.model_validate(serving.entry), started_at=serving.started_at)


def _queue_out(store: Store, service: ServiceRecord) -> QueueOut:
    queue = store.queues.get(service.id, [])
    return QueueOut(
        service_id=service.id,
        service_name=service.name,
        is_open=service.is_open,
        waiting=[_waiting_out(store, service, i, e) for i, e in enumerate(queue)],
        now_serving=_serving_out(store.now_serving.get(service.id)),
        estimated_wait_minutes=wait_minutes(store, service, len(queue)),
    )


def _visit_out(visit: VisitRecord) -> VisitOut:
    return VisitOut(
        **_entry_out(visit.entry),
        service_name=visit.service_name,
        ended_at=visit.ended_at,
        outcome=visit.outcome,
    )


def _find_waiting(store: Store, service_id: str, entry_id: str) -> tuple[int, QueueEntryRecord]:
    for index, entry in enumerate(store.queues.get(service_id, [])):
        if entry.id == entry_id:
            return index, entry
    raise HTTPException(status.HTTP_404_NOT_FOUND, "That person is not waiting in this queue.")


# ---- viewing --------------------------------------------------------------------------


@router.get("", response_model=list[QueueOut])
def list_queues(store: Store = Depends(get_store)):
    """Every service's queue, for dashboards that show all of them at once."""
    with store.lock:
        return [_queue_out(store, s) for s in store.services.values()]


@router.get("/history", response_model=list[VisitOut])
def visit_history(
    user_id: str = Query(alias="userId", min_length=1, max_length=ID_MAX),
    store: Store = Depends(get_store),
):
    """A user's finished visits, newest first."""
    with store.lock:
        return [_visit_out(v) for v in store.history if v.entry.user_id == user_id]


@router.get("/{service_id}", response_model=QueueOut)
def view_queue(service_id: str, store: Store = Depends(get_store)):
    with store.lock:
        return _queue_out(store, find_service(store, service_id))


# ---- users ----------------------------------------------------------------------------


@router.post("/{service_id}/join", response_model=WaitingEntryOut, status_code=status.HTTP_201_CREATED)
def join_queue(service_id: str, body: JoinQueueRequest, store: Store = Depends(get_store)):
    with store.lock:
        service = find_service(store, service_id)
        if not service.is_open:
            raise HTTPException(status.HTTP_409_CONFLICT, "This service is currently closed.")
        if body.user_id and find_user_visit(store, body.user_id):
            raise HTTPException(status.HTTP_409_CONFLICT, "You already have an active queue visit.")
        entry = add_entry(store, service, body.name, priority=body.priority, user_id=body.user_id)
        index = store.queues[service.id].index(entry)
        notify_joined(store, service, entry, wait_minutes(store, service, index))
        refresh_positions(store, service)
        return _waiting_out(store, service, index, entry)


@router.post("/{service_id}/leave", response_model=VisitOut)
def leave_queue(service_id: str, body: LeaveQueueRequest, store: Store = Depends(get_store)):
    with store.lock:
        service = find_service(store, service_id)
        serving = store.now_serving.get(service_id)
        if body.user_id is not None:
            if serving and serving.entry.user_id == body.user_id:
                raise HTTPException(status.HTTP_409_CONFLICT, "Your service has started. Please contact staff.")
            match = next(
                (e for e in store.queues.get(service_id, []) if e.user_id == body.user_id), None
            )
            if match is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "You are not waiting in this queue.")
            entry = match
        else:
            if serving and serving.entry.id == body.entry_id:
                raise HTTPException(status.HTTP_409_CONFLICT, "Your service has started. Please contact staff.")
            _, entry = _find_waiting(store, service_id, body.entry_id)
        store.queues[service_id].remove(entry)
        forget(store, entry.id)
        archive(store, entry, "left")
        notify_left(store, service, entry)
        refresh_positions(store, service)
        return _visit_out(store.history[0])


# ---- administrators -------------------------------------------------------------------


@router.post("/{service_id}/serve-next", response_model=ServingOut)
def serve_next(service_id: str, store: Store = Depends(get_store)):
    """Finish the current visit, if any, and call the person at the front of the line."""
    with store.lock:
        service = find_service(store, service_id)
        queue = store.queues.get(service_id, [])
        if not queue:
            raise HTTPException(status.HTTP_409_CONFLICT, "No one is waiting in this queue.")
        current = store.now_serving.pop(service_id, None)
        if current:
            archive(store, current.entry, "served")
        serving = ServingRecord(entry=queue.pop(0), started_at=utc_now())
        store.now_serving[service_id] = serving
        forget(store, serving.entry.id)
        notify_now_serving(store, service, serving.entry)
        refresh_positions(store, service)
        return _serving_out(serving)


@router.post("/{service_id}/complete", response_model=VisitOut)
def complete_current(service_id: str, store: Store = Depends(get_store)):
    """Mark the person being served as done without calling anyone else."""
    with store.lock:
        find_service(store, service_id)
        current = store.now_serving.pop(service_id, None)
        if current is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No one is being served right now.")
        archive(store, current.entry, "served")
        return _visit_out(store.history[0])


@router.delete("/{service_id}/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_entry(service_id: str, entry_id: str, store: Store = Depends(get_store)):
    with store.lock:
        service = find_service(store, service_id)
        _, entry = _find_waiting(store, service_id, entry_id)
        store.queues[service_id].remove(entry)
        forget(store, entry.id)
        archive(store, entry, "removed")
        refresh_positions(store, service)  
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{service_id}/entries/{entry_id}/move", response_model=QueueOut)
def move_entry(service_id: str, entry_id: str, body: MoveEntryRequest, store: Store = Depends(get_store)):
    """Manual override: swap someone with the person directly ahead of or behind them."""
    with store.lock:
        service = find_service(store, service_id)
        index, _ = _find_waiting(store, service_id, entry_id)
        queue = store.queues[service_id]
        target = index - 1 if body.direction == "up" else index + 1
        if not 0 <= target < len(queue):
            raise HTTPException(status.HTTP_409_CONFLICT, f"Already at the {'front' if body.direction == 'up' else 'back'} of the queue.")
        queue[index], queue[target] = queue[target], queue[index]
        refresh_positions(store, service)
        return _queue_out(store, service)
