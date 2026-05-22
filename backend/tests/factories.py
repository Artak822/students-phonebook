import factory

from app.admins.models import Admin
from app.core.security import hash_password
from app.roles.models import Role


class RoleFactory(factory.Factory):
    class Meta:
        model = Role

    name = factory.Sequence(lambda n: f"role_{n}")
    label = factory.Sequence(lambda n: f"Роль {n}")
    description = ""
    permissions = []
    is_system = False


class AdminFactory(factory.Factory):
    class Meta:
        model = Admin

    username = factory.Sequence(lambda n: f"admin_{n}")
    password_hash = factory.LazyFunction(lambda: hash_password("password123"))
    fio = factory.Sequence(lambda n: f"Администратор {n}")
    role_id = 1
    is_active = True
    password_changed = False
