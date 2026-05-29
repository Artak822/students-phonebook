# АСПиРС CRM

CRM-система управления общежитием: учёт студентов, комнат, болезней и заявлений.

## Стек

| Слой | Технологии |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, CSS Modules |
| Backend | FastAPI, SQLAlchemy (async), Alembic, Pydantic v2 |
| БД | PostgreSQL 16 |
| Сессии | Redis (JWT в httpOnly cookie) |
| Хранилище фото | MinIO (S3-совместимый) |
| Прокси | Nginx |
| Деплой | Docker Compose |

## Быстрый старт

### 1. Переменные окружения

Скопируйте `.env.example` в `.env` и заполните:

```bash
cp .env.example .env
```

Минимальный `.env`:

```env
DATABASE_URL=postgresql+asyncpg://aspirs:aspirs@db:5432/aspirs
REDIS_URL=redis://redis:6379/0
SECRET_KEY=замените-на-случайную-строку
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=aspirs
```

### 2. Запуск

```bash
docker compose up -d --build
```

Приложение доступно на `http://localhost`.

### 3. Создание первого администратора

```bash
docker compose exec backend python -m app.cli create-superadmin
```

Команда выведет логин и сгенерированный пароль.

### 4. Миграции

Применяются автоматически при старте. Для ручного запуска:

```bash
docker compose exec backend alembic upgrade head
```

## Структура проекта

```
.
├── backend/          # FastAPI-приложение
│   ├── app/
│   │   ├── admins/   # Управление администраторами
│   │   ├── auth/     # Аутентификация, JWT
│   │   ├── employees/# Студенты, история, болезни, заявления
│   │   ├── groups/   # Группы
│   │   ├── roles/    # Роли и права
│   │   ├── rooms/    # Комнаты
│   │   └── core/     # Зависимости, ошибки, middleware
│   └── alembic/      # Миграции БД
├── frontend/         # Next.js приложение
│   ├── app/
│   │   ├── (auth)/   # Страница входа
│   │   └── (dashboard)/  # Основные страницы
│   ├── components/   # Shared-компоненты (DatePicker, Toaster и др.)
│   └── lib/          # API-клиент, хуки, утилиты
└── nginx/            # Конфигурация reverse proxy
```

## Основные возможности

- Список студентов с поиском, фильтрами по группе, корпусу, болезни
- Карточка студента: данные, фото, комната, соседи, заявления, болезни, представители
- История изменений по каждому студенту (timeline с именем администратора)
- Управление комнатами: назначение/переселение жильцов, контроль вместимости
- Экспорт в Excel с любыми фильтрами
- Система ролей с настраиваемыми правами
- Индикация неполных карточек (нет фото, комнаты или представителей)

## API документация

Swagger UI доступен по адресу `http://localhost/docs` (только в development-режиме).

## Подробная техническая документация

Смотри [TECHNICAL.md](TECHNICAL.md).
