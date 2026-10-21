"""In-memory data store for QueueSmart.

Stands in for a real database in this assignment. Everything lives in process memory, so
restarting the server resets all services and queues back to the seed data below.
"""

from dataclasses import dataclass
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


class Store:
    """Holds all application state. One instance is shared by every request."""

    def __init__(self, seed: bool = True) -> None:
        # Guards every read-modify-write so concurrent requests can't interleave.
        self.lock = Lock()
        # dicts keep insertion order, so services list in the order they were created.
        self.services: dict[str, ServiceRecord] = {}
        if seed:
            self._seed()

    def _seed(self) -> None:
        for id_, name, description, duration, priority, is_open, prefix in SEED_SERVICES:
            self.services[id_] = ServiceRecord(id_, name, description, duration, priority, is_open, prefix)


_store = Store()


def get_store() -> Store:
    """FastAPI dependency returning the shared store. Tests override this with a fresh one."""
    return _store
