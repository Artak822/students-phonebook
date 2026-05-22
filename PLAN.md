# План разработки АСПиРС MVP №1

> Архитектурное решение зафиксировано в [ARCHITECTURE.md](ARCHITECTURE.md).  
> Фронтенд разрабатывается с помощью скилла `/impeccable` — в задачах ниже указано что передавать скиллу.

---

## Сквозные правила

- Integration-тесты пишутся **параллельно** с каждым модулем, не «потом».
- CI работает с первого дня: каждый PR и push в `main` запускает `pytest -n auto`.
- Этапы проходятся **вертикально**: backend + тесты + frontend — прежде чем переходить к следующему.
- Фронтенд: **не писать вручную**. Передавать задачу скиллу `/impeccable` с описанием экрана, эндпоинтов, компонентов и UX-правил из ARCHITECTURE.md.

---

## Этап 1 — Инфраструктура и каркас

**Цель:** всё поднимается локально, Alembic работает, базовые фикстуры для тестов готовы.

### Backend

- [ ] `docker-compose.yml` — сервисы: `db`, `redis`, `backend`, `frontend`, `nginx`, `minio` + `db_test`, `redis_test`; logging `x-defaults` (json-file, max-size 50m, max-file 5)
- [ ] Структура директорий backend (`app/`, `core/`, пустые `__init__.py` для каждого модуля)
- [ ] `app/config.py` — pydantic-settings; все переменные из раздела «Переменные окружения» ARCHITECTURE.md
- [ ] `app/database.py` — async engine (asyncpg) + session factory
- [ ] `alembic/env.py` — `compare_type=True`, `compare_server_default=True`
- [ ] Первая миграция — создание всех таблиц (`roles`, `admins`, `rooms`, `groups`, `employees`, `employee_change_history`, `audit_log`) + seed системных ролей
- [ ] `app/cli.py` — команда `create-superadmin` (интерактивный ввод пароля, не в логах)
- [ ] `app/main.py` — FastAPI app + lifespan + подключение middleware и роутеров
- [ ] `core/errors.py` — базовый `APIError` + все исключения из раздела «Базовые коды ошибок MVP» + три exception handler (`APIError`, `RequestValidationError`, `Exception`)
- [ ] Content-Type middleware — 415 для не-JSON/multipart на POST/PATCH/PUT/DELETE
- [ ] `core/logging.py` — structlog (JSON), request_id middleware, contextvars для `actor_id`/`actor_username`/`ip`; redactor для полей `password`, `token`, `refresh`, `secret`

### Тесты

- [ ] `backend/tests/conftest.py` — фикстуры: `db_session` (transaction rollback), `client` (httpx.AsyncClient), `super_admin`, `auth_client`, `tutor_admin`
- [ ] `backend/tests/factories.py` — `AdminFactory`, `RoleFactory`
- [ ] `.github/workflows/ci.yml` — services: postgres 16 + redis; `alembic upgrade head`; `pytest -v -n auto`

### Frontend (скилл `/impeccable`)

Этап 1 фронтенда: **нет**. Нужен работающий backend прежде чем поднимать UI.

---

## Этап 2 — Авторизация

**Цель:** логин работает, cookies выдаются, права проверяются, audit пишется.

### Backend

- [ ] `core/security.py` — JWT encode/decode, bcrypt hash/verify
- [ ] `core/dependencies.py` — `get_db`, `get_current_admin` (проверяет cookie + `is_active`), `require_permission("...")`
- [ ] `auth/schemas.py` — LoginRequest, TokenResponse (с `must_change_password`), ChangePasswordRequest, MeResponse
- [ ] `auth/service.py` — login, logout, refresh, change-password; инвалидация всех refresh при смене пароля кроме текущей сессии
- [ ] `auth/rate_limit.py` — Redis rate limiter: 10 попыток / 5 минут на IP
- [ ] `auth/router.py` — `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/refresh`, `POST /api/auth/change-password`, `GET /api/auth/me`
- [ ] Middleware блокировки при `password_changed=FALSE` — 403 `PASSWORD_CHANGE_REQUIRED` на все эндпоинты кроме `/auth/change-password` и `/auth/logout`
- [ ] Запись в `audit_log`: `auth.login.success`, `auth.login.failed`, `auth.login.rate_limited`, `auth.logout`, `auth.refresh.invalid`

### Тесты

- [ ] `tests/integration/test_auth.py`:
  - login success → cookies выданы
  - login неверный пароль → 401 `INVALID_CREDENTIALS` + audit
  - rate limit → 429 `RATE_LIMIT_EXCEEDED`
  - refresh success / invalid
  - logout инвалидирует refresh
  - `must_change_password=true` → все эндпоинты кроме change-password → 403
  - change-password success → флаг сброшен, старые refresh инвалидированы
  - невалидная cookie → 401 `NOT_AUTHENTICATED`

### Frontend (скилл `/impeccable`)

**Передать скиллу:**
- Два экрана: `/login` и `/change-password`
- `/login`: форма `username` + `password`, кнопка «Войти»; при `must_change_password=true` → редирект на `/change-password`; при 401 — сообщение об ошибке; при 429 — «Слишком много попыток»
- `/change-password`: форма `old_password` + `new_password` (мин. 8 символов, не равен старому); после успеха → редирект на `/dashboard`
- API: `POST /api/auth/login`, `POST /api/auth/change-password`; cookie управляется браузером автоматически
- Редирект на `/login` при получении 401 на любом запросе (глобальный interceptor в TanStack Query)

---

## Этап 3 — Администраторы и роли

**Цель:** super_admin управляет другими админами и ролями через UI.

### Backend

- [ ] `admins/models.py` — SQLAlchemy `Admin` (все поля из схемы, `ondelete="RESTRICT"` для `role_id`)
- [ ] `admins/schemas.py` — AdminCreate, AdminUpdate, AdminRead, AdminListResponse, GeneratedPasswordResponse
- [ ] `admins/service.py`:
  - create: генерация 16-символьного пароля, `password_changed=False`
  - update: PATCH отдельных полей
  - delete: запрет `SELF_DELETE_FORBIDDEN`, запрет `LAST_SUPER_ADMIN`
  - reset_password: генерация нового пароля, инвалидация всех refresh
- [ ] `admins/router.py` — `GET/POST /api/admins`, `GET/PATCH/DELETE /api/admins/{id}`, `POST /api/admins/{id}/reset-password`; все за `admins:manage`
- [ ] Audit-события: `admin.created`, `admin.deleted`, `admin.password_reset`, `admin.role_changed`
- [ ] `roles/models.py` — SQLAlchemy `Role`
- [ ] `roles/schemas.py` — RoleCreate, RoleUpdate, RoleRead
- [ ] `roles/service.py` — CRUD; запрет PATCH/DELETE на `is_system=True` (`IS_SYSTEM_ROLE`)
- [ ] `roles/router.py` — `GET/POST /api/roles`, `GET/PATCH/DELETE /api/roles/{id}`; за `roles:manage`
- [ ] Audit-события: `role.created`, `role.updated`, `role.deleted`, `role.permissions_changed` (с `details: {added, removed}`)

### Тесты

- [ ] `tests/unit/test_permissions_check.py` — проверка `require_permission` в изоляции
- [ ] `tests/integration/test_admins.py`:
  - CRUD полный сценарий
  - POST возвращает `generated_password`
  - DELETE себя → 400 `SELF_DELETE_FORBIDDEN`
  - DELETE последнего super_admin → 400 `LAST_SUPER_ADMIN`
  - reset_password → новый пароль, старые сессии инвалидированы
  - 403 для админа без `admins:manage`
- [ ] `tests/integration/test_roles.py`:
  - CRUD кастомных ролей
  - PATCH/DELETE системной роли → 400 `IS_SYSTEM_ROLE`
  - Изменение permissions → запись в `audit_log`

### Frontend (скилл `/impeccable`)

**Передать скиллу:**
- Страница `/admins`: таблица (username, ФИО, роль, активность), поиск + фильтр по роли; кнопка «Добавить»
- Форма создания/редактирования (модальная): username, ФИО, роль (select), is_active
- После создания — модальное окно с одноразовым паролем (`generated_password`) и кнопкой «Скопировать», предупреждение что пароль больше не показывается
- Кнопка «Сбросить пароль» → тот же modal с новым паролем
- Страница `/roles`: список ролей; создание/редактирование: название, описание, чекбоксы permissions (9 штук из ARCHITECTURE.md); системные роли — только просмотр, PATCH/DELETE заблокированы в UI
- API: все эндпоинты из раздела «Администраторы» и «Роли» ARCHITECTURE.md

---

## Этап 4 — Комнаты

**Цель:** комнаты создаются вручную и пачкой.

### Backend

- [ ] `rooms/models.py` — SQLAlchemy `Room` (CHECK constraints через `CheckConstraint`, `UniqueConstraint` на `building+entrance+room_number`)
- [ ] `rooms/schemas.py` — RoomCreate, RoomUpdate, RoomRead, BulkCreateRequest, BulkCreateResponse
- [ ] `rooms/service.py` — CRUD; DELETE: проверка `ROOM_HAS_STUDENTS`; bulk INSERT с проверкой дублей
- [ ] `rooms/bulk_create.py` — парсинг строки диапазона: `1001-1020`, `1001,1002`, `1001-1010,1020-1030`, `1001-1020,!1010`
- [ ] `rooms/router.py` — `GET/POST /api/rooms`, `POST /api/rooms/bulk`, `GET/PATCH/DELETE /api/rooms/{id}`, `GET /api/rooms/{id}/students`; за `rooms:view` / `rooms:manage`

### Тесты

- [ ] `tests/unit/test_room_range_parser.py` — диапазоны, списки, исключения, edge cases
- [ ] `tests/integration/test_rooms.py`:
  - CRUD
  - bulk-create: несколько диапазонов → правильное число комнат
  - DELETE заселённой → 400 `ROOM_HAS_STUDENTS`
  - дубль `building+entrance+room_number` → 409

### Frontend (скилл `/impeccable`)

**Передать скиллу:**
- Страница `/rooms`: таблица (корпус, подъезд, номер, вместимость, занято/свободно), фильтры по корпусу и подъезду; кнопки «Добавить» и «Добавить пачкой»
- Форма создания/редактирования комнаты: корпус, подъезд, номер, вместимость (всё числа > 0)
- Мастер `/rooms/bulk-create` — **2 шага**:
  - Шаг 1: корпус, подъезд, поле диапазона номеров (с подсказкой форматов: `1001-1020`, `1001,1002`, `1001-1010,1020-1030`), вместимость по умолчанию; кнопка «Далее» → отправляет на `/api/rooms/bulk` preview (или парсит на клиенте)
  - Шаг 2: редактируемая таблица — `room_number` (readonly) + `capacity` (input, предзаполнен дефолтом); кнопка «Создать всё» → `POST /api/rooms/bulk`
- API: все эндпоинты из раздела «Комнаты» ARCHITECTURE.md

---

## Этап 5 — Студенты

**Цель:** полная карточка студента с историей, фото, поиском, фильтрами.

### Backend

- [ ] `groups/models.py`, `groups/schemas.py`, `groups/service.py`, `groups/router.py` — CRUD; DELETE: проверка `GROUP_HAS_STUDENTS`; GET без пагинации, топ-50 по `search` (для combobox)
- [ ] `employees/models.py` — `Employee` (soft delete через `deleted_at`; partial indexes через `postgresql_where=text("deleted_at IS NULL")`), `EmployeeChangeHistory`
- [ ] `employees/schemas.py` — EmployeeCreate, EmployeeUpdate, EmployeeRead, EmployeeListResponse, HistoryResponse
- [ ] `employees/service.py`:
  - create/update/soft_delete
  - поиск: `ILIKE '%..%'` по `fio` + нормализация телефона (`re.sub(r'\D', '', q)`)
  - offset пагинация: `page`, `limit` (default 50, max 200), возвращает `{items, total, page, limit, total_pages}`
  - фильтры: `group_id`, `building`, `room_id`
  - assign_room: требует `employees:assign_room`
- [ ] `employees/history.py` — diff на update (одна запись на каждое изменённое поле); `action='create'`/`'delete'` — общая запись с `field_name=NULL`; фото не пишется
- [ ] Фото pipeline: Pillow (EXIF rotate → resize max 1024×1024 → JPEG q85); ключи `employees/{id}/{uuid}.jpg`; proxy GET (стриминг из S3, `Cache-Control: private, max-age=3600`); замена = удалить старый UUID + залить новый; soft delete не удаляет фото
- [ ] `employees/router.py` — все эндпоинты из раздела «Студенты» ARCHITECTURE.md

### Тесты

- [ ] `tests/unit/test_phone_normalize.py` — нормализация при поиске
- [ ] `tests/unit/test_history_diff.py` — diff генерирует правильные записи
- [ ] `tests/integration/test_groups.py` — CRUD, DELETE непустой → 400
- [ ] `tests/integration/test_employees.py`:
  - CRUD полный сценарий
  - soft delete: запись остаётся, `deleted_at` ставится, в списке не появляется
  - history пополняется при update (каждое поле отдельно)
  - поиск по ФИО и телефону (с форматированием и без)
  - пагинация: `total`, `total_pages`, `limit > 200` → 422
  - assign_room; 403 без `employees:assign_room`
  - `GROUP_HAS_STUDENTS` при удалении группы со студентами
  - Permission cross-cutting: 403 для нужных комбинаций
- [ ] `tests/integration/test_employees_photo.py` — upload, replace, delete (с моком S3-клиента); HEIC → 400; > 5 МБ → 422

### Frontend (скилл `/impeccable`)

**Передать скиллу:**
- Страница `/students`: таблица (ФИО, телефон, группа, комната, дата рождения + возраст, маркер несовершеннолетнего); поиск (ФИО + телефон); фильтры: группа (combobox), корпус, комната; пагинация
- Страница `/students/new` и `/students/[id]`: форма с полями:
  - ФИО (text)
  - Телефон: маска `+7 (___) ___-__-__`, автозамена `8` → `+7`
  - Группа: combobox с автодополнением (`GET /api/groups?search=`), внизу выпадашки — «Создать группу „<введённое>"» → `POST /api/groups` → группа сразу выбрана
  - Дата рождения: маска `ДД.ММ.ГГГГ` + кнопка-календарь; рядом возраст «(20 лет)»; маркер «несовершеннолетний» если < 18
  - Фото: превью + кнопка загрузки + удаление; только JPEG/PNG/WebP, до 5 МБ; при HEIC — ошибка «сохраните как JPEG»
  - Комната: select с кнопкой сбросить (assign_room — отдельный `PATCH /api/employees/{id}/room`)
  - Заметки (textarea)
- Страница `/students/[id]/history`: таблица изменений (поле, старое, новое, кто, когда)
- API: все эндпоинты из раздела «Студенты» ARCHITECTURE.md

---

## Этап 6 — Полировка и сдача

**Цель:** система готова к запуску в prod.

### Backend

- [ ] `GET /health` — проверяет DB (SELECT 1), Redis (PING), S3 (list bucket); 200 `{"status":"ok",...}` / 503 `{"status":"degraded",...}`
- [ ] `POST /internal/backup-event` — не пробрасывается через nginx; без auth; пишет `backup.success`/`backup.failed` в `audit_log`
- [ ] Sidecar `backup/Dockerfile` — alpine + `pg_dump` + `mc` + `cron`
- [ ] `backup/backup.sh` — pg_dump → S3, `find ... -mtime +$BACKUP_LOCAL_KEEP -delete`, `mc mirror` для фото, `curl` на `/internal/backup-event`
- [ ] `docker-compose.yml` — сервис `backup` с `depends_on: [db]`
- [ ] MinIO: bucket `asprs` versioning on + lifecycle (non-current → 30 days); bucket `asprs-backups` lifecycle (daily 30d, weekly 90d, monthly 365d)

### Frontend (скилл `/impeccable`)

**Передать скиллу:**
- Dashboard `/dashboard`: краткая статистика (всего студентов, свободных комнат, последние события аудита)
- Навигационный layout: sidebar с пунктами Студенты / Комнаты / Администраторы / Роли; имя и роль текущего пользователя; кнопка «Выйти» → `POST /api/auth/logout`
- Любые оставшиеся UX-полировки: empty states, loading skeletons, toast-уведомления при успехе/ошибке

### Документация

- [ ] `README.md`:
  - Запуск: `docker compose up`
  - Первый запуск: `docker compose run backend python -m app.cli create-superadmin`
  - Миграции: `alembic upgrade head`
  - Тесты: `pytest -v -n auto`
  - Restore PostgreSQL (команды из раздела «Восстановление» ARCHITECTURE.md)
  - Restore фото из versioning

### Финальная проверка

- [ ] Coverage ≥ 70% на сервисах и роутерах (`pytest --cov`)
- [ ] CI зелёный на `main`
- [ ] Ручная проверка сценариев: логин → смена пароля → создание студента → заселение в комнату → загрузка фото → просмотр истории → bulk-create комнат → создание admin → управление ролями → logout

---

## Быстрая справка: как запускать скилл для фронта

При начале каждого этапа фронтенда вызывать скилл `/impeccable` (product-register, строгий административный стиль):

```
/impeccable
```

И передать:
1. **Какой экран** (название страницы, URL, маршрут в App Router)
2. **Какие данные** показываются (поля, типы)
3. **Какие API-эндпоинты** использует (из ARCHITECTURE.md)
4. **UX-правила** специфичные для этого экрана (маски, combobox, одноразовый пароль и т.п.)
5. **Стек**: Next.js 14 App Router, TypeScript, TanStack Query v5, React Hook Form + Zod, react-imask
6. **Дизайн-контекст**: строгий административный (Vercel Dashboard / Linear), light theme, OKLCH-токены из `globals.css`

---

## Статус

| Этап | Статус |
|---|---|
| 1 — Инфраструктура | ✅ Готов |
| 2 — Авторизация | ✅ Готов |
| 3 — Администраторы и роли | ⬜ Не начат |
| 4 — Комнаты | ⬜ Не начат |
| 5 — Студенты | ⬜ Не начат |
| 6 — Полировка | ⬜ Не начат |
