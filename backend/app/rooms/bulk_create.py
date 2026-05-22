"""
Парсер строки диапазона номеров комнат.

Поддерживаемые форматы:
  1001-1020          — диапазон включительно
  1001,1002,1005     — список отдельных номеров
  1001-1010,1020-1030 — несколько диапазонов
  1001-1020,!1010    — диапазон с исключениями (префикс !)
"""

import re


def parse_room_range(s: str) -> list[int]:
    """Возвращает отсортированный список уникальных номеров комнат."""
    s = s.strip()
    if not s:
        raise ValueError("Строка диапазона не может быть пустой")

    numbers: set[int] = set()
    excluded: set[int] = set()

    parts = [p.strip() for p in s.split(",") if p.strip()]

    for part in parts:
        is_exclusion = part.startswith("!")
        if is_exclusion:
            part = part[1:].strip()

        if "-" in part:
            match = re.fullmatch(r"(\d+)-(\d+)", part)
            if not match:
                raise ValueError(f"Неверный формат диапазона: {part!r}")
            start, end = int(match.group(1)), int(match.group(2))
            if start > end:
                raise ValueError(f"Начало диапазона больше конца: {part!r}")
            if end - start > 10_000:
                raise ValueError(f"Диапазон слишком велик (макс. 10 000): {part!r}")
            rng = set(range(start, end + 1))
        else:
            if not re.fullmatch(r"\d+", part):
                raise ValueError(f"Неверный формат номера: {part!r}")
            rng = {int(part)}

        if is_exclusion:
            excluded |= rng
        else:
            numbers |= rng

    result = sorted(numbers - excluded)
    if not result:
        raise ValueError("Диапазон не содержит ни одного номера после применения исключений")

    for n in result:
        if n <= 0:
            raise ValueError(f"Номер комнаты должен быть > 0, получен: {n}")

    return result
