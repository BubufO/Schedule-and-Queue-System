"""In-memory data store for QueueSmart.

Stands in for a real database in this assignment. Everything lives in process memory, so
restarting the server resets all services and queues back to the seed data below.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock


@dataclass
class ServiceRecord:
    id: str
    name: str
    description: str
    duration_minutes: int
    priority: str
    is_open: bool
    ticket_prefix: str


@dataclass
class QueueEntryRecord:
    id: str
    service_id: str
    name: str
    ticket: str
    joined_at: datetime
    priority: str = "medium"
    # Set for signed-in users; None for guests who joined with a one-time link.
    user_id: str | None = None


@dataclass
class ServingRecord:
    entry: QueueEntryRecord
    started_at: datetime


@dataclass
class VisitRecord:
    """A finished visit, kept so users can see their history."""

    entry: QueueEntryRecord
    service_name: str
    ended_at: datetime
    outcome: str  # served | left | removed | cancelled


@dataclass
class NotificationRecord:
    id: str
    user_id: str
    type: str  # joined | left | removed | update | approaching | turn | service
    title: str
    message: str
    timestamp: datetime
    service_id: str | None = None
    old_position: int | None = None
    new_position: int | None = None
    read: bool = False


# Seed services, matching the ones the frontend was built against.
SEED_SERVICES: list[tuple[str, str, str, int, str, bool, str]] = [
    ("advising", "Academic Advising", "Meet with an advisor about degree plans, course selection, and graduation checks.", 20, "high", True, "A"),
    ("financial-aid", "Financial Aid", "Questions about FAFSA, scholarships, award letters, and disbursements.", 15, "high", True, "F"),
    ("it-help", "IT Help Desk", "Password resets, Wi-Fi access, and laptop troubleshooting.", 10, "medium", True, "T"),
    ("registrar", "Registrar Services", "Transcripts, enrollment verification, and records updates.", 10, "medium", True, "R"),
    ("id-office", "Student ID Office", "New or replacement student ID cards.", 5, "low", False, "S"),
    ("counseling", "Counseling Services", "Same-day check-ins and scheduling with a counselor.", 30, "high", True, "C"),
    ("career", "Career Center", "Resume reviews, mock interviews, and job search help.", 25, "medium", True, "K"),
    ("housing", "Housing Office", "Room assignments, maintenance requests, and move-in questions.", 15, "medium", True, "H"),
    ("parking", "Parking & Transportation", "Parking permits, citations, and shuttle passes.", 10, "low", True, "P"),
    ("library", "Library Help Desk", "Research help, study room bookings, and printing issues.", 10, "low", True, "L"),
    ("health", "Health Center Check-in", "Walk-in check-in for the campus health center.", 20, "high", False, "M"),
    ("international", "International Student Office", "Visa documents, travel signatures, and enrollment letters.", 20, "medium", True, "I"),
    ("bursar", "Student Accounts (Bursar)", "Tuition bills, payment plans, and refunds.", 15, "medium", True, "B"),
    ("tutoring", "Tutoring Center", "Drop-in tutoring for math, writing, and science courses.", 30, "low", True, "U"),
    ("rec-center", "Recreation Center Front Desk", "Memberships, equipment checkout, and locker rentals.", 5, "low", False, "W"),
    ("dean", "Dean of Students", "General student concerns and petitions.", 25, "medium", True, "D"),
]


# Seed queues: (name, minutes ago they joined, priority). Two high-priority visitors show
# priority ordering: they sit ahead of earlier arrivals with normal priority.
SEED_QUEUES: dict[str, list[tuple[str, int, str]]] = {
    "advising": [("Maria Gonzalez", 43, "medium"), ("James Carter", 38, "medium"), ("Priya Patel", 30, "medium"),
                 ("Daniel Kim", 27, "medium"), ("Aisha Johnson", 19, "high"), ("Luis Ramirez", 14, "medium")],
    "financial-aid": [("Emily Nguyen", 35, "medium"), ("Marcus Brown", 33, "medium"), ("Sofia Rossi", 25, "medium"),
                      ("Kevin Okafor", 12, "medium")],
    "it-help": [("Hannah Lee", 40, "medium"), ("Omar Haddad", 34, "medium"), ("Grace Thompson", 21, "medium"),
                ("Ethan Walker", 18, "medium"), ("Chloe Martin", 16, "medium"), ("Noah Davis", 10, "high"),
                ("Ava Wilson", 7, "medium"), ("Ryan Chen", 5, "medium")],
    "registrar": [("Isabella Garcia", 23, "medium"), ("Tyler Moore", 9, "medium")],
    "counseling": [("Jordan Price", 31, "medium"), ("Mia Hernandez", 15, "medium")],
    "career": [("Liam Foster", 37, "medium"), ("Zoe Bennett", 26, "medium"), ("Arjun Mehta", 11, "medium")],
    "housing": [("Olivia Scott", 24, "medium"), ("Diego Alvarez", 20, "medium"), ("Nora Ellis", 8, "medium"),
                ("Samuel Reed", 6, "medium"), ("Layla Hassan", 4, "medium")],
    "parking": [("Brandon Hughes", 12, "medium")],
    "international": [("Wei Zhang", 42, "medium"), ("Fatima Ali", 28, "medium"), ("Lucas Silva", 17, "medium")],
    "bursar": [("Ella Turner", 33, "medium"), ("Caleb Ward", 13, "medium")],
    "tutoring": [("Ivy Brooks", 39, "medium"), ("Mason Gray", 29, "medium"), ("Leah Cooper", 22, "medium"),
                 ("Owen Price", 15, "medium")],
    "dean": [("Harper Collins", 19, "medium")],
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Store:
    """Holds all application state. One instance is shared by every request."""

    def __init__(self, seed: bool = True) -> None:
        # Guards every read-modify-write so concurrent requests can't interleave.
        self.lock = Lock()
        # dicts keep insertion order, so services list in the order they were created.
        self.services: dict[str, ServiceRecord] = {}
        # Waiting entries per service, already in serving order (see app.queueing).
        self.queues: dict[str, list[QueueEntryRecord]] = {}
        # The person currently being served at each service, if any.
        self.now_serving: dict[str, ServingRecord] = {}
        # Finished visits, newest first.
        self.history: list[VisitRecord] = []
        # Notifications for each user, newest first
        self.notifications: list[NotificationRecord] = []   # newest first
        self.last_position: dict[str, int] = {}              # entry id -> last position we told them about
        self.approaching_notified: set[str] = set()          # entry ids already warned they're close
        # Shared counter for entry ids and ticket numbers.
        self.sequence = 100
        if seed:
            self._seed()

    def _seed(self) -> None:
        for id_, name, description, duration, priority, is_open, prefix in SEED_SERVICES:
            self.services[id_] = ServiceRecord(id_, name, description, duration, priority, is_open, prefix)
            self.queues[id_] = []

        from app.queueing import add_entry  # imported here to avoid a circular import

        now = utc_now()
        visitors = [
            (minutes_ago, service_id, name, priority)
            for service_id, people in SEED_QUEUES.items()
            for name, minutes_ago, priority in people
        ]
        # Add everyone in arrival order so tickets count up the way they would have live.
        for minutes_ago, service_id, name, priority in sorted(visitors, key=lambda v: -v[0]):
            add_entry(self, self.services[service_id], name, priority=priority,
                      joined_at=now - timedelta(minutes=minutes_ago))

    def next_sequence(self) -> int:
        self.sequence += 1
        return self.sequence


_store: Store | None = None


def get_store() -> Store:
    """FastAPI dependency returning the shared store. Tests override this with a fresh one."""
    global _store
    # Built on first use rather than at import time, so importing this module has no side effects.
    if _store is None:
        _store = Store()
    return _store
