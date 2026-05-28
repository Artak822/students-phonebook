import pytest
from pydantic import ValidationError

from app.employees.schemas import EmployeeCreate


def _make_data(**kwargs):
    base = dict(
        fio="Иванов Иван",
        phone="+79991234567",
        group_id=1,
        birth_date="2000-01-01",
    )
    base.update(kwargs)
    return base


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("+79991234567", "+79991234567"),
        ("79991234567", "+79991234567"),
        ("89991234567", "+79991234567"),
        ("+7 (999) 123-45-67", "+79991234567"),
        ("8 (999) 123 45 67", "+79991234567"),
    ],
)
def test_phone_normalize(raw, expected):
    data = EmployeeCreate(**_make_data(phone=raw))
    assert data.phone == expected


@pytest.mark.parametrize("bad", ["1234", "not-a-phone", "+1234567890123"])
def test_phone_invalid(bad):
    with pytest.raises(ValidationError):
        EmployeeCreate(**_make_data(phone=bad))
