import pytest

from app.rooms.bulk_create import parse_room_range


def test_simple_range():
    assert parse_room_range("1001-1005") == [1001, 1002, 1003, 1004, 1005]


def test_single_number():
    assert parse_room_range("1001") == [1001]


def test_comma_list():
    assert parse_room_range("1001,1003,1005") == [1001, 1003, 1005]


def test_multiple_ranges():
    result = parse_room_range("1001-1003,1010-1012")
    assert result == [1001, 1002, 1003, 1010, 1011, 1012]


def test_exclusion():
    result = parse_room_range("1001-1005,!1003")
    assert result == [1001, 1002, 1004, 1005]


def test_exclusion_range():
    result = parse_room_range("1001-1010,!1004-1006")
    assert result == [1001, 1002, 1003, 1007, 1008, 1009, 1010]


def test_deduplication():
    assert parse_room_range("1001,1001,1002") == [1001, 1002]


def test_sorted_output():
    result = parse_room_range("1010,1005,1001")
    assert result == [1001, 1005, 1010]


def test_empty_string_raises():
    with pytest.raises(ValueError, match="пустой"):
        parse_room_range("")


def test_invalid_format_raises():
    with pytest.raises(ValueError):
        parse_room_range("abc")


def test_reversed_range_raises():
    with pytest.raises(ValueError, match="больше конца"):
        parse_room_range("1010-1005")


def test_all_excluded_raises():
    with pytest.raises(ValueError, match="ни одного"):
        parse_room_range("1001,!1001")


def test_mixed_ranges_and_numbers():
    result = parse_room_range("1001-1003,1010,1020-1022")
    assert result == [1001, 1002, 1003, 1010, 1020, 1021, 1022]


def test_whitespace_handling():
    assert parse_room_range("  1001-1003  ") == [1001, 1002, 1003]
