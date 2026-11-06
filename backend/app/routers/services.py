"""Service Management module: create, update, list, and delete services.

Services are stored in the services table in Supabase. Anyone can list services; only
administrators can change them.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Service
from app.queueing import archive
from app.schemas import ServiceCreate, ServiceOut, ServiceUpdate
from app.security import require_admin
from app.store import Store, get_store

router = APIRouter(prefix="/services", tags=["services"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "service"


def _unique_id(db: Session, name: str) -> str:
    # Readable ids double as the code in a service's join link, e.g. /join/it-help.
    base = _slugify(name)
    candidate, n = base, 2
    while db.get(Service, candidate) is not None:
        candidate, n = f"{base}-{n}", n + 1
    return candidate


def _ensure_name_available(db: Session, name: str, exclude_id: str | None = None) -> None:
    query = select(Service.id).where(func.lower(Service.name) == name.lower())
    if exclude_id is not None:
        query = query.where(Service.id != exclude_id)
    if db.scalar(query) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f'A service named "{name}" already exists.')


def _commit(db: Session, name: str | None = None) -> None:
    """Commit, turning a unique-constraint violation into a 409 instead of a server error."""
    try:
        db.commit()
    except IntegrityError:
        # Another request saved the same name between our check and this commit.
        db.rollback()
        detail = f'A service named "{name}" already exists.' if name else "That change conflicts with an existing service."
        raise HTTPException(status.HTTP_409_CONFLICT, detail)


def find_service(db: Session, service_id: str) -> Service:
    service = db.get(Service, service_id)
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'Service "{service_id}" was not found.')
    return service


def all_services(db: Session) -> list[Service]:
    return list(db.scalars(select(Service).order_by(Service.name)))


@router.get("", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db)):
    return all_services(db)


@router.get("/{service_id}", response_model=ServiceOut)
def get_service(service_id: str, db: Session = Depends(get_db)):
    return find_service(db, service_id)


@router.post("", response_model=ServiceOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_admin)])
def create_service(body: ServiceCreate, db: Session = Depends(get_db)):
    _ensure_name_available(db, body.name)
    service = Service(
        id=_unique_id(db, body.name),
        name=body.name,
        description=body.description,
        duration_minutes=body.duration_minutes,
        priority=body.priority,
        # New services start closed so staff can review them before people join.
        is_open=False,
        ticket_prefix=body.name[0].upper() if body.name[0].isalnum() else "Q",
    )
    db.add(service)
    _commit(db, body.name)
    return service


@router.patch("/{service_id}", response_model=ServiceOut, dependencies=[Depends(require_admin)])
def update_service(service_id: str, body: ServiceUpdate, db: Session = Depends(get_db)):
    service = find_service(db, service_id)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes:
        _ensure_name_available(db, changes["name"], exclude_id=service_id)
    for field, value in changes.items():
        setattr(service, field, value)
    _commit(db, changes.get("name"))
    return service


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_service(service_id: str, db: Session = Depends(get_db), store: Store = Depends(get_store)):
    service = find_service(db, service_id)
    name = service.name
    db.delete(service)
    db.commit()
    with store.lock:
        # Anyone still waiting or being served has their visit cancelled.
        serving = store.now_serving.pop(service_id, None)
        for entry in ([serving.entry] if serving else []) + store.queues.pop(service_id, []):
            archive(store, entry, "cancelled", name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
