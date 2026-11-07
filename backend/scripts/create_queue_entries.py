"""Create public.queue_entries (and its id sequence) from app.models.QueueEntry.

Uses DATABASE_URL from backend/.env. Safe to run more than once: existing tables are left
alone, and it never changes services, queues or any other table.

    python scripts/create_queue_entries.py                  # create the table only
    python scripts/create_queue_entries.py --seed-visitors  # also add demo visitors
"""

import argparse
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.database import Base, get_engine  # noqa: E402
from app.models import QueueEntry, Service, queue_entry_seq  # noqa: E402
from app.queueing import add_entry  # noqa: E402
from app.store import SEED_QUEUES, utc_now  # noqa: E402


def create_table() -> None:
    engine = get_engine()
    queue_entry_seq.create(engine, checkfirst=True)
    Base.metadata.create_all(engine, tables=[QueueEntry.__table__], checkfirst=True)
    print("public.queue_entries is ready.")


def seed_visitors() -> None:
    with Session(get_engine()) as db:
        if db.scalar(select(func.count()).select_from(QueueEntry)):
            print("queue_entries already has rows; skipping demo visitors.")
            return
        now = utc_now()
        visitors = sorted(
            ((minutes_ago, service_id, name, priority)
             for service_id, people in SEED_QUEUES.items()
             for name, minutes_ago, priority in people),
            key=lambda v: -v[0],  # arrival order, so tickets count up as they would have live
        )
        added = 0
        for minutes_ago, service_id, name, priority in visitors:
            service = db.get(Service, service_id)
            if service is None or service.queue is None:
                print(f"  skipped {name}: service '{service_id}' has no queue row")
                continue
            add_entry(db, service, name, priority=priority, joined_at=now - timedelta(minutes=minutes_ago))
            added += 1
        db.commit()
    print(f"Added {added} demo visitors.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed-visitors", action="store_true", help="insert demo visitors if the table is empty")
    args = parser.parse_args()
    create_table()
    if args.seed_visitors:
        seed_visitors()
