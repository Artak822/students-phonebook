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
-- Студенты
-- =========================================================

CREATE TABLE employees (
    id          SERIAL PRIMARY KEY,
    fio         TEXT NOT NULL,
    phone       TEXT NOT NULL CHECK (phone ~ '^\+7\d{10}$'),  -- E.164, только RU
    group_name  TEXT NOT NULL DEFAULT '',
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

CREATE INDEX idx_employees_room_id    ON employees (room_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_fio        ON employees (fio)     WHERE deleted_at IS NULL;
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
```

### Особенности схемы

- **Soft delete студентов** через `deleted_at`. Все списочные запросы фильтруют `WHERE deleted_at IS NULL`. Частичные индексы это учитывают.
- **Дата рождения** — обязательная; CHECK гарантирует «не в будущем и не старше 100 лет».
- **Телефон** — обязательный, формат E.164 (только RU: `+7XXXXXXXXXX`), проверка через regex CHECK. Дубли допускаются (общий семейный номер).
- **Комната у студента** — `room_id` FK с `ON DELETE RESTRICT`. Нельзя удалить комнату, пока в ней есть студенты.
- **Корпус / подъезд / номер** — все `INTEGER`, только положительные. Никаких ограничений по количеству цифр (универсальность для разных общежитий).
- **Permissions хранятся как JSONB-массив строк** в `roles.permissions`. Проверка прав — оператор JSONB `@>` или загрузка в Python set.
- **История изменений** — построчно (одна запись = одно поле). `action='create'`/`'delete'` — общая запись с `field_name = NULL`; `action='update'` — отдельная запись на каждое изменённое поле. Смена фото в историю не пишется.

### Что НЕ создаётся в MVP №1

Таблицы для отложенных функций (создаются миграциями в следующих итерациях):

- `custom_columns`, поле `employees.extra_data` — кастомные колонки карточки
- `employee_minor_representatives` — представители несовершеннолетних
- `tg_users` — привязка Telegram-аккаунтов
- `bed_linen_dates`, `bed_linen_scans` — постельное бельё
- `dormitory_payments` — оплата проживания
- `events` — мероприятия

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
GET    /api/admins                  ?search=&role_id=&is_active=
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

### Студенты

```
GET    /api/employees               ?search=&group=&building=&room_id=&page=&limit=
POST   /api/employees
GET    /api/employees/{id}
PATCH  /api/employees/{id}
DELETE /api/employees/{id}          # soft delete
POST   /api/employees/{id}/photo    # multipart upload → S3
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

# S3
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=asprs

# Frontend
NEXT_PUBLIC_API_URL=https://crm.local/api
```

---

## Порядок разработки MVP №1

### Этап 1 — Инфраструктура и каркас
1. Docker Compose (postgres, redis, backend, frontend, nginx, minio)
2. Базовая структура backend (`app/`, `core/`, пустые модули)
3. Alembic + первая миграция (создание всех таблиц + seed системных ролей)
4. CLI: `create-superadmin`

### Этап 2 — Авторизация
5. `auth/`: login, logout, refresh
6. `core/security.py`: JWT, bcrypt
7. `core/dependencies.py`: `get_current_admin`, `require_permission`
8. Rate limiting на login
9. Принудительная смена пароля при первом входе
10. Frontend: страница логина, страница смены пароля

### Этап 3 — Администраторы и роли
11. `admins/`: CRUD, генерация стартового пароля, reset-password
12. `roles/`: CRUD, защита системных
13. Frontend: страницы администраторов и ролей

### Этап 4 — Комнаты
14. `rooms/`: базовый CRUD
15. `rooms/bulk_create.py`: эндпоинт пачкой
16. Frontend: список комнат, форма создания, мастер пачкой (2 шага)

### Этап 5 — Студенты
17. `employees/`: CRUD (создание входит в edit), soft delete
18. `employees/history.py`: запись изменений в лог
19. Загрузка фото в S3
20. Эндпоинты: roommates, history, room assignment
21. Frontend: список студентов с фильтрами, карточка, форма создания/редактирования, страница истории

### Этап 6 — Полировка
22. Логирование (структурированное, без раскрытия секретов)
23. Health check эндпоинт
24. README с инструкциями по запуску
25. Базовое покрытие тестами (auth, permissions, критические сервисы)
