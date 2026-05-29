# Техническая документация АСПиРС CRM

## Содержание

1. [Архитектура](#архитектура)
2. [Инфраструктура](#инфраструктура)
3. [Backend](#backend)
4. [Frontend](#frontend)
5. [Аутентификация и авторизация](#аутентификация-и-авторизация)
6. [База данных](#база-данных)
7. [Хранилище файлов](#хранилище-файлов)
8. [API Reference](#api-reference)
9. [Переменные окружения](#переменные-окружения)
10. [Разработка](#разработка)

---

## Архитектура

```
Browser
  └── Nginx :80
        ├── /api/*   → Backend (FastAPI :8000)
        └── /*       → Frontend (Next.js :3000)

Backend зависимости:
  ├── PostgreSQL 16  — основные данные
  ├── Redis          — сессии / refresh-токены
  └── MinIO          — фотографии студентов (S3 API)
```

Все сервисы запускаются через Docker Compose. Nginx проксирует запросы, не выставляя наружу порты бэкенда и фронтенда напрямую.

---

## Инфраструктура

### docker-compose.yml

| Сервис | Образ | Порт снаружи |
|---|---|---|
| `nginx` | nginx:alpine | 80 |
| `frontend` | кастомный (Node 18) | — |
| `backend` | кастомный (Python 3.12) | — |
| `db` | postgres:16-alpine | — |
| `redis` | redis:7-alpine | — |
| `minio` | minio/minio:latest | 9001 (console) |
| `db_test` | postgres:16-alpine | — (тесты) |
| `redis_test` | redis:7-alpine | — (тесты) |

### Volumes

| Volume | Назначение |
|---|---|
| `pgdata` | Данные PostgreSQL |
| `miniodata` | Данные MinIO (фотографии) |

### Nginx

Файл: `nginx/nginx.conf`

- `location /api/` — проксируется на `backend:8000`
- `location /docs`, `/openapi.json`, `/health` — проксируются на backend
- `location /` — проксируется на `frontend:3000`, поддерживает WebSocket (`Upgrade`)
- `client_max_body_size 10m` — лимит загружаемых файлов

---

## Backend

**Стек:** Python 3.12, FastAPI 0.115, SQLAlchemy 2.0 (async), Alembic, Pydantic v2, asyncpg, PyJWT, bcrypt, openpyxl, aioboto3 (MinIO), structlog.

### Структура модулей

```
backend/app/
├── main.py           — FastAPI app, middleware, роутеры
├── config.py         — Settings (pydantic-settings, .env)
├── database.py       — AsyncEngine, AsyncSession
├── models.py         — Base (SQLAlchemy declarative)
├── cli.py            — CLI-команды (create-superadmin, backup)
│
├── core/
│   ├── dependencies.py   — get_db, require_permission, get_current_admin
│   ├── errors.py         — APIError и все доменные исключения
│   ├── logging.py        — structlog + RequestLoggingMiddleware
│   ├── middleware.py      — ContentTypeMiddleware, PasswordChangeRequiredMiddleware
│   └── s3.py             — upload/stream/delete объектов MinIO
│
├── auth/             — JWT, login, logout, refresh, change-password, /me
├── admins/           — CRUD администраторов, сброс пароля
├── roles/            — CRUD ролей с правами
├── groups/           — CRUD групп студентов
├── rooms/            — CRUD комнат, список жильцов, массовое создание
└── employees/
    ├── router.py     — все endpoint'ы студентов
    ├── service.py    — бизнес-логика
    ├── schemas.py    — Pydantic-схемы
    ├── models.py     — ORM-модели
    ├── history.py    — запись истории изменений
    └── photo.py      — обработка изображений (Pillow)
```

### Middleware

| Middleware | Назначение |
|---|---|
| `CORSMiddleware` | CORS, настраивается через `CORS_ORIGINS` |
| `PasswordChangeRequiredMiddleware` | При `must_change_password=True` блокирует все запросы кроме `/api/auth/*` |
| `RequestLoggingMiddleware` | Структурированное логирование каждого запроса (structlog) |
| `ContentTypeMiddleware` | Проверяет `Content-Type: application/json` у мутирующих запросов |

### Обработка ошибок

Все доменные ошибки наследуются от `APIError`:

```python
class APIError(Exception):
    status_code: int
    code: str
    message: str
```

Формат ответа:

```json
{
  "code": "EMPLOYEE_NOT_FOUND",
  "message": "Студент не найден"
}
```

Коды ошибок: `EMPLOYEE_NOT_FOUND`, `PHONE_ALREADY_EXISTS`, `GROUP_NOT_FOUND`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `ILLNESS_NOT_FOUND`, `ACTIVE_ILLNESS_NOT_FOUND`, `ALREADY_SICK`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`.

### Пагинация

Стандартный ответ списков:

```json
{
  "items": [...],
  "total": 42,
  "page": 1,
  "limit": 50,
  "total_pages": 1
}
```

### История изменений

Модуль `employees/history.py` автоматически записывает события `create`, `update`, `delete` в таблицу `employee_change_history`. При `update` сохраняется каждое изменённое поле отдельной строкой (старое и новое значение).

При возврате истории через API значения `room_id` автоматически резолвятся в читаемый формат `корпус-подъезд-номер` (Python post-processing, без SQL CAST).

### Экспорт в Excel

Эндпоинт `GET /api/employees/export` возвращает `.xlsx` (openpyxl) с колонками: №, ФИО, Группа, Дата рождения, Комната, Телефон, Заметки, На больничном.

Поддерживаемые фильтры: `group_id`, `building`, `entrance`, `room_id`, `sick`.

Файл содержит: заморозку шапки, автофильтр, чередующиеся строки, форматированный заголовок.

---

## Frontend

**Стек:** Next.js 14 (App Router), React 18, TypeScript, CSS Modules, TanStack Query v5, React Hook Form, Zod, Open Sans (Google Fonts).

### Структура

```
frontend/
├── app/
│   ├── layout.tsx          — root layout, шрифт, Providers
│   ├── globals.css         — CSS custom properties (дизайн-токены)
│   ├── providers.tsx        — QueryClientProvider + ToastProvider
│   ├── (auth)/login/       — страница входа
│   └── (dashboard)/
│       ├── layout.tsx      — DashboardShell (сайдбар)
│       ├── students/       — список и карточка студента
│       ├── rooms/          — список и карточка комнаты
│       ├── export/         — экспорт в Excel
│       ├── admins/         — управление администраторами
│       └── roles/          — управление ролями
│
├── components/
│   ├── layout/
│   │   └── DashboardShell.tsx   — боковая навигация
│   └── ui/
│       ├── DatePicker.tsx       — кастомный date/datetime picker
│       └── Toaster.tsx          — система уведомлений
│
└── lib/
    ├── api/
    │   ├── client.ts       — базовый fetch + HttpError
    │   ├── employees.ts    — API студентов, истории, болезней
    │   └── rooms.ts        — API комнат
    ├── hooks/
    │   └── useMe.ts        — текущий пользователь + hasPermission
    └── toast.tsx           — ToastProvider, useToast
```

### Дизайн-система

Все токены определены в `app/globals.css` как CSS custom properties:

```css
--bg, --surface, --surface-muted        /* фоны */
--border, --border-focus                /* границы */
--accent, --accent-hover, --accent-bg   /* акцентный цвет */
--text-primary, --text-secondary, --text-muted
--error, --error-bg
--radius-sm, --radius-md, --radius-lg
--shadow-panel, --shadow-dialog
```

Цветовая схема — OKLCH, акцент slate-blue (`oklch(44% 0.095 222)`).

### Компонент DatePicker

`components/ui/DatePicker.tsx`

- Режимы: `mode="date"` (только дата) и `mode="datetime"` (дата + время)
- Значение: строка `"YYYY-MM-DD"` или `"YYYY-MM-DDTHH:mm"`
- Реализация: calendar grid с понедельника, навигация по месяцам, time picker на scroll-snap колонках (часы / минуты)
- Без сторонних date-библиотек

### Система уведомлений (Toast)

`lib/toast.tsx` + `components/ui/Toaster.tsx`

Виды: `success` (зелёный), `error` (красный), `info` (нейтральный), `warning` (янтарный).

```typescript
const toast = useToast();
toast.success("Студент создан");
toast.warning("Не заполнено: фото, законные представители");
toast.error("Не удалось сохранить.");
```

Уведомления автоматически исчезают: success/info через 3.5 с, error/warning через 5 с.

### API-клиент

`lib/api/client.ts` — все запросы идут через `apiJson()`, который:
- Добавляет `Content-Type: application/json`
- Кидает `HttpError` при статусе >= 400 с телом ответа
- Использует `credentials: "include"` (cookie-сессия)

---

## Аутентификация и авторизация

### Схема

- При логине выдаются два httpOnly cookie: `access_token` (JWT, 30 мин) и `refresh_token` (JWT, 30 дней)
- `PasswordChangeRequiredMiddleware` блокирует API при флаге `must_change_password=True`
- `require_permission(perm)` — FastAPI dependency, проверяет наличие права в роли администратора

### Права

| Право | Описание |
|---|---|
| `employees:view` | Просмотр студентов и истории |
| `employees:edit` | Создание и редактирование студентов, болезни, заявления |
| `employees:delete` | Мягкое удаление студентов |
| `employees:assign_room` | Назначение комнаты |
| `rooms:view` | Просмотр комнат |
| `rooms:manage` | Создание и редактирование комнат |
| `admins:manage` | Управление администраторами |
| `roles:manage` | Управление ролями и правами |
| `history:view` | Просмотр истории (зарезервировано) |

### Предустановленные роли

| Роль | Права |
|---|---|
| `super_admin` | Все права |
| `tutor` (Воспитатель) | `employees:view/edit/assign_room`, `rooms:view` |
| `placement` (Сотрудник размещения) | `employees:view/assign_room`, `rooms:view/manage` |

---

## База данных

### Схема таблиц

#### `admins`
| Поле | Тип | Описание |
|---|---|---|
| id | integer PK | |
| fio | text | ФИО администратора |
| username | text unique | Логин |
| password_hash | text | bcrypt |
| role_id | integer FK → roles | |
| must_change_password | boolean | Принудительная смена пароля |
| created_at | timestamptz | |

#### `roles`
| Поле | Тип |
|---|---|
| id | integer PK |
| name | text unique |
| label | text |
| permissions | text[] |

#### `employees`
| Поле | Тип | Описание |
|---|---|---|
| id | integer PK | |
| fio | text | ФИО |
| phone | text unique | +7XXXXXXXXXX |
| group_id | integer FK → groups | |
| birth_date | date | |
| photo_url | text nullable | Ключ в S3 |
| room_id | integer FK → rooms nullable | |
| notes | text | Заметки |
| contacts | text | JSON: список представителей |
| deleted_at | timestamptz nullable | Soft delete |
| created_at, updated_at | timestamptz | |

#### `rooms`
| Поле | Тип | Описание |
|---|---|---|
| id | integer PK | |
| building | integer | Номер корпуса |
| entrance | integer | Номер подъезда |
| room_number | integer | Номер комнаты |
| capacity | integer | Вместимость |
| created_at, updated_at | timestamptz | |

Уникальный ключ: `(building, entrance, room_number)`.

#### `employee_statements`
| Поле | Тип |
|---|---|
| id | integer PK |
| employee_id | integer FK → employees |
| start_date | timestamptz |
| end_date | timestamptz nullable |
| created_at | timestamptz |

#### `employee_illnesses`
| Поле | Тип | Описание |
|---|---|---|
| id | integer PK | |
| employee_id | integer FK → employees | |
| temp_room_id | integer FK → rooms nullable | Временная комната на время болезни |
| start_date | date | |
| end_date | date nullable | NULL = болеет сейчас |
| created_at | timestamptz | |

#### `illness_notes`
| Поле | Тип |
|---|---|
| id | integer PK |
| illness_id | integer FK → employee_illnesses |
| admin_id | integer FK → admins nullable |
| note | text |
| date | date |
| created_at | timestamptz |

#### `employee_change_history`
| Поле | Тип | Описание |
|---|---|---|
| id | integer PK | |
| employee_id | integer FK → employees | |
| admin_id | integer FK → admins nullable | Кто изменил |
| action | text | `create`, `update`, `delete` |
| field_name | text nullable | Имя поля (для update) |
| old_value | text nullable | Старое значение |
| new_value | text nullable | Новое значение |
| changed_at | timestamptz | |

### Мягкое удаление

Студенты (`employees`) удаляются мягко через `deleted_at`. Все запросы автоматически фильтруют по `deleted_at IS NULL`.

### Миграции

Alembic, файлы в `backend/alembic/versions/`. Именование: `YYYYMMDD_NNNN_description.py`.

```bash
# Создать новую миграцию
docker compose exec backend alembic revision --autogenerate -m "описание"

# Применить
docker compose exec backend alembic upgrade head

# Откатить
docker compose exec backend alembic downgrade -1
```

---

## Хранилище файлов

MinIO используется как S3-совместимое хранилище для фотографий студентов.

- Бакет: `aspirs` (создаётся автоматически при первом обращении)
- Ключ объекта: `photos/{employee_id}.jpg`
- Фото обрабатываются через Pillow: конвертируются в JPEG, ресайзятся до 800×800 px, strip EXIF
- Максимальный размер загружаемого файла: 5 МБ
- Поддерживаемые форматы на входе: JPEG, PNG, WebP

Модуль: `backend/app/core/s3.py` — функции `upload_object`, `stream_object`, `delete_object`.

---

## API Reference

Базовый URL: `/api`

### Аутентификация

| Метод | Путь | Описание |
|---|---|---|
| POST | `/auth/login` | Вход. Body: `{username, password}` |
| POST | `/auth/logout` | Выход, очищает cookie |
| POST | `/auth/refresh` | Обновление access-токена |
| POST | `/auth/change-password` | Смена пароля |
| GET | `/auth/me` | Текущий администратор |

### Студенты

| Метод | Путь | Права | Описание |
|---|---|---|---|
| GET | `/employees` | `employees:view` | Список. Параметры: `search`, `group_id`, `building`, `room_id`, `sick`, `page`, `limit` |
| POST | `/employees` | `employees:edit` | Создать |
| GET | `/employees/export` | `employees:view` | Экспорт в Excel. Те же фильтры + `entrance` |
| GET | `/employees/{id}` | `employees:view` | Карточка |
| PATCH | `/employees/{id}` | `employees:edit` | Обновить поля |
| DELETE | `/employees/{id}` | `employees:delete` | Soft delete |
| PATCH | `/employees/{id}/room` | `employees:assign_room` | Назначить/снять комнату |
| GET | `/employees/{id}/roommates` | `employees:view` | Соседи по комнате |
| GET | `/employees/{id}/history` | `employees:view` | История изменений |
| GET | `/employees/{id}/statements` | `employees:view` | Заявления |
| POST | `/employees/{id}/statements` | `employees:edit` | Добавить заявление |
| DELETE | `/employees/{id}/statements/{sid}` | `employees:edit` | Удалить заявление |
| GET | `/employees/{id}/photo` | `employees:view` | Получить фото |
| POST | `/employees/{id}/photo` | `employees:edit` | Загрузить фото |
| DELETE | `/employees/{id}/photo` | `employees:edit` | Удалить фото |
| GET | `/employees/{id}/illnesses` | `employees:view` | Список болезней |
| POST | `/employees/{id}/illnesses` | `employees:edit` | Открыть больничный |
| PATCH | `/employees/{id}/illnesses/{iid}` | `employees:edit` | Изменить болезнь |
| PATCH | `/employees/{id}/illnesses/{iid}/recover` | `employees:edit` | Закрыть больничный |
| DELETE | `/employees/{id}/illnesses/{iid}` | `employees:edit` | Удалить запись о болезни |
| POST | `/employees/{id}/illnesses/{iid}/notes` | `employees:edit` | Добавить заметку к болезни |

### Комнаты

| Метод | Путь | Права | Описание |
|---|---|---|---|
| GET | `/rooms` | `rooms:view` | Список всех комнат |
| POST | `/rooms` | `rooms:manage` | Создать комнату |
| POST | `/rooms/bulk` | `rooms:manage` | Массовое создание |
| GET | `/rooms/{id}` | `rooms:view` | Карточка комнаты |
| PATCH | `/rooms/{id}` | `rooms:manage` | Обновить |
| DELETE | `/rooms/{id}` | `rooms:manage` | Удалить |
| GET | `/rooms/{id}/students` | `rooms:view` | Жильцы комнаты |

### Группы

| Метод | Путь | Описание |
|---|---|---|
| GET | `/groups` | Список. Параметр: `search` |
| POST | `/groups` | Создать |

### Администраторы

| Метод | Путь | Описание |
|---|---|---|
| GET | `/admins` | Список |
| POST | `/admins` | Создать |
| GET | `/admins/{id}` | Карточка |
| PATCH | `/admins/{id}` | Обновить |
| DELETE | `/admins/{id}` | Удалить |
| POST | `/admins/{id}/reset-password` | Сбросить пароль (генерируется новый) |

### Роли

| Метод | Путь | Описание |
|---|---|---|
| GET | `/roles` | Список |
| POST | `/roles` | Создать |
| GET | `/roles/{id}` | Карточка |
| PATCH | `/roles/{id}` | Обновить |
| DELETE | `/roles/{id}` | Удалить |

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://aspirs:aspirs@db:5432/aspirs` | Строка подключения PostgreSQL |
| `REDIS_URL` | `redis://redis:6379/0` | Строка подключения Redis |
| `SECRET_KEY` | `change-me-in-production` | Ключ подписи JWT. **Обязательно заменить** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Время жизни access-токена |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Время жизни refresh-токена |
| `CORS_ORIGINS` | `` | Разрешённые CORS-origin'ы (через запятую) |
| `COOKIE_SECURE` | `false` | `true` на HTTPS |
| `COOKIE_SAMESITE` | `lax` | SameSite атрибут cookie |
| `COOKIE_DOMAIN` | `` | Domain атрибут cookie |
| `S3_ENDPOINT` | `http://minio:9000` | Endpoint MinIO/S3 |
| `S3_ACCESS_KEY` | `minioadmin` | Access key |
| `S3_SECRET_KEY` | `minioadmin` | Secret key |
| `S3_BUCKET` | `aspirs` | Бакет для фотографий |
| `BACKUP_S3_BUCKET` | `aspirs-backups` | Бакет для резервных копий |
| `BACKUP_LOCAL_KEEP` | `7` | Кол-во локальных бэкапов |
| `RATE_LIMIT_LOGIN` | `10/5minutes` | Лимит попыток входа |
| `LOG_LEVEL` | `INFO` | Уровень логирования |

---

## Разработка

### Локальный запуск

```bash
# Все сервисы
docker compose up -d

# Смотреть логи бэкенда
docker compose logs -f backend

# Перезапустить после изменений в Python
docker compose restart backend

# Пересобрать образ (после изменений requirements.txt)
docker compose build backend && docker compose up -d backend
```

### Создание администратора

```bash
docker compose exec backend python -m app.cli create-superadmin
```

### Запуск тестов

```bash
docker compose exec backend pytest -x -q
```

### Подключение к БД

```bash
docker compose exec db psql -U aspirs -d aspirs
```

### MinIO Console

Доступен на `http://localhost:9001`. Логин: `minioadmin` / `minioadmin`.

### Добавление новой страницы

1. Создать директорию `frontend/app/(dashboard)/page-name/`
2. Добавить `page.tsx` и `page-name.module.css`
3. Добавить ссылку в `DashboardShell.tsx` с проверкой `hasPermission`

### Добавление нового права

1. Добавить строку права в `backend/app/roles/schemas.py` в список `PERMISSIONS`
2. Использовать `require_permission("new:perm")` в роутере
3. Добавить право в нужные роли через интерфейс или миграцию
