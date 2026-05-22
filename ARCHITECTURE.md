# Архитектура CRM АСПиРС — MVP №1

## Контекст

Система управления студенческим общежитием. Переписывается с нуля взамен старой версии (монолит Flask + SQLite с архитектурными и security-проблемами).

Доступ к системе — **только из корпоративной сети**, из публичного интернета сервис не выставляется. Это позволяет упростить часть мер безопасности, но не отменяет защиту от внутренних угроз (хэширование паролей, проверка прав на каждом эндпоинте, HttpOnly cookies).

---

## Scope MVP №1

### Что входит

| Функция | Описание |
|---|---|
| Авторизация | JWT в HttpOnly cookies + refresh, принудительная смена пароля при первом входе |
| Управление администраторами | CRUD: логин, ФИО, роль, активность; автогенерация стартового пароля |
| Управление ролями | CRUD кастомных ролей с гранулярными permissions; системные роли защищены от удаления |
| Группы — справочник | CRUD групп; группа обязательна у каждого студента |
| Студенты — CRUD | Карточка: ФИО, телефон, группа, дата рождения, фото, заметки, привязка к комнате |
| История изменений | Полный лог изменений каждого поля карточки |
| Комнаты — CRUD | Корпус / подъезд / номер / вместимость, привязка студентов |
| Массовое создание комнат | Двухшаговый мастер с редактируемой таблицей вместимостей |
| Загрузка фото студента | S3-совместимое хранилище |

### Что НЕ входит в MVP №1

Откладываются на следующие итерации:

- Telegram-бот (регистрация студентов, оплата, бельё)
- Импорт студентов из Excel
- Экспорт данных
- Кастомные колонки в карточке студента
- Представители / несовершеннолетние (модуль «представители»)
- Постельное бельё (периоды, QR, скан, отчёт)
- Оплата проживания (чеки, аудит, напоминания)
- Мероприятия и посещаемость
- Рассылки через Telegram

---

## Стек

### Backend
- **Python 3.12+**
- **FastAPI** — HTTP API, DI для авторизации, автодокументация
- **SQLAlchemy 2.x (async)** — ORM через `asyncpg`
- **Alembic** — миграции схемы
- **PostgreSQL 16** — основная БД
- **Redis** — refresh-токены, rate limiting
- **Pydantic v2** — валидация и схемы ответов
- **bcrypt** — хэширование паролей

### Frontend
- **Next.js 14 (App Router)** — SPA/SSR
- **TypeScript**
- **TanStack Query (React Query)** — кэш и синхронизация с API
- **React Hook Form + Zod** — формы и клиентская валидация
- **react-imask** (или аналог) — маска ввода телефона

### Инфраструктура
- **Docker + Docker Compose** (dev)
- **Nginx** — reverse proxy, раздача статики
- **S3-совместимое хранилище** (MinIO self-hosted или облако) — фото студентов

---

## Структура проекта

Backend и frontend организованы **по модулям/фичам**, а не по слоям.

```
/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, lifespan
│   │   ├── config.py            # pydantic-settings
│   │   ├── database.py          # async engine, session factory
│   │   ├── cli.py               # CLI (create-superadmin, ...)
│   │   │
│   │   ├── core/
│   │   │   ├── security.py      # bcrypt, JWT encode/decode
│   │   │   ├── permissions.py   # require_permission, проверка прав
│   │   │   ├── exceptions.py    # HTTP-исключения
│   │   │   └── dependencies.py  # get_db, get_current_admin
│   │   │
│   │   ├── auth/
│   │   │   ├── router.py        # /api/auth/*
│   │   │   ├── service.py       # бизнес-логика
│   │   │   ├── schemas.py
│   │   │   └── rate_limit.py    # Redis rate limiter
│   │   │
│   │   ├── admins/
│   │   │   ├── models.py        # Admin (SQLAlchemy)
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   └── schemas.py
│   │   │
│   │   ├── roles/
│   │   │   ├── models.py        # Role
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   └── seed.py          # системные роли при первой миграции
│   │   │
│   │   ├── groups/
│   │   │   ├── models.py        # Group
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   └── schemas.py
│   │   │
│   │   ├── employees/
│   │   │   ├── models.py        # Employee, EmployeeChangeHistory
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   └── history.py       # запись изменений в лог
│   │   │
│   │   └── rooms/
│   │       ├── models.py        # Room
│   │       ├── router.py
│   │       ├── service.py
│   │       ├── schemas.py
│   │       └── bulk_create.py   # мастер пачкой
│   │
│   ├── alembic/                 # миграции
│   └── tests/
│       ├── conftest.py
│       ├── auth/
│       ├── admins/
│       ├── employees/
│       └── rooms/
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── change-password/
│   │   ├── dashboard/
│   │   ├── students/
│   │   │   ├── page.tsx             # список
│   │   │   ├── new/page.tsx         # создание
│   │   │   └── [id]/
│   │   │       ├── page.tsx         # просмотр/редактирование
│   │   │       └── history/page.tsx # история изменений
│   │   ├── rooms/
│   │   │   ├── page.tsx
│   │   │   └── bulk-create/page.tsx # мастер пачкой
│   │   ├── admins/
│   │   └── roles/
│   ├── components/
│   │   ├── ui/                  # базовые: Button, Input, Modal, ...
│   │   ├── students/
│   │   └── rooms/
│   └── lib/
│       ├── api/
│       │   ├── client.ts        # fetch wrapper
│       │   ├── auth.ts
│       │   ├── students.ts
│       │   └── rooms.ts
│       ├── hooks/               # React Query хуки
│       └── utils/
│
├── docker-compose.yml
└── nginx/
```

### Архитектурные принципы

- **Тонкие роутеры, толстые сервисы.** Роутер только парсит HTTP, проверяет права через DI, дёргает сервис, возвращает ответ. Бизнес-логика — в `service.py`.
- **Сервисы — простые функции**, не классы. `AsyncSession` передаётся параметром (не дёргается из DI внутри сервиса).
- **Pydantic-схемы отделены от ORM-моделей.** Никаких `from_attributes=True` на ORM-классах напрямую — отдельные `Read`/`Create`/`Update` схемы.
- **Permissions проверяются через DI** — `Depends(require_permission("employees:edit"))`. Никакой дублирующей проверки в теле эндпоинтов.

---

## Схема базы данных

Финальный SQL для PostgreSQL 16. Используется как референс — фактически миграции пишутся через Alembic.

```sql
-- =========================================================
-- Роли и системные права
-- =========================================================

CREATE TABLE roles (
    id           SERIAL PRIMARY KEY,
    name         TEXT UNIQUE NOT NULL,         -- 'super_admin', 'tutor', 'placement' или кастомное
    label        TEXT NOT NULL,                -- отображаемое в UI ("Воспитатель")
    description  TEXT DEFAULT '',
    permissions  JSONB NOT NULL DEFAULT '[]',  -- массив строк ["employees:view", ...]
    is_system    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_roles_name ON roles (name);

-- =========================================================
-- Администраторы
-- =========================================================

CREATE TABLE admins (
    id                SERIAL PRIMARY KEY,
    username          TEXT UNIQUE NOT NULL,
    password_hash     TEXT NOT NULL,
    fio               TEXT NOT NULL,
    role_id           INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    password_changed  BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE после первой смены
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admins_username ON admins (username);
CREATE INDEX idx_admins_role_id  ON admins (role_id);

-- =========================================================
-- Комнаты
-- =========================================================

CREATE TABLE rooms (
    id           SERIAL PRIMARY KEY,
    building     INTEGER NOT NULL CHECK (building > 0),
    entrance     INTEGER NOT NULL CHECK (entrance > 0),
    room_number  INTEGER NOT NULL CHECK (room_number > 0),
    capacity     INTEGER NOT NULL CHECK (capacity > 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rooms_address UNIQUE (building, entrance, room_number)
);

-- =========================================================
-- Группы (справочник)
-- =========================================================

CREATE TABLE groups (
    id          SERIAL PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_groups_name ON groups (name);

-- =========================================================
-- Студенты
-- =========================================================

CREATE TABLE employees (
    id          SERIAL PRIMARY KEY,
    fio         TEXT NOT NULL,
    phone       TEXT NOT NULL CHECK (phone ~ '^\+7\d{10}$'),  -- E.164, только RU
    group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
    birth_date  DATE NOT NULL CHECK (
        birth_date <= CURRENT_DATE
        AND birth_date >= CURRENT_DATE - INTERVAL '100 years'
    ),
    photo_url   TEXT,                                          -- S3 key, NULL если фото нет
    room_id     INTEGER REFERENCES rooms(id) ON DELETE RESTRICT,  -- NULL = не заселён
    notes       TEXT NOT NULL DEFAULT '',
    deleted_at  TIMESTAMPTZ,                                   -- NULL = активен (soft delete)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_room_id    ON employees (room_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_group_id   ON employees (group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_fio        ON employees (fio)      WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_deleted_at ON employees (deleted_at);

-- =========================================================
-- История изменений карточек студентов (построчно)
-- =========================================================

CREATE TABLE employee_change_history (
    id           BIGSERIAL PRIMARY KEY,
    employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    admin_id     INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    action       TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    field_name   TEXT,             -- NULL для action='create'/'delete' (общая запись)
    old_value    TEXT,
    new_value    TEXT,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ech_employee_id ON employee_change_history (employee_id, changed_at DESC);
CREATE INDEX idx_ech_admin_id    ON employee_change_history (admin_id);

-- =========================================================
-- Seed: системные роли
-- =========================================================

INSERT INTO roles (name, label, description, permissions, is_system) VALUES
('super_admin', 'Суперадминистратор', 'Полные права во всей системе',
 '["employees:view","employees:edit","employees:delete","employees:assign_room",
   "rooms:view","rooms:manage","admins:manage","roles:manage","history:view"]'::jsonb,
 TRUE),

('tutor', 'Воспитатель', 'Работает со студентами и просматривает комнаты',
 '["employees:view","employees:edit","employees:assign_room",
   "rooms:view","history:view"]'::jsonb,
 TRUE),

('placement', 'Сотрудник размещения', 'Управляет комнатами и заселением',
 '["employees:view","employees:assign_room",
   "rooms:view","rooms:manage","history:view"]'::jsonb,
 TRUE);

-- =========================================================
-- Аудит действий администраторов
-- =========================================================

CREATE TABLE audit_log (
    id             BIGSERIAL PRIMARY KEY,
    timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event          TEXT NOT NULL,                           -- 'auth.login.success', 'admin.created', ...
    actor_id       INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    actor_username TEXT,                                    -- денормализация: сохраняется даже если admin удалён
    target_type    TEXT,                                    -- 'admin', 'role', ...
    target_id      INTEGER,
    ip             TEXT,
    request_id     TEXT,
    details        JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_audit_log_actor_ts ON audit_log (actor_id, timestamp DESC);
CREATE INDEX idx_audit_log_ts       ON audit_log (timestamp DESC);
CREATE INDEX idx_audit_log_event    ON audit_log (event);
```

### Особенности схемы

- **Soft delete студентов** через `deleted_at`. Все списочные запросы фильтруют `WHERE deleted_at IS NULL`. Частичные индексы это учитывают.
- **Дата рождения** — обязательная; CHECK гарантирует «не в будущем и не старше 100 лет».
- **Телефон** — обязательный, формат E.164 (только RU: `+7XXXXXXXXXX`), проверка через regex CHECK. Дубли допускаются (общий семейный номер).
- **Комната у студента** — `room_id` FK с `ON DELETE RESTRICT`. Нельзя удалить комнату, пока в ней есть студенты.
- **Корпус / подъезд / номер** — все `INTEGER`, только положительные. Никаких ограничений по количеству цифр (универсальность для разных общежитий).
- **Группа студента** — отдельная таблица-справочник `groups`. `employees.group_id` обязательный FK с `ON DELETE RESTRICT`: пока в группе есть студенты, её нельзя удалить.
- **Permissions хранятся как JSONB-массив строк** в `roles.permissions`. Проверка прав — оператор JSONB `@>` или загрузка в Python set.
- **История изменений** — построчно (одна запись = одно поле). `action='create'`/`'delete'` — общая запись с `field_name = NULL`; `action='update'` — отдельная запись на каждое изменённое поле. Смена фото в историю не пишется.
- **Аудит действий админов** (`audit_log`) — параллельная история для привилегированных событий (auth, управление админами и ролями). `actor_id` `ON DELETE SET NULL` + денормализованный `actor_username` сохраняют запись даже после удаления автора. Подробнее — раздел «Логирование и аудит».

### Что НЕ создаётся в MVP №1

Таблицы для отложенных функций (создаются миграциями в следующих итерациях):

- `custom_columns`, поле `employees.extra_data` — кастомные колонки карточки
- `employee_minor_representatives` — представители несовершеннолетних
- `tg_users` — привязка Telegram-аккаунтов
- `bed_linen_dates`, `bed_linen_scans` — постельное бельё
- `dormitory_payments` — оплата проживания
- `events` — мероприятия

---

## Миграции / Alembic

Схема описана в этом документе как SQL, но в коде источник истины — SQLAlchemy-модели в `*/models.py`. Миграции генерируем через `alembic revision --autogenerate`, **но никогда не применяем сгенерированный файл не глядя.** У autogenerate есть слепые зоны, и часть нашей схемы попадает прямо в них.

### Что autogenerate подхватывает корректно

- `CREATE TABLE` / `DROP TABLE`
- Колонки: тип, `NOT NULL`, простые `DEFAULT`
- Обычные индексы и `UNIQUE`-индексы
- Foreign keys — **только если** в модели явно указан `ondelete=...`
- `PRIMARY KEY`, `SERIAL` / `IDENTITY`

### Что нужно прописывать в модели руками, иначе autogenerate промахнётся

| Конструкция из SQL | Декларация в модели |
|---|---|
| `... REFERENCES groups(id) ON DELETE RESTRICT` | `ForeignKey("groups.id", ondelete="RESTRICT")` — без `ondelete=` опция потеряется |
| `CREATE INDEX ... WHERE deleted_at IS NULL` (partial index) | `Index("idx_...", "col", postgresql_where=text("deleted_at IS NULL"))` |
| `CHECK (...)` constraints | `CheckConstraint("...", name="...")` в `__table_args__` |
| `JSONB NOT NULL DEFAULT '{}'::jsonb` | `Column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))` |
| `UNIQUE` constraint vs `UNIQUE INDEX` | Alembic иногда путает форму — diff будет шумным, но на функциональность не влияет |

### Что autogenerate НЕ видит — только руками в файле миграции

- **Seed-данные** — дефолтные роли (`super_admin`, `admin`, `viewer`) заливаются через `op.bulk_insert(...)` в отдельной миграции.
- **Расширения** — `CREATE EXTENSION IF NOT EXISTS ...` через `op.execute(...)`.
- **Триггеры, функции, views, materialized views** — игнорируются полностью.
- **Добавление значений в ENUM** (`ALTER TYPE ... ADD VALUE`) — Alembic не замечает, БД отвалится при применении пустой миграции.
- **Переименования таблиц/колонок** — autogenerate видит как `drop + create`, что = **потеря данных**. Всегда вручную править на `op.alter_column(..., new_column_name=...)` / `op.rename_table(...)`.

### Настройка `env.py`

```python
context.configure(
    connection=connection,
    target_metadata=target_metadata,
    compare_type=True,            # видеть изменения типов колонок
    compare_server_default=True,  # видеть изменения server_default
    include_schemas=False,
    render_as_batch=False,        # PG, batch не нужен
)
```

### Workflow

1. Описываем модель, не забывая `ondelete=`, `postgresql_where=`, `CheckConstraint`, `server_default=text(...)`.
2. `alembic revision --autogenerate -m "..."`.
3. **Открываем сгенерированный файл и сверяем с SQL** из этого документа.
4. Правим переименования на `alter_column` / `rename_table`.
5. Seed-данные, расширения, триггеры — отдельные ручные миграции.

### Применительно к текущей схеме

Точки, где без явных декларации autogenerate точно промахнётся:

- `employees.group_id` — `ForeignKey("groups.id", ondelete="RESTRICT")`.
- `idx_employees_group_id ... WHERE deleted_at IS NULL` — `postgresql_where=text("deleted_at IS NULL")`.
- Все остальные partial-индексы на soft-delete колонках — то же.
- Сидинг системных ролей и `permissions_template` — отдельная ручная миграция, после создания таблиц.

---

## Permissions

Плоский список строк формата `<ресурс>:<действие>`. Хранятся в `roles.permissions` как JSONB-массив.

| Permission | Что разрешает |
|---|---|
| `employees:view` | Видеть карточки студентов и список |
| `employees:edit` | Создавать и редактировать карточки (создание входит в edit) |
| `employees:delete` | Soft delete карточки |
| `employees:assign_room` | Менять `room_id` у студента (отдельно от edit) |
| `rooms:view` | Видеть список комнат |
| `rooms:manage` | Создавать, редактировать, удалять комнаты |
| `admins:manage` | Управлять администраторами (CRUD) |
| `roles:manage` | Управлять ролями (CRUD кастомных, права системных нельзя менять) |
| `history:view` | Видеть историю изменений карточки студента |

### Системные роли

| Permission | super_admin | tutor | placement |
|---|:---:|:---:|:---:|
| `employees:view` | ✓ | ✓ | ✓ |
| `employees:edit` | ✓ | ✓ | — |
| `employees:delete` | ✓ | — | — |
| `employees:assign_room` | ✓ | ✓ | ✓ |
| `rooms:view` | ✓ | ✓ | ✓ |
| `rooms:manage` | ✓ | — | ✓ |
| `admins:manage` | ✓ | — | — |
| `roles:manage` | ✓ | — | — |
| `history:view` | ✓ | ✓ | ✓ |

**Правила:**
- `is_system = TRUE` нельзя удалить и нельзя редактировать их permissions через UI
- Кастомные роли создаются через UI (`POST /api/roles`) и могут иметь любой подмножеством permissions
- Любой админ привязан ровно к одной роли
- В системе обязательно должен существовать хотя бы один админ с ролью `super_admin`

---

## Авторизация

### Модель

- **Access token** — JWT в HttpOnly cookie, TTL **30 минут**. Содержит `admin_id`, `exp`. БД при каждом запросе не дёргается — токен проверяется криптографически.
- **Refresh token** — случайная строка в HttpOnly cookie, TTL **30 дней**. Хранится в Redis как хэш + admin_id.

### Хранение refresh в Redis

```
refresh:<token_hash> → {
    admin_id: int,
    expires_at: timestamp
}

admin_refresh:<admin_id> → SET[token_hash, ...]   # для быстрого "выйти со всех"
```

### Параметры

| Параметр | Значение |
|---|---|
| Access TTL | 30 минут |
| Refresh TTL | 30 дней |
| Одновременных сессий на админа | без ограничений; UI «мои сессии» НЕ делаем |
| Поведение при смене пароля | инвалидируются все refresh-токены админа, кроме текущей сессии |
| Rate limit на `/auth/login` | 10 попыток / 5 минут на IP (Redis); блокировки аккаунта НЕТ |
| Хэширование паролей | bcrypt |
| HTTPS | желателен (рекомендуется), не критичен в закрытой сети |
| Атрибуты cookies | `HttpOnly; Secure; SameSite=Lax`. Подробнее — раздел «Безопасность: CORS, CSRF, cookies» |

### Принудительная смена пароля при первом входе

- При создании любого админа ставится `password_changed = FALSE`
- При создании через UI пароль генерируется автоматически (16 случайных символов), показывается один раз с кнопкой «Скопировать»
- При создании через CLI пароль вводится владельцем интерактивно
- При логине с `password_changed = FALSE` API возвращает токены + `must_change_password: true`
- Middleware/dependency блокирует все эндпоинты, кроме `/auth/change-password` и `/auth/logout`, возвращая 403 с кодом `PASSWORD_CHANGE_REQUIRED`
- После успешной смены пароля флаг становится TRUE и все эндпоинты разблокируются

Требования к новому паролю при смене:
- Минимум 8 символов
- Не равен старому
- Других ограничений нет

### Создание первого super_admin

Только через CLI:

```bash
docker compose run backend python -m app.cli create-superadmin --username root
# пароль запрашивается интерактивно, не сохраняется ни в файлах, ни в логах
```

Никаких дефолтных паролей в миграциях, никаких `INITIAL_ADMIN_*` в `.env`. Если в БД нет ни одного админа — логин невозможен, нужно запустить CLI.

CLI также используется для восстановления доступа, если super_admin потерял пароль.

### Использование в роутере

```python
@router.delete("/api/employees/{emp_id}")
async def delete_employee(
    emp_id: int,
    admin: Admin = Depends(require_permission("employees:delete")),
    db: AsyncSession = Depends(get_db),
):
    await employees_service.soft_delete(db, emp_id, by_admin=admin)
    return {"ok": True}
```

---

## API — основные эндпоинты

### Auth

```
POST   /api/auth/login              { username, password } → { must_change_password }
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/change-password    { old_password, new_password }
GET    /api/auth/me                 → { id, username, fio, role, permissions }
```

### Администраторы

```
GET    /api/admins                  ?search=&role_id=&is_active=&page=&limit=
POST   /api/admins                  → { ..., generated_password }   # показать один раз
GET    /api/admins/{id}
PATCH  /api/admins/{id}
DELETE /api/admins/{id}             # нельзя удалить себя или последнего super_admin
POST   /api/admins/{id}/reset-password   → { generated_password }
```

### Роли

```
GET    /api/roles
POST   /api/roles                   { name, label, description, permissions }
GET    /api/roles/{id}
PATCH  /api/roles/{id}              # запрещено для is_system
DELETE /api/roles/{id}              # запрещено для is_system
```

### Группы

```
GET    /api/groups                  ?search=
POST   /api/groups                  { name }
PATCH  /api/groups/{id}             { name }
DELETE /api/groups/{id}             # запрещено если в группе есть студенты
```

### Студенты

```
GET    /api/employees               ?search=&group_id=&building=&room_id=&page=&limit=
POST   /api/employees
GET    /api/employees/{id}
PATCH  /api/employees/{id}
DELETE /api/employees/{id}          # soft delete
GET    /api/employees/{id}/photo    # proxy: backend стримит из S3 после проверки прав
POST   /api/employees/{id}/photo    # multipart upload → S3 (Pillow ресайз перед сохранением)
DELETE /api/employees/{id}/photo
GET    /api/employees/{id}/roommates
GET    /api/employees/{id}/history
PATCH  /api/employees/{id}/room     { room_id }   # требует employees:assign_room
```

### Комнаты

```
GET    /api/rooms                   ?building=&entrance=
POST   /api/rooms
POST   /api/rooms/bulk              { building, entrance, items: [{ room_number, capacity }] }
GET    /api/rooms/{id}
PATCH  /api/rooms/{id}
DELETE /api/rooms/{id}              # запрещено если в комнате есть студенты
GET    /api/rooms/{id}/students
```

---

## Формат ошибок API

Единый JSON-формат для всех ошибочных ответов (любой HTTP-статус ≥ 400):

```json
{
  "code": "EMPLOYEE_NOT_FOUND",
  "message": "Студент не найден",
  "details": { ... }
}
```

- **`code`** — машинно-читаемая константа `SCREAMING_SNAKE_CASE`. Стабильный контракт бэка и фронта. Объявлена как enum в `backend/core/errors.py`.
- **`message`** — готовый текст для показа в UI, **на русском**. Бэк формирует, фронт показывает. При появлении i18n фронт сможет переопределить по `code` без изменений на бэке.
- **`details`** — опциональный объект с контекстной инфой. Отсутствует для большинства бизнес-ошибок.

Плоский формат (без обёртки `{error: {...}}`) — упрощает парсинг на фронте.

### HTTP-статусы

| Код | Назначение |
|---|---|
| **400** | Нарушение бизнес-правила (нельзя удалить непустую группу, нельзя удалить себя) |
| **401** | Нет cookie / refresh истёк → фронт редиректит на `/login` |
| **403** | Аутентифицирован, но не имеет permission → фронт показывает «Доступ запрещён» |
| **404** | Ресурс не существует или soft-deleted |
| **409** | Конфликт состояния (телефон уже занят, username уже занят) |
| **422** | Невалидная схема запроса (Pydantic) — поле не того типа, длина, формат |
| **429** | Rate limit на `/auth/login` |
| **500** | Любое неперехваченное исключение |

**Граница 400 vs 422:**
- 422 — нарушение **схемы**: поле не того типа, обязательное отсутствует, телефон не формата. FastAPI/Pydantic кидает сам.
- 400 — нарушение **бизнес-правила**: данные корректны по форме, но недопустимы в текущем состоянии.

### Базовые коды ошибок MVP

| `code` | HTTP | Когда |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Неправильный логин/пароль |
| `NOT_AUTHENTICATED` | 401 | Cookie отсутствует или невалидна |
| `PERMISSION_DENIED` | 403 | Нет нужного permission |
| `EMPLOYEE_NOT_FOUND`, `GROUP_NOT_FOUND`, `ROOM_NOT_FOUND`, `ADMIN_NOT_FOUND`, `ROLE_NOT_FOUND` | 404 | Конкретный ресурс не найден |
| `GROUP_HAS_STUDENTS` | 400 | Удаление непустой группы |
| `ROOM_HAS_STUDENTS` | 400 | Удаление заселённой комнаты |
| `LAST_SUPER_ADMIN` | 400 | Удаление/разжалование последнего super_admin |
| `SELF_DELETE_FORBIDDEN` | 400 | Попытка удалить себя |
| `IS_SYSTEM_ROLE` | 400 | Изменение системной роли |
| `PHONE_ALREADY_EXISTS`, `USERNAME_ALREADY_EXISTS` | 409 | Нарушение UNIQUE |
| `VALIDATION_ERROR` | 422 | Pydantic-валидация |
| `RATE_LIMIT_EXCEEDED` | 429 | Превышен rate limit |
| `INTERNAL_ERROR` | 500 | Неперехваченное исключение |

Список расширяется по мере появления новых проверок.

### `details`

**Для `VALIDATION_ERROR` (422)** — список ошибок полей:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Невалидные данные",
  "details": {
    "fields": [
      { "field": "phone", "message": "Неверный формат телефона" },
      { "field": "full_name", "message": "Обязательное поле" }
    ]
  }
}
```

Фронт раскидывает эти ошибки рядом с соответствующими input'ами в форме.

**Для `INTERNAL_ERROR` (500)** — кладём `request_id`, чтобы можно было найти строку в логах:

```json
{
  "code": "INTERNAL_ERROR",
  "message": "Внутренняя ошибка сервера",
  "details": { "request_id": "abc-123-def" }
}
```

Стэк-трейс наружу **не отдаём** — только в логи.

Для большинства бизнес-ошибок `details` отсутствует — `code` и `message` всё говорят.

### Реализация

```python
# backend/core/errors.py
class APIError(Exception):
    code: str
    message: str
    http_status: int = 400
    details: dict | None = None

class EmployeeNotFound(APIError):
    code = "EMPLOYEE_NOT_FOUND"
    http_status = 404
    message = "Студент не найден"

class GroupHasStudents(APIError):
    code = "GROUP_HAS_STUDENTS"
    http_status = 400
    message = "Нельзя удалить группу, в которой есть студенты"
```

В `main.py` три обработчика:

1. `@app.exception_handler(APIError)` → JSON в нашем формате с нужным HTTP-статусом.
2. `@app.exception_handler(RequestValidationError)` → Pydantic-ошибки в наш формат, `code=VALIDATION_ERROR`, `http=422`.
3. `@app.exception_handler(Exception)` → логирует с `request_id`, возвращает `INTERNAL_ERROR / 500` без подробностей.

В сервисах кидаем доменные исключения, никаких `raise HTTPException(...)` руками в роутерах — это обеспечивает единообразие формата.

---

## Логирование и аудит

Два разделённых потока:

| Поток | Что | Куда |
|---|---|---|
| **Технический** | Request/response, ошибки, медленные запросы, rate limit | `stdout` JSON, подбирает Docker logging driver |
| **Аудит** | Привилегированные действия админов (auth, управление админами и ролями) | Таблица `audit_log` в Postgres + дубль в `stdout` с флагом `audit: true` |

Дубль аудита в stdout — страховка: если БД упала, важная история всё равно попадёт в Docker-логи.

### Формат записи (структурированный JSON через `structlog`)

```json
{
  "timestamp": "2026-05-22T14:23:11Z",
  "level": "INFO",
  "event": "auth.login.success",
  "request_id": "abc-123-def",
  "actor_id": 42,
  "actor_username": "ivanov",
  "ip": "10.0.0.5"
}
```

Базовые поля у каждой записи:
- `timestamp`, `level`, `event`, `message`
- `request_id` — UUID, генерится в middleware на каждый запрос; виден в логах и возвращается в `details.request_id` при HTTP 500
- `actor_id`, `actor_username` — для аутентифицированных запросов

### События, попадающие в `audit_log`

**Auth:**
- `auth.login.success`
- `auth.login.failed` — неверный пароль
- `auth.login.rate_limited` — превышен rate limit на `/auth/login`
- `auth.logout`
- `auth.refresh.invalid` — попытка с истёкшим/невалидным refresh

**Управление администраторами** (требует `admins:manage`):
- `admin.created`
- `admin.deleted`
- `admin.password_reset`
- `admin.role_changed` (с `details: {from_role_id, to_role_id}`)

**Управление ролями** (требует `roles:manage`):
- `role.created`
- `role.updated`
- `role.deleted`
- `role.permissions_changed` (с `details: {added: [...], removed: [...]}`)

**Что НЕ кладём в `audit_log`:**
- CRUD студентов / групп / комнат — для этого уже есть `employees_history` (построчная история по карточке).
- Просмотры (GET-запросы) — слишком шумно, мало пользы.

### Request middleware

На каждый входящий запрос:
1. Генерится `request_id = uuid4()`.
2. После прохождения auth кладёт `actor_id`, `actor_username`, `ip` в `contextvars` — любой логгер их подтянет автоматически.
3. После завершения запроса пишется `request.completed` с `method`, `path`, `status`, `duration_ms`.

### PII и секреты

**Никогда не логируются**, даже в DEBUG:
- Пароли.
- Refresh / access токены целиком (только их `jti` / fingerprint).
- Cookie-заголовки с токенами.

Перед логированием тел запросов прогоняем через redactor: поля с именами `password`, `token`, `refresh`, `secret` заменяются на `***`.

**Логируются нормально:**
- IP, username, actor_id.
- ФИО студента / телефон в контексте действий.

### Уровни

- **Прод**: `LOG_LEVEL=INFO`.
- **Dev**: `LOG_LEVEL=DEBUG` (видим SQL-запросы SQLAlchemy и т.п.).

### Что НЕ делается в MVP

- Внешние агрегаторы (Loki, ELK, Sentry) не подключаются.
- Алерты на всплеск `auth.login.failed` отложены.
- Ротация Docker-логов настраивается на уровне `docker-compose.yml` (`max-size`, `max-file`) — это операционка, не код.

---

## Безопасность: CORS, CSRF, cookies

### Deployment: single-origin

В **prod** фронт и бэк живут на одном origin через reverse proxy (nginx или traefik):

```
https://crm.aspirs.local/         → Next.js (фронт)
https://crm.aspirs.local/api/...  → FastAPI (бэк)
```

Reverse proxy также терминирует TLS. Same origin → **CORS вообще не задействуется**.

В **dev** фронт и бэк на разных портах (`localhost:3000` и `localhost:8000`) → разные origin → CORS нужен.

### CORS

Middleware конфигурируется через ENV:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,      # из ENV; в prod пусто, в dev — localhost:3000
    allow_credentials=True,                   # обязательно, иначе cookies не пошлются
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
    max_age=86400,
)
```

`allow_origins=["*"]` **запрещён** — спека не позволяет его комбинировать с `allow_credentials=True`. Список origins всегда явный.

### Атрибуты cookies

Access и refresh cookies выдаются с:

```
HttpOnly; Secure; SameSite=Lax; Domain=<COOKIE_DOMAIN>; Path=/
```

- **HttpOnly** — JS не имеет доступа к cookie (защита от XSS).
- **Secure** — cookie шлётся только по HTTPS. В dev можно `false`.
- **SameSite=Lax** — основная защита от CSRF (см. ниже).
- **Domain** — задаётся через ENV `COOKIE_DOMAIN`.

### Защита от CSRF

Защита складывается из трёх слоёв, **CSRF-токен в MVP не используется**:

1. **`SameSite=Lax`** на cookies. Браузер сам не отправляет cookie при cross-site POST/PATCH/DELETE — это закрывает классический CSRF через `<form>` на чужом сайте.
2. **Content-Type middleware на бэке** — для модифицирующих методов принимаем только `application/json` или `multipart/form-data` (для upload фото). Любой другой Content-Type → 415:
   ```python
   if request.method in ("POST", "PATCH", "PUT", "DELETE"):
       ct = request.headers.get("content-type", "")
       if not (ct.startswith("application/json") or ct.startswith("multipart/form-data")):
           raise APIError(code="INVALID_CONTENT_TYPE", http_status=415,
                          message="Ожидается application/json или multipart/form-data")
   ```
   Это блокирует CSRF через HTML-формы (формы не умеют отправлять `application/json`).
3. **Закрытая сеть** — общежитие в локалке, атакующему нужно физически попасть в сеть.

Когда понадобится CSRF-токен: если откроем доступ из открытого интернета или появятся cross-origin embedding-сценарии. Тогда добавим явно — модель угроз будет понятна. Сейчас — это лишний код без выигрыша.

### Почему не Strict

`SameSite=Strict` ломает UX «открыть админку по ссылке из почты/мессенджера»: при переходе с внешнего сайта браузер не отправит cookie → редирект на `/login`. Для админки общежития это неудобство сильнее, чем выигрыш в безопасности (Lax всё равно блокирует CSRF на модифицирующие запросы).

---

## Фото студентов

Фото показывается **только в карточке студента**. В списке студентов фото не отображается — список используется для поиска по ФИО и фильтрации, узнавание «по лицу» не критично, а лишний трафик не нужен. Если в будущем понадобится thumbnail в списке — добавляется через backfill-скрипт без изменений схемы БД.

### Допустимые форматы

- **Принимаем:** JPEG, PNG, WebP.
- **Не принимаем:** HEIC (формат iPhone по умолчанию) — отдаём 400 с понятной ошибкой «сохраните как JPEG». Поддержка HEIC требует `pillow-heif`, ради экзотики не тащим.

### Лимит размера

**5 МБ** на upload. Реальные портреты весят 200 КБ – 2 МБ; запас под несжатый PNG со смартфона.

### Обработка при загрузке

При загрузке backend через Pillow:
1. Открывает изображение, проверяет формат.
2. Поворачивает по EXIF orientation (иначе фото с телефона ляжет на бок).
3. Ресайзит до max 1024×1024 (с сохранением пропорций).
4. Конвертирует в JPEG quality 85.
5. Заливает в S3.

### Схема ключей в S3

`employees/{employee_id}/{uuid}.jpg`

UUID нужен для безопасной замены: при upload нового фото старый объект удаляется, новый кладётся с другим UUID. Это даёт:
- Уникальный URL для каждого фото — никакого кеш-инвалидации.
- В `employees.photo_url` хранится полный ключ.

Никаких отдельных thumbnail-объектов в MVP — только оригинал (после ресайза).

### Доступ к фото (GET)

**Proxy через backend.** Фронт делает `GET /api/employees/{id}/photo`, backend:
1. Проверяет, что пользователь имеет `employees:view`.
2. Стримит объект из S3 в ответ.
3. Ставит `Cache-Control: private, max-age=3600` — браузер кеширует на час, бэк не дёргается на каждом открытии карточки.

Signed URL **не используем** — закрытая админка, фото никуда не уходит за пределы аутентифицированного фронта, а signed URL утекает в логи и share-ссылки.

### Замена и удаление

- **Замена** (`POST` существующему студенту): новое фото загружается с новым UUID, старый объект (`photo_url` до изменения) удаляется из S3 в той же транзакции. Если удаление из S3 упало — логируем, но запрос успешен (новое фото уже сохранено, осиротевший объект почистит cleanup).
- **Удаление** (`DELETE`): объект удаляется из S3, `employees.photo_url = NULL`.
- **Soft delete студента**: фото в S3 НЕ удаляется (студент может быть восстановлен).

Смена фото в историю изменений не пишется (см. «Особенности схемы»).

---

## Списки: поиск и пагинация

Все эндпоинты списков (`/api/employees`, `/api/admins`) используют **единый стандарт**: offset-based пагинация + параметр `search` для текстового поиска + структурные фильтры (`group_id`, `role_id`, `building` и т.п.).

Исключение — `/api/groups`, который используется как источник для combobox-автодополнения: возвращает топ-50 совпадений по `?search=`, без `page`/`limit`.

### Параметры запроса

| Параметр | Тип | По умолчанию | Описание |
|---|---|---|---|
| `search` | string | `null` | Текстовый поиск (см. ниже). Пустая строка = без поиска |
| `page` | int ≥ 1 | `1` | Номер страницы, 1-индексированный |
| `limit` | int 1..200 | `50` | Размер страницы. Запрос с `limit > 200` → `422` |

### Формат ответа

```json
{
  "items": [ { ... }, { ... } ],
  "total": 247,
  "page": 2,
  "limit": 50,
  "total_pages": 5
}
```

`total_pages = ceil(total / limit)`. Если `total = 0` → `total_pages = 0`, `items = []`.

### Текстовый поиск (`search`)

**Принцип:** простой `ILIKE '%substr%'` без extensions. На объёме общежития (200-500 студентов) full scan по подстроке отрабатывает за миллисекунды. Если в будущем база разрастётся или появятся опечатки — мигрируем на `pg_trgm` + GIN-индекс.

**По каким полям бьём:**

| Эндпоинт | Поля |
|---|---|
| `/api/employees` | `full_name`, `phone` |
| `/api/admins` | `username`, `full_name` |
| `/api/groups` | `name` |

**Нормализация телефона:** при поиске по `/api/employees?search=…` из запроса извлекаются только цифры (`re.sub(r'\D', '', q)`), и поиск идёт двумя условиями через `OR`:
```sql
WHERE full_name ILIKE '%' || $1 || '%'
   OR phone     LIKE  '%' || $2 || '%'   -- $2 = только цифры из запроса
```
Так пользователь может вводить «999 12 34», «+7 (999)», «8999» — всё найдёт. Если в запросе нет цифр — phone-условие не добавляется.

### Сортировка

В MVP — **фиксированная**, без параметра `?sort=`:

| Эндпоинт | Порядок |
|---|---|
| `/api/employees` | `full_name ASC, id ASC` |
| `/api/admins` | `full_name ASC, id ASC` |
| `/api/groups` | `name ASC, id ASC` |

Вторичная сортировка по `id` нужна, чтобы порядок был детерминированным при одинаковых ФИО.

### Почему не cursor-based

В админке нужен пагинатор «1 2 3 ... N» и переход на конкретную страницу, а также видимый `total`. Cursor-based это не даёт — он удобен для бесконечного скролла лент. Дублирование строк при insert'ах во время навигации в кейсе общежития практически не случается.

---

## Ключевые UI-сценарии

### Мастер «Добавить комнаты пачкой»

Двухшаговый flow:

**Шаг 1** — общие параметры:
- Корпус (число)
- Подъезд (число)
- Диапазон номеров (строка с гибким парсингом)
- Вместимость по умолчанию

Поддерживаемые форматы в поле «номера»:
- `1001-1020` — диапазон
- `1001,1002,1005` — список
- `1001-1010,1020-1030` — несколько диапазонов
- `1001-1020,!1010` — диапазон с исключениями (опционально)

**Шаг 2** — редактируемая таблица:
- Для каждого распарсенного номера — строка с полями `room_number` (read-only) и `capacity` (поле ввода, предзаполнено дефолтом из шага 1)
- Любую вместимость можно изменить прямо в таблице
- Кнопка «Создать всё» → один запрос `POST /api/rooms/bulk`

### Поле телефона

- Маска `+7 (___) ___-__-__`
- Принимается ввод с `8` в начале — автоматически конвертируется в `+7`
- Невозможно ввести буквы или неправильное количество цифр
- В БД сохраняется `+79991234567` (E.164)
- В таблицах и карточке отображается отформатированно: `+7 (999) 123-45-67`

### Поле группы

- Combobox с автодополнением: запрос `GET /api/groups?search=…` по мере ввода
- Если введённое значение не совпадает ни с одной существующей группой — внизу выпадашки опция «Создать группу „<введённое>“»
- Создание группы инлайн делает `POST /api/groups`, после успеха новая группа сразу выбрана в форме студента
- Отдельной страницы управления группами в MVP №1 нет; CRUD через `/api/groups` доступен под `employees:edit` (создание/переименование) и `employees:delete` (удаление пустой группы)
- В списке студентов — фильтр по группе (тот же combobox, без опции создания)

### Поле даты рождения

- Маска `ДД.ММ.ГГГГ` + кнопка-календарь
- Рядом отображается возраст: `15.07.2005 (20 лет)`
- Для `is_minor = TRUE` — визуальный маркер «несовершеннолетний» в карточке и в списке

### Создание администратора

После успешного создания — модальное окно с одноразовым показом сгенерированного пароля:

```
Администратор создан.
Пароль: aB7$kLm2#xQ9pR4z
[Копировать]
Внимание: после закрытия окна пароль восстановить невозможно — только сгенерировать новый.
```

---

## Тесты

### Уровни и приоритеты

| Уровень | Делаем в MVP | Зачем |
|---|---|---|
| **Integration (HTTP + БД + Redis)** | Да, основа | Покрывают полный стек: парсинг → auth → бизнес-логика → БД → ответ. Самый высокий ROI |
| **Unit для чистой логики** | Да, точечно | Парсеры, валидаторы, расчёты, проще тестировать в изоляции |
| **E2E (Playwright)** | Нет, отложено | Дорого настраивать, хрупко при изменениях UI |
| **Frontend unit (Jest + RTL)** | Нет, отложено | После стабилизации фронта |

### Стэк

- **pytest** + **pytest-asyncio**
- **httpx.AsyncClient** + `app.dependency_overrides` — HTTP-тесты через ASGI без реального сервера
- **factory-boy** — фабрики моделей (`AdminFactory`, `EmployeeFactory`, ...)
- **pytest-xdist** — параллельный запуск
- Тестовые `db_test` и `redis_test` — отдельные сервисы в `docker-compose.yml`. Без `testcontainers` — лишняя сложность для MVP

### Изоляция между тестами

**Transaction rollback** — каждый тест внутри транзакции, в конце откат. Фикстура `db_session` обёрнута в `BEGIN ... ROLLBACK`.

Для редких случаев, когда тестируется собственный `commit()` — маркер `@pytest.mark.no_rollback`, после теста `TRUNCATE` всех таблиц.

Redis — `FLUSHDB` после каждого теста.

### Базовые фикстуры (`conftest.py`)

```python
@pytest.fixture
async def db_session() -> AsyncSession: ...           # session с rollback

@pytest.fixture
async def client(db_session) -> AsyncClient: ...     # httpx.AsyncClient с override get_db

@pytest.fixture
async def super_admin(db_session) -> Admin: ...      # активный super_admin

@pytest.fixture
async def auth_client(client, super_admin) -> AsyncClient: ...   # client с cookies

@pytest.fixture
async def tutor_admin(db_session) -> Admin: ...      # админ с ограниченными правами
```

### Структура

```
backend/tests/
├── conftest.py
├── factories.py
├── unit/
│   ├── test_room_range_parser.py
│   ├── test_permissions_check.py
│   ├── test_phone_normalize.py
│   └── test_history_diff.py
└── integration/
    ├── test_auth.py
    ├── test_admins.py
    ├── test_roles.py
    ├── test_employees.py
    ├── test_employees_photo.py
    ├── test_rooms.py
    └── test_groups.py
```

### Что покрываем по модулям

**`auth`:** login success / wrong password / rate limit; refresh success / invalid; logout инвалидирует refresh; `must_change_password` flow (блок всех endpoints кроме `/auth/change-password`); невалидная cookie → 401.

**`admins`:** CRUD; POST возвращает `generated_password`; DELETE: запрет на себя, запрет последнего super_admin; reset_password.

**`roles`:** CRUD; PATCH/DELETE системной роли → 400 `IS_SYSTEM_ROLE`; изменение permissions → запись в `audit_log`.

**`employees`:** CRUD; soft delete (запись остаётся, `deleted_at` ставится); список фильтрует `deleted_at IS NULL`; search по `full_name` и `phone` с нормализацией; пагинация (`page`, `limit`, `total`); `employees_history` пополняется при update; assign_room; группа `ON DELETE RESTRICT` (нельзя удалить непустую); photo (upload / replace / delete с моком S3-клиента).

**`rooms`:** CRUD; bulk-create с парсером диапазона (+ отдельный unit-тест парсера); DELETE при заселённой → 400 `ROOM_HAS_STUDENTS`.

**`groups`:** CRUD; DELETE при студентах → 400 `GROUP_HAS_STUDENTS`.

**Permissions (cross-cutting):** админ без `employees:delete` получает 403 на `DELETE /api/employees/{id}`; админ с `employees:view` без `employees:edit` не может PATCH.

### Coverage

Целимся на **70-80%** для сервисов и роутеров. Coverage — индикатор, не KPI. Дублирующие unit-тесты для тривиальной логики, уже проверенной integration-тестом, не пишем.

### CI

GitHub Actions, один job на каждый PR и push в `main`:

1. Поднимает Postgres 16 и Redis как services.
2. `alembic upgrade head` на тестовой БД.
3. `pytest -v -n auto` (параллельно через xdist).
4. Опционально: coverage report как PR-комментарий.

---

## Бэкапы и эксплуатация

### Что бэкапим

| Что | Чем | Куда |
|---|---|---|
| PostgreSQL | `pg_dump --format=custom` (сжатие + быстрый restore) | Локально на хосте (последние 7 daily) + копия в отдельный S3-бакет |
| S3 (фото) | MinIO bucket versioning + ежедневный `mc mirror` на отдельный диск | Lifecycle policy чистит старые версии |

### Расписание

Один бэкап в сутки, ночью. Cron: `0 3 * * *` локального времени. Для дормитория с правками раз в день/неделю чаще не нужно.

### Ретенция

Имена файлов с timestamp (`asprs-2026-05-22-030000.dump`), каждый объект уникальный — S3 versioning **на бэкапах** не нужен. Lifecycle policy на бакете `asprs-backups` удаляет по возрасту:

| Тип | Сколько хранить | Когда создаётся |
|---|---|---|
| Daily | 30 дней | Все дни |
| Weekly | 90 дней | Воскресенье |
| Monthly | 365 дней | 1-е число месяца |

Локально на хосте — последние **7 daily** (`find ... -mtime +7 -delete`), для быстрого restore без обращения к S3.

### Фото: versioning на основном бакете

На бакете `asprs` (основной, с фото) **включаем bucket versioning**:
- Кто-то случайно удалил/заменил фото — можно восстановить старую версию.
- Lifecycle policy: non-current versions удаляются через 30 дней (чтобы не копилось бесконечно).

Это решает кейс «откатить случайное удаление» без отдельного бэкапа фотографий.

Для disaster recovery основного бакета (упал диск с MinIO) — ежедневный `mc mirror` на отдельный диск/раздел. Cross-region replication — отложено.

### Реализация: sidecar-контейнер `backup`

В `docker-compose.yml` отдельный сервис:

```yaml
backup:
  image: aspirs-backup:latest          # alpine + pg_dump + mc + cron
  environment:
    - DATABASE_URL
    - S3_ENDPOINT
    - S3_BUCKET_BACKUPS=asprs-backups
    - BACKUP_CRON=0 3 * * *
  volumes:
    - ./backups:/backups               # локальный диск
  depends_on:
    - db
```

Внутри cron + shell-скрипт `backup.sh`:

```bash
#!/bin/sh
set -e
TS=$(date +%Y-%m-%d-%H%M%S)
DUMP="/backups/asprs-$TS.dump"

pg_dump --format=custom "$DATABASE_URL" > "$DUMP"
mc cp "$DUMP" "s3/$S3_BUCKET_BACKUPS/"
find /backups -name 'asprs-*.dump' -mtime +"$BACKUP_LOCAL_KEEP" -delete

# Зеркалим основной бакет с фото на резервный диск
mc mirror --remove --overwrite "s3/$S3_BUCKET" "/backups/photos/"

# Сообщаем backend для записи в audit_log
curl -fsS -X POST http://backend:8000/internal/backup-event \
  -H 'Content-Type: application/json' \
  -d "{\"event\":\"backup.success\",\"size_bytes\":$(stat -c%s "$DUMP")}"
```

Альтернативой был cron на хосте; sidecar выбираем за портабельность — всё разворачивается одним `docker compose up`.

### Восстановление (в README)

**PostgreSQL:**
```bash
# 1. Остановить app
docker compose stop backend frontend

# 2. Скачать дамп
mc cp s3/asprs-backups/asprs-2026-05-22-030000.dump ./

# 3. Восстановить
docker compose exec db pg_restore --clean --if-exists \
  --dbname=asprs ./asprs-2026-05-22-030000.dump

# 4. Запустить
docker compose start backend frontend
```

**Фото (одно, из versioning):**
```bash
mc cp --version-id <id> s3/asprs/employees/42/<uuid>.jpg ./recovered.jpg
```

### Мониторинг

Без алертов бэкапы тихо отваливаются. Минимум для MVP — каждый прогон скрипта пишет событие в `audit_log` через внутренний endpoint:

- `backup.success` — `details: { size_bytes, duration_ms }`
- `backup.failed` — `details: { error, stage }`

Алерты на отсутствие успешного бэкапа за сутки — отложено. В MVP проверяется глазами при просмотре аудит-лога.

Internal endpoint `POST /internal/backup-event` доступен только внутри docker network (не пробрасывается через nginx), без auth — это closed-loop коммуникация между sidecar'ом и backend.

### Healthcheck `/health`

Публичный эндпоинт, без auth. Проверяет:

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "s3":       "ok"
  }
}
```

При сбое подсистемы → HTTP 503, `status: "degraded"`. Используется:
- Docker healthcheck (контейнер перезапускается при `degraded`)
- Внешний uptime-мониторинг (по желанию в проде)

### Логирование Docker-контейнеров

В `docker-compose.yml` через `x-defaults` якорь применяется ко всем сервисам:

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "50m"
    max-file: "5"
```

Это даёт ~250 МБ логов на сервис с автоматической ротацией.

### Что НЕ делаем в MVP

- **Шифрование бэкапов** (gpg перед заливкой) — отложено. Записать в TODO эксплуатации.
- **Cross-region S3 replication** — отложено.
- **Off-site backup** (выгрузка с сервера на внешнее железо/облако другого провайдера) — отложено.
- **Алертинг на failed backups** в Telegram/email — отложено.
- **Disaster recovery drills** (регулярные тесты восстановления) — упомянуты в README как рекомендация эксплуатации, без автоматизации.

---

## Критические исправления относительно старой версии

| Проблема (старая) | Решение (новая) |
|---|---|
| Две несовместимые системы авторизации | Единственный `require_permission` через DI |
| `require_role` не проверял роль | Удалён, заменён на `require_permission` |
| `get_admin_role` игнорировал `is_active` | Проверка `is_active` в `get_current_admin` |
| `/api/import_excel` без авторизации | Все эндпоинты за `get_current_admin` |
| Path Traversal через `temp_file` из тела запроса | Имена временных файлов — UUID, от клиента не принимаются |
| `/api/user` раскрывал данные анонимам | Эндпоинт требует авторизации |
| Пароль по умолчанию `admin123` | Только CLI; генерация случайного пароля при создании через UI; обязательная смена при первом входе |
| Rate limiting отсутствует | Redis + slowapi на `/auth/login` |
| SQLite — нет конкурентного доступа | PostgreSQL |
| Миграции вручную через `ALTER TABLE` в коде | Alembic |
| Фото и файлы на диске рядом с кодом | S3-совместимое хранилище |
| Дублирование адреса комнаты в карточке студента | `room_id` FK, без дублирования `building/entrance/room_number` |

---

## Переменные окружения

```env
# Backend
DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/asprs
REDIS_URL=redis://redis:6379/0
SECRET_KEY=<256-bit random>
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
RATE_LIMIT_LOGIN=10/5minutes
LOG_LEVEL=INFO

# CORS и cookies
CORS_ORIGINS=                       # prod: пусто (single-origin); dev: http://localhost:3000
COOKIE_DOMAIN=crm.aspirs.local
COOKIE_SAMESITE=lax
COOKIE_SECURE=true                  # false в dev (нет HTTPS)

# S3
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=asprs

# Бэкапы
BACKUP_S3_BUCKET=asprs-backups
BACKUP_CRON=0 3 * * *
BACKUP_LOCAL_KEEP=7                 # сколько daily-дампов держать на диске
BACKUP_RETENTION_DAILY_DAYS=30      # применяется через lifecycle policy на бакете
BACKUP_RETENTION_WEEKLY_DAYS=90
BACKUP_RETENTION_MONTHLY_DAYS=365

# Frontend
NEXT_PUBLIC_API_URL=https://crm.local/api
```

---

## Порядок разработки MVP №1

**Сквозная практика:** integration-тесты пишутся параллельно с каждым модулем, не «потом». Юнит-тесты для чистой логики (парсеры, валидаторы) — когда сама логика появляется. CI собирается на этапе 1 и работает с самого начала.

### Этап 1 — Инфраструктура и каркас
1. Docker Compose (postgres, redis, backend, frontend, nginx, minio) + сервисы `db_test`, `redis_test`
2. Базовая структура backend (`app/`, `core/`, пустые модули)
3. Alembic + первая миграция (создание всех таблиц включая `audit_log` + seed системных ролей)
4. CLI: `create-superadmin`
5. `core/errors.py` (APIError + exception handlers) + Content-Type middleware
6. `core/logging.py` (structlog + request_id middleware + contextvars для actor)
7. pytest + conftest с базовыми фикстурами; CI с прогоном pytest на каждый PR

### Этап 2 — Авторизация
8. `auth/`: login, logout, refresh
9. `core/security.py`: JWT, bcrypt
10. `core/dependencies.py`: `get_current_admin`, `require_permission`
11. Rate limiting на login + запись `auth.login.*` событий в `audit_log`
12. Принудительная смена пароля при первом входе
13. Frontend: страница логина, страница смены пароля

### Этап 3 — Администраторы и роли
14. `admins/`: CRUD, генерация стартового пароля, reset-password + audit-события `admin.*`
15. `roles/`: CRUD, защита системных + audit-события `role.*`
16. Frontend: страницы администраторов и ролей

### Этап 4 — Комнаты
17. `rooms/`: базовый CRUD
18. `rooms/bulk_create.py`: эндпоинт пачкой
19. Frontend: список комнат, форма создания, мастер пачкой (2 шага)

### Этап 5 — Студенты
20. `groups/`: CRUD групп (тонкий модуль, без soft delete)
21. `employees/`: CRUD (создание входит в edit), soft delete
22. `employees/history.py`: запись изменений в лог (включая `group_id`)
23. Загрузка фото в S3 (Pillow ресайз, ключи `employees/{id}/{uuid}.jpg`) + `GET /api/employees/{id}/photo` proxy
24. Эндпоинты: roommates, history, room assignment
25. Frontend: combobox групп с инлайн-созданием; список студентов с фильтрами (включая группу), карточка, форма создания/редактирования, страница истории

### Этап 6 — Полировка
26. `/health` эндпоинт (БД, Redis, S3)
27. Sidecar `backup`: образ, скрипт, cron; internal endpoint `/internal/backup-event` → запись в `audit_log`
28. Bucket versioning на `asprs` + lifecycle policy на `asprs-backups`
29. README: запуск, миграции, создание super_admin, прогон тестов, процедура restore PG и фото
30. Финальная сверка coverage по тестам (целимся 70-80% на сервисах и роутерах)
