# PM Lite — Быстрый старт

## TL;DR — Демо-данные уже загружены

```
Логин: admin@pmgroup.ru
Пароль: Demo1234!
```
Все 11 пользователей имеют тот же пароль. Подробности — раздел «Демо-база» ниже.

---


## Предварительные требования

- Node.js 22+
- PostgreSQL 16 (установлен локально, сервис `postgresql-x64-16` запущен)

---

## 1. База данных (первый раз)

PostgreSQL уже установлен и запущен. При первой настройке нужно создать БД и пользователя.  
Откройте PowerShell от имени администратора:

```powershell
$env:PGPASSWORD = "postgres"
psql -U postgres -h 127.0.0.1 -c "CREATE USER pm_lite WITH PASSWORD 'pm_lite_dev';"
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE pm_lite OWNER pm_lite ENCODING 'UTF8';"
psql -U postgres -h 127.0.0.1 -c "ALTER USER pm_lite CREATEDB;"
psql -U postgres -h 127.0.0.1 -d pm_lite -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

> Пароль суперпользователя postgres был задан при установке. По умолчанию — `postgres`.

---

## 2. Бэкенд

```bash
cd backend

# Установить зависимости
npm install

# Применить миграции (создаёт все таблицы)
npm run db:migrate

# Заполнить дефолтные AI-промты
npm run db:seed

# Запустить dev-сервер
npm run dev
```

Бэкенд: http://localhost:3000  
Health check: http://localhost:3000/health

---

## 3. Фронтенд

```bash
cd frontend

# Установить зависимости
npm install

# Запустить dev-сервер
npm run dev
```

Фронтенд: http://localhost:5173

---

## Email в разработке

Без MailHog письма просто не отправятся (ошибка в консоли бэкенда), но остальное работает.  
Чтобы видеть письма — установите Docker Desktop и запустите:
```bash
docker compose up mailhog -d
```
MailHog UI: http://localhost:8025

---

## Сценарии A1

| Сценарий | URL |
|----------|-----|
| Регистрация организации | http://localhost:5173/register |
| Вступление в организацию | http://localhost:5173/register → таб «Вступить» |
| Принятие инвайта | http://localhost:5173/invite/:token |
| Подтверждение e-mail | http://localhost:5173/verify-email?token=... |
| Вход | http://localhost:5173/login |

---

---

## Демо-база данных

### Загрузить / сбросить демо-данные
```powershell
# Из папки backend:
npm run db:seed-demo
```
Идемпотентно: каждый запуск удаляет старую демо-организацию и создаёт свежую.

### Состав демо-базы
| | |
|---|---|
| Пользователей | 11 (admin, 2 РП, 2 Рук.подразд., 1 Адм.проекта, 4 исп., 1 наблюд.) |
| Клиентов | 4 (ТехноСтрой, ЭнергоМаш, Инфраструктура+, ДиджиталТех) |
| Проектов | 5 (2 активных Исполнение, 1 Планирование, 1 Архив, 1 внутренний) |
| Задач | 53 с иерархией, статусами, зависимостями |
| Трудозатраты / Комментарии | 37 записей / 10 комментариев |

### Учётные записи
```
admin@pmgroup.ru    — Алексей Воронов    (Администратор)
petrov@pmgroup.ru   — Мария Петрова      (Рук. проектов)
sidorov@pmgroup.ru  — Иван Сидоров       (Рук. проектов)
zaharov@pmgroup.ru  — Дмитрий Захаров    (Рук. подразделения ИТ)
morozov@pmgroup.ru  — Елена Морозова     (Рук. подразделения Стр-во)
kozlov@pmgroup.ru   — Андрей Козлов      (Администратор проекта)
novikov@pmgroup.ru  — Сергей Новиков     (Исполнитель / разработчик)
belova@pmgroup.ru   — Ольга Белова       (Исполнитель / аналитик)
lebedev@pmgroup.ru  — Кирилл Лебедев     (Исполнитель / инженер)
smirnov@pmgroup.ru  — Татьяна Смирнова   (Исполнитель / проектировщик)
popov@pmgroup.ru    — Владимир Попов     (Наблюдатель)
```
Пароль для всех: `Demo1234!`

---

## Управление dev-окружением (scripts/)

### Запуск
```powershell
.\scripts\start-dev.ps1
```
Открывает два окна PowerShell: backend (3000) и frontend (5173).

### Остановка
```powershell
.\scripts\stop-dev.ps1
```

### Сброс демо-данных (без перезапуска)
```powershell
.\scripts\reset-demo.ps1
```

### После завершения эпика — авто-сброс + перезапуск
```powershell
.\scripts\after-epic.ps1 -Epic "A4: Канбан-доска"
```
Выполняет: `db:seed-demo` → kill портов 3000/5173 → запуск backend → запуск frontend.

---

## API endpoints (A1)

```
POST /api/auth/register             — создать организацию + admin
POST /api/auth/join                 — запрос на вступление (is_active=false)
POST /api/auth/login                — войти
GET  /api/auth/verify-email?token=  — подтвердить e-mail
POST /api/auth/resend-verification  — переотправить письмо

POST /api/invitations               — создать инвайт (только admin, Bearer)
GET  /api/invitations/:token        — получить info об инвайте (публичный)
POST /api/invitations/:token/accept — принять инвайт
```
