"""Service Management module: create, update, list, and delete services.

Anyone can list services; only administrators can change them.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.queueing import archive
from app.schemas import ServiceCreate, ServiceOut, ServiceUpdate
from app.security import require_admin
from app.store import ServiceRecord, Store, get_store

router = APIRouter(prefix="/services", tags=["services"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "service"


def _unique_id(store: Store, name: str) -> str:
    # Readable ids double as the code in a service's join link, e.g. /join/it-help.
    base = _slugify(name)
    candidate, n = base, 2
    while candidate in store.services:
        candidate, n = f"{base}-{n}", n + 1
    return candidate


def _ensure_name_available(store: Store, name: str, exclude_id: str | None = None) -> None:
    taken = any(
        s.name.lower() == name.lower() and s.id != exclude_id for s in store.services.values()
    )
    if taken:
        raise HTTPException(status.HTTP_409_CONFLICT, f'A service named "{name}" already exists.')


def find_service(store: Store, service_id: str) -> ServiceRecord:
    service = store.services.get(service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'Service "{service_id}" was not found.')
    return service


@router.get("", response_model=list[ServiceOut])
def list_services(store: Store = Depends(get_store)):
    return list(store.services.values())


@router.get("/{service_id}", response_model=ServiceOut)
def get_service(service_id: str, store: Store = Depends(get_store)):
    return find_service(store, service_id)


@router.post("", response_model=ServiceOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin)])
def create_service(body: ServiceCreate, store: Store = Depends(get_store)):
    with store.lock:
        _ensure_name_available(store, body.name)
        service = ServiceRecord(
            id=_unique_id(store, body.name),
            name=body.name,
            description=body.description,
            duration_minutes=body.duration_minutes,
            priority=body.priority,
            # New services start closed so staff can review them before people join.
            is_open=False,
            ticket_prefix=body.name[0].upper() if body.name[0].isalnum() else "Q",
        )
        store.services[service.id] = service
        return service


@router.patch("/{service_id}", response_model=ServiceOut, dependencies=[Depends(require_admin)])
def update_service(service_id: str, body: ServiceUpdate, store: Store = Depends(get_store)):
    with store.lock:
        service = find_service(store, service_id)
        changes = body.model_dump(exclude_unset=True)
        if "name" in changes:
            _ensure_name_available(store, changes["name"], exclude_id=service_id)
        for field, value in changes.items():
            setattr(service, field, value)
        return service


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_service(service_id: str, store: Store = Depends(get_store)):
    with store.lock:
        find_service(store, service_id)
        # Anyone still waiting or being served has their visit cancelled.
        serving = store.now_serving.pop(service_id, None)
        for entry in ([serving.entry] if serving else []) + store.queues.pop(service_id, []):
            archive(store, entry, "cancelled")
        del store.services[service_id]
    return Response(status_code=status.HTTP_204_NO_CONTENT)
