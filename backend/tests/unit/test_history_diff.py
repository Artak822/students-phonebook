"""Unit tests for history diff logic (no DB required)."""
import asyncio

import pytest

from app.employees.history import TRACKED_FIELDS, record_update


class _FakeDB:
    def __init__(self):
        self.added = []

    def add(self, obj):
        self.added.append(obj)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_diff_generates_entry_per_changed_field():
    db = _FakeDB()
    run(record_update(db, 1, 42, {"fio": "Старый", "phone": "+71111111111"}, {"fio": "Новый", "phone": "+71111111111"}))
    assert len(db.added) == 1
    entry = db.added[0]
    assert entry.field_name == "fio"
    assert entry.old_value == "Старый"
    assert entry.new_value == "Новый"


def test_diff_no_entries_when_nothing_changed():
    db = _FakeDB()
    run(record_update(db, 1, 42, {"fio": "X"}, {"fio": "X"}))
    assert len(db.added) == 0


def test_diff_multiple_fields():
    db = _FakeDB()
    run(
        record_update(
            db, 1, 42,
            {"fio": "A", "notes": "old"},
            {"fio": "B", "notes": "new"},
        )
    )
    assert len(db.added) == 2
    fields = {e.field_name for e in db.added}
    assert fields == {"fio", "notes"}


def test_diff_ignores_photo():
    db = _FakeDB()
    run(record_update(db, 1, 42, {}, {"photo_url": "new.jpg"}))
    assert len(db.added) == 0
