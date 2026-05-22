# Центральный импорт всех моделей — регистрирует их в Base.metadata.
# Импортировать этот модуль везде где нужен полный Base.metadata:
# conftest.py, alembic/env.py, app/main.py

from app.admins.models import Admin  # noqa: F401
from app.audit.models import AuditLog  # noqa: F401
from app.employees.models import Employee, EmployeeChangeHistory  # noqa: F401
from app.groups.models import Group  # noqa: F401
from app.roles.models import Role  # noqa: F401
from app.rooms.models import Room  # noqa: F401
