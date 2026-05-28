# АСПиРС CRM — описание проекта

CRM-система для управления общежитием. Переписана с Flask + SQLite на FastAPI + PostgreSQL + Next.js.

---

## Инфраструктура

### Docker Compose (`docker-compose.yml`)

| Сервис | Образ | Назначение |
|---|---|---|
| `db` | postgres:16-alpine | Основная БД (volume `pgdata`) |
| `db_test` | postgres:16-alpine | БД для тестов (tmpfs, без персистентности) |
| `redis` | redis:7-alpine | Сессии / кеш (без персистентности) |
| `redis_test` | redis:7-alpine | Redis для тестов |
| `minio` | minio/minio:latest | S3-совместимое хранилище фото, консоль на порту 9001 |
| `backend` | ./backend | FastAPI-сервер на порту 8000 (внутри) |
| `frontend` | ./frontend | Next.js на порту 3000 (внутри) |
| `nginx` | nginx:alpine | Реверс-прокси, единственный публичный порт 80 |

### Nginx (`nginx/nginx.conf`)

- `/api/*` → `http://backend:8000`
- `/health`, `/docs`, `/openapi.json` → backend
- `/` → `http://frontend:3000` (с поддержкой WebSocket для HMR)
- `client_max_body_size 10m`

### Переменные окружения (`.env`)

```
DATABASE_URL          postgresql+asyncpg://aspirs:aspirs@db:5432/aspirs
REDIS_URL             redis://redis:6379/0
SECRET_KEY            <секрет JWT>
ACCESS_TOKEN_EXPIRE_MINUTES   30
REFRESH_TOKEN_EXPIRE_DAYS     30
RATE_LIMIT_LOGIN      10/5minutes
CORS_ORIGINS          пусто / список через запятую / JSON-массив
COOKIE_DOMAIN         пусто = не выставлять domain
COOKIE_SAMESITE       lax
COOKIE_SECURE         false

# MinIO
S3_ENDPOINT           http://minio:9000
S3_ACCESS_KEY         minioadmin
S3_SECRET_KEY         minioadmin
S3_BUCKET             aspirs
BACKUP_S3_BUCKET      aspirs-backups
BACKUP_LOCAL_KEEP     7
```

---

## Бэкенд (`backend/`)

**Стек:** Python, FastAPI, SQLAlchemy (async), PostgreSQL, Alembic, Redis, MinIO (aiobotocore), bcrypt, PyJWT, pydantic-settings, structlog

### Структура

```
backend/
├── app/
│   ├── main.py              — FastAPI-приложение, middleware, роутеры
│   ├── config.py            — Settings (pydantic-settings, .env)
│   ├── database.py          — AsyncEngine, AsyncSessionLocal, Base
│   ├── models.py            — общий импорт моделей
│   ├── cli.py               — CLI-команды (создание суперадмина и др.)
│   ├── core/
│   │   ├── dependencies.py  — get_db, get_current_admin, require_permission
│   │   ├── errors.py        — иерархия APIError + обработчики исключений
│   │   ├── security.py      — hash_password, verify_password, JWT, refresh token
│   │   ├── middleware.py    — ContentTypeMiddleware, PasswordChangeRequiredMiddleware
│   │   ├── logging.py       — structlog, RequestLoggingMiddleware (request_id)
│   │   ├── redis.py         — Redis-клиент (сессии refresh-токенов)
│   │   └── s3.py            — upload/stream/delete объектов MinIO
│   ├── auth/                — авторизация (login, logout, refresh, change-password)
│   ├── admins/              — управление администраторами
│   ├── roles/               — управление ролями и правами
│   ├── groups/              — управление учебными группами
│   ├── rooms/               — управление комнатами
│   └── employees/           — управление студентами (главный модуль)
├── alembic/                 — миграции БД
├── tests/                   — интеграционные и unit-тесты
├── requirements.txt
├── pyproject.toml
└── Dockerfile
```

### Аутентификация и авторизация

- Вход через `POST /api/auth/login` — выдаёт httpOnly-куки `access_token` (JWT, 30 мин) и `refresh_token` (64-байт hex, 30 дней, хранится SHA-256 в Redis)
- При 401 клиент автоматически редиректится на `/login`
- Принудительная смена пароля при первом входе (`password_changed = false`): `PasswordChangeRequiredMiddleware` блокирует все запросы кроме `/api/auth/change-password`
- Проверка прав: `require_permission("domain:action")` — зависимость FastAPI, проверяет `admin.role.permissions: list[str]`
- JWT-токен содержит `sub` (admin_id) и `password_changed`

### Модули бэкенда

#### `auth`
| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/login` | Логин (rate limit: 10/5 мин), устанавливает куки |
| POST | `/api/auth/logout` | Удаляет куки, отзывает refresh-токен |
| POST | `/api/auth/refresh` | Обновляет access_token по refresh_token |
| PATCH | `/api/auth/change-password` | Смена пароля |
| GET | `/api/auth/me` | Текущий администратор |

#### `admins`
| Метод | Путь | Права |
|---|---|---|
| GET | `/api/admins` | `admins:view` |
| POST | `/api/admins` | `admins:edit` |
| GET | `/api/admins/{id}` | `admins:view` |
| PATCH | `/api/admins/{id}` | `admins:edit` |
| DELETE | `/api/admins/{id}` | `admins:delete` |

Защита: нельзя удалить последнего суперадмина, нельзя удалить себя.

#### `roles`
| Метод | Путь | Права |
|---|---|---|
| GET | `/api/roles` | `roles:view` |
| POST | `/api/roles` | `roles:edit` |
| GET | `/api/roles/{id}` | `roles:view` |
| PATCH | `/api/roles/{id}` | `roles:edit` |
| DELETE | `/api/roles/{id}` | `roles:edit` |

Системные роли (`is_system = true`) нельзя изменять/удалять. Нельзя удалить роль, назначенную хотя бы одному администратору.

Permissions — произвольные строки вида `domain:action`, хранятся в JSONB.

#### `groups`
| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/groups` | Список (опц. `?search=`) |
| POST | `/api/groups` | Создать группу |
| DELETE | `/api/groups/{id}` | Удалить (нельзя, если есть студенты) |

#### `rooms`
| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/rooms` | Список (`?building=&entrance=`) |
| POST | `/api/rooms` | Создать комнату |
| GET | `/api/rooms/{id}` | Карточка комнаты |
| PATCH | `/api/rooms/{id}` | Обновить |
| DELETE | `/api/rooms/{id}` | Удалить (нельзя, если есть жильцы) |
| POST | `/api/rooms/bulk` | Массовое создание (`{building, entrance, items: [{room_number, capacity}]}`) |
| GET | `/api/rooms/{id}/students` | Список жильцов |

Формат адреса: `building-entrance-room_number` (например `8-1-361`).

#### `employees` (студенты)
| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/employees` | Список (`?search=&group_id=&building=&room_id=&sick=&page=&limit=`) |
| POST | `/api/employees` | Создать |
| GET | `/api/employees/{id}` | Карточка |
| PATCH | `/api/employees/{id}` | Обновить поля |
| DELETE | `/api/employees/{id}` | Мягкое удаление (`deleted_at`) |
| PATCH | `/api/employees/{id}/room` | Назначить комнату `{room_id}` |
| GET | `/api/employees/{id}/roommates` | Соседи по комнате |
| GET | `/api/employees/{id}/history` | История изменений |
| GET | `/api/employees/{id}/photo` | Стриминг фото (JPEG) |
| POST | `/api/employees/{id}/photo` | Загрузить фото (JPEG/PNG/WebP, ≤5 МБ, конвертируется в JPEG) |
| DELETE | `/api/employees/{id}/photo` | Удалить фото |
| GET | `/api/employees/{id}/statements` | Список заявлений |
| POST | `/api/employees/{id}/statements` | Создать заявление `{start_date, end_date?}` |
| DELETE | `/api/employees/{id}/statements/{stmt_id}` | Удалить заявление |
| GET | `/api/employees/{id}/illnesses` | Список болезней |
| POST | `/api/employees/{id}/illnesses` | Зафиксировать болезнь `{start_date, temp_room_id?, first_note?}` |
| PATCH | `/api/employees/{id}/illnesses/{illness_id}` | Обновить болезнь (сменить временную комнату) |
| DELETE | `/api/employees/{id}/illnesses/{illness_id}` | Удалить болезнь со всеми записями |
| POST | `/api/employees/{id}/illnesses/{illness_id}/notes` | Добавить запись `{note, date}` |
| PATCH | `/api/employees/{id}/illnesses/{illness_id}/recover` | Выздоровление `{end_date, final_note?}` |

Фильтр `?sick=true` возвращает только студентов с активной болезнью (`end_date IS NULL`).  
Поиск по `search=` — по ФИО (ILIKE) и по цифрам телефона (≥4 цифр).  
Фото хранится в MinIO, `photo_url` в БД = ключ объекта.  
История изменений записывается при каждом `create / update / delete` через `employees/history.py`.

### База данных

#### Таблицы

| Таблица | Ключевые поля |
|---|---|
| `admins` | `username` (unique), `password_hash`, `role_id`, `is_active`, `password_changed` |
| `roles` | `name` (unique), `label`, `permissions` (JSONB), `is_system` |
| `groups` | `name` (unique) |
| `rooms` | `building`, `entrance`, `room_number` (unique вместе), `capacity` |
| `employees` | `fio`, `phone` (+7XXXXXXXXXX, unique), `group_id`, `birth_date`, `photo_url`, `room_id`, `notes`, `contacts`, `deleted_at` |
| `employee_statements` | `employee_id`, `start_date` (datetime tz), `end_date` (datetime tz) |
| `employee_illnesses` | `employee_id`, `temp_room_id`, `start_date` (date), `end_date` (date) |
| `illness_notes` | `illness_id`, `admin_id`, `note`, `date` |
| `employee_change_history` | `employee_id`, `admin_id`, `action`, `field_name`, `old_value`, `new_value`, `changed_at` |
| `audit_log` | системный лог действий (отдельный модуль `audit/`) |

#### Миграции Alembic

| Ревизия | Описание |
|---|---|
| `20260522_0001` | Начальная схема (admins, roles, groups, rooms, employees, history) |
| `20260523_0002` | Добавлено поле `contacts` в employees |
| `20260526_0003` | Добавлена таблица `employee_statements` |
| `20260526_0004` | Добавлены таблицы `employee_illnesses` и `illness_notes` |

### Ошибки API

Все ошибки возвращают JSON `{code, message, details?}`. Ключевые коды:

| Код | HTTP | Описание |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Неверный логин/пароль |
| `NOT_AUTHENTICATED` | 401 | Нет токена |
| `PERMISSION_DENIED` | 403 | Нет нужного права |
| `PASSWORD_CHANGE_REQUIRED` | 403 | Первый вход, нужна смена пароля |
| `EMPLOYEE_NOT_FOUND` | 404 | Студент не найден |
| `ROOM_NOT_FOUND` | 404 | Комната не найдена |
| `ROOM_FULL` | 409 | Комната заполнена |
| `PHONE_ALREADY_EXISTS` | 409 | Дублирование телефона |
| `ALREADY_SICK` | 409 | Студент уже болеет |
| `RATE_LIMIT_EXCEEDED` | 429 | Слишком много попыток входа |
| `VALIDATION_ERROR` | 422 | Невалидные поля (`details.fields`) |

---

## Фронтенд (`frontend/`)

**Стек:** Next.js 14 (App Router), TypeScript, CSS Modules, @tanstack/react-query, React

### Структура

```
frontend/
├── app/
│   ├── layout.tsx                        — корневой layout, QueryClientProvider
│   ├── providers.tsx                     — ReactQuery провайдер
│   ├── globals.css                       — CSS-переменные (цвета, радиусы, тени)
│   ├── page.tsx                          — redirect → /students
│   ├── dashboard/page.tsx                — redirect → /students
│   ├── (auth)/                           — layout без сайдбара
│   │   ├── login/page.tsx                — форма входа
│   │   └── change-password/page.tsx      — смена пароля при первом входе
│   └── (dashboard)/                      — layout с сайдбаром (DashboardShell)
│       ├── layout.tsx
│       ├── students/
│       │   ├── page.tsx                  — список студентов
│       │   ├── new/page.tsx              — создание студента
│       │   ├── [id]/page.tsx             — карточка студента
│       │   ├── [id]/history/page.tsx     — история изменений студента
│       │   ├── StudentForm.tsx           — форма студента (создание + редактирование)
│       │   ├── IllnessBlock.tsx          — блок болезней студента
│       │   ├── student-form.module.css
│       │   ├── illness-block.module.css
│       │   └── students.module.css
│       ├── rooms/
│       │   ├── page.tsx                  — список комнат
│       │   ├── [id]/page.tsx             — карточка комнаты
│       │   ├── [id]/room-card.module.css
│       │   ├── bulk-create/page.tsx      — массовое создание комнат
│       │   └── rooms.module.css
│       ├── admins/
│       │   ├── page.tsx                  — список и управление администраторами
│       │   └── admins.module.css
│       └── roles/
│           ├── page.tsx                  — список и управление ролями
│           └── roles.module.css
├── components/
│   └── layout/
│       ├── DashboardShell.tsx            — сайдбар + навигация
│       └── DashboardShell.module.css
├── lib/
│   ├── api/
│   │   ├── client.ts                     — apiFetch / apiJson / HttpError
│   │   ├── employees.ts                  — API студентов, заявлений, болезней
│   │   ├── rooms.ts                      — API комнат + roomLabel()
│   │   ├── admins.ts                     — API администраторов
│   │   ├── roles.ts                      — API ролей
│   │   └── types.ts                      — общие типы
│   └── hooks/
│       └── useMe.ts                      — GET /api/auth/me + hasPermission()
└── middleware.ts                         — Auth middleware (Next.js Edge)
```

### Навигация (сайдбар)

```
Студенты   /students
Комнаты    /rooms
───────────
Администраторы  /admins
Роли            /roles
```

### Middleware (`middleware.ts`)

- Неавторизованный запрос на любой не-публичный путь → `/login`
- Авторизованный на `/` или `/dashboard` → `/students`
- Авторизованный на `/login` → `/students`
- Публичные пути: `/login`, `/change-password`
- Матчер исключает `/api/*`, `/_next/*`, `favicon.ico`

### Страницы

#### `/students` — список студентов
- Таблица: фото/аватар, ФИО, телефон, группа, комната (`X-Y-Z`), дата рождения + возраст
- Фильтры: поиск по ФИО/телефону (debounce 300ms), группа (select), корпус (select), кнопка «Больные» (фильтр `sick=true`)
- Красный ring вокруг аватара у больных студентов (отдельный запрос `sick=true`)
- Пагинация (limit=50, offset-based)
- Кнопка «Добавить студента» → `/students/new`

#### `/students/new` и `/students/[id]` — карточка студента
Форма (`StudentForm.tsx`) с секциями:
- **ФИО** — текстовое поле
- **Телефон** — маска `+7 (___) ___-__-__`, автозамена `8→+7`
- **Группа** — combobox с поиском (`GET /api/groups?search=`), опция «Создать группу "…"» → `POST /api/groups`
- **Дата рождения** — маска `ДД.ММ.ГГГГ` + кнопка-календарь, отображение возраста, маркер «несовершеннолетний» (< 18 лет)
- **Фото** — превью, кнопка загрузки (JPEG/PNG/WebP ≤5МБ), кнопка удаления
- **Комната** — combobox с умным поиском (компактный формат `818361` → `8-1-8361`), кнопка сброса; назначение через `PATCH /room`
- **Заметки** — textarea
- **Заявления** — список с датой и временем; диалог создания (дата+время начала, дата+время конца); кнопка удаления
- **Болезни** — `IllnessBlock.tsx` (см. ниже)
- Кнопки: Сохранить, Удалить, История изменений (`→ /students/[id]/history`)
- Значок `✕` (красный) у имени если студент болеет

#### `IllnessBlock.tsx` — блок болезней
- **Здоров**: отображает статус, кнопка «Заболел» → диалог (дата начала, временная комната, первая запись)
- **Болеет**: красная карточка с пульсирующей точкой, длительность болезни, временная комната с inline-редактированием (карандаш → select → сохранить/отмена), таймлайн записей, кнопки «+ Запись», «Выздоровел», иконка удаления болезни (с подтверждением)
- **История болезней**: аккордеон (chevron), период, длительность, количество записей; при раскрытии — временная комната, таймлайн, кнопка «Удалить болезнь»
- Последняя точка таймлайна: красная у активной болезни, зелёная у завершённой
- Временные комнаты: только `capacity === 1`
- Длительность: минимум 1 день (локальный парсинг дат без UTC-сдвига)

#### `/students/[id]/history` — история изменений
Таблица: поле, старое значение, новое значение, администратор, время

#### `/rooms` — список комнат
- Фильтры: поиск (умный: `814361` → корпус 8, подъезд 1, 4361), корпус, подъезд
- Таблица: корпус, подъезд, номер, вместимость, занято/свободно
- Создание комнаты (inline-форма), редактирование, удаление
- Кнопка «Массовое создание» → `/rooms/bulk-create`

#### `/rooms/[id]` — карточка комнаты
- Заголовок `X-Y-Z`, вместимость, статистика заполненности
- Список жильцов с аватарами + ссылками на карточки
- **Добавить жильца**: inline-поиск по студентам (исключает уже живущих), выбор → `PATCH /room`
- **Выселить**: кнопка на строке жильца → подтверждение → `PATCH /room {room_id: null}`
- **Переселить**: кнопка → диалог с combobox комнат → `PATCH /room`
- Редактирование параметров комнаты (вместимость, номер и т.д.)

#### `/rooms/bulk-create` — массовое создание
Форма для создания диапазона комнат одного подъезда

#### `/admins` — администраторы
Список, создание, редактирование, удаление. Назначение роли (select).

#### `/roles` — роли
Список ролей, создание/редактирование/удаление, управление набором permissions (чекбоксы).

### API-клиент (`lib/api/`)

**`client.ts`**
- `apiFetch()` — обёртка над `fetch` с `credentials: include` и авто-редиректом на `/login` при 401
- `apiJson<T>()` — парсинг JSON, кидает `HttpError(status, body)` при `!res.ok`
- `HttpError` — типизированная ошибка с `status` и `body: {code, message, details?}`

**`employees.ts`** — типы и функции для студентов, заявлений, болезней, фото, истории  
**`rooms.ts`** — типы и функции для комнат + `roomLabel(r)` → `"X-Y-Z"`  
**`admins.ts`** — типы и функции для администраторов  
**`roles.ts`** — типы и функции для ролей  

**`lib/hooks/useMe.ts`**
- `useMe()` — React Query хук, кеширует `GET /api/auth/me`
- `hasPermission(me, "domain:action")` — проверка права у текущего пользователя

### React Query

- Провайдер в `providers.tsx` (client component)
- Ключи кешей: `["employees", ...]`, `["rooms"]`, `["groups"]`, `["illnesses", empId]`, `["admins"]`, `["roles"]`, `["me"]`
- Инвалидация при мутациях через `qc.invalidateQueries()`
- `staleTime: 30_000` для списков больных студентов

### CSS

- CSS Modules (`.module.css`) для каждой страницы/компонента
- CSS-переменные в `globals.css`: `--accent`, `--border`, `--surface`, `--bg`, `--text-primary`, `--text-secondary`, `--text-muted`, `--error`, `--error-bg`, `--border-error`, `--radius-sm`, `--radius-md` и др.
- Цвета: OKLCH (`oklch(L% C H)`)
- Нет UI-библиотек — всё написано руками

---

## Тесты (`backend/tests/`)

```
tests/
├── conftest.py                      — фикстуры: тестовые DB, Redis, app, client
├── factories.py                     — фабрики объектов для тестов
├── integration/
│   ├── test_admins.py
│   ├── test_auth.py
│   ├── test_employees.py
│   ├── test_employees_photo.py
│   ├── test_groups.py
│   ├── test_roles.py
│   └── test_rooms.py
└── unit/
    ├── test_history_diff.py         — diff изменений для истории
    ├── test_permissions_check.py    — логика проверки прав
    ├── test_phone_normalize.py      — нормализация телефона
    └── test_room_range_parser.py    — парсер диапазонов комнат
```

Запуск: `docker exec aspirs-backend-1 pytest`

---

## Права (`permissions`)

Строки вида `domain:action`, хранятся в JSONB в `roles.permissions`.

| Право | Область |
|---|---|
| `employees:view` | Просмотр студентов |
| `employees:edit` | Создание/редактирование студентов, фото, заявления, болезни |
| `employees:delete` | Мягкое удаление студентов |
| `employees:assign_room` | Назначение комнаты студенту |
| `admins:view` | Просмотр администраторов |
| `admins:edit` | Создание/редактирование администраторов |
| `admins:delete` | Удаление администраторов |
| `roles:view` | Просмотр ролей |
| `roles:edit` | Управление ролями |
| `rooms:view` | Просмотр комнат |
| `rooms:edit` | Создание/редактирование комнат |
| `rooms:delete` | Удаление комнат |

---

## Деплой (обновление без пересборки)

```bash
# Скопировать изменённые файлы в контейнер
docker cp ./backend/app/employees/service.py aspirs-backend-1:/app/app/employees/service.py
docker cp ./frontend/app/\(dashboard\)/students/page.tsx aspirs-frontend-1:/app/app/\(dashboard\)/students/page.tsx

# Перезапустить
docker restart aspirs-backend-1
docker restart aspirs-frontend-1

# Миграции
docker exec aspirs-backend-1 alembic upgrade head
```

Revision IDs миграций — полные строки вида `"20260526_0003"`, не сокращённые.
