# Гайд по инфраструктуре myapp-hello

> Полное руководство для разработчика. Описывает все инструменты, эндпоинты, CI/CD пайплайн,
> мониторинг и процедуры обслуживания. Написано так, чтобы Junior мог самостоятельно проверить
> и понять каждый компонент системы.

## Содержание

- [Архитектура проекта](#архитектура-проекта)
- [Локальная разработка](#локальная-разработка)
- [API эндпоинты](#api-эндпоинты)
- [Аутентификация](#аутентификация)
- [База данных](#база-данных)
- [CI/CD пайплайн](#cicd-пайплайн)
- [Деплой и окружения](#деплой-и-окружения)
- [Мониторинг и наблюдаемость](#мониторинг-и-наблюдаемость)
- [Бэкапы](#бэкапы)
- [Ansible и секреты](#ansible-и-секреты)
- [GitHub Secrets](#github-secrets)
- [Проверка вручную](#проверка-вручную)
- [Частые проблемы](#частые-проблемы)

---

## Архитектура проекта

Monorepo на базе Turborepo с npm workspaces:

```text
myapp-hello/
├── apps/
│   └── api/                    # @myapp/api — NestJS REST API
│       ├── src/
│       │   ├── main.ts         # Точка входа, Swagger, graceful shutdown
│       │   ├── app.module.ts   # Корневой модуль (config, logging, throttle, auth, db, metrics)
│       │   ├── app.controller.ts  # GET / и GET /health
│       │   ├── app.service.ts     # Бизнес-логика, статус БД
│       │   ├── instrumentation.ts # OpenTelemetry + Sentry SDK (загружается через --require)
│       │   ├── auth/           # JWT-аутентификация (глобальный guard)
│       │   ├── database/       # PostgreSQL через pg.Pool (глобальный модуль)
│       │   ├── metrics/        # Interceptor для метрик запросов
│       │   ├── db/             # Миграции (advisory lock + SQL файлы)
│       │   ├── config/         # Валидация env-переменных
│       │   └── __tests__/      # Интеграционные тесты (Vitest + supertest)
│       └── migrations/         # SQL-файлы миграций
├── packages/
│   ├── eslint-config/          # Общий ESLint конфиг
│   └── typescript-config/      # Общие tsconfig пресеты
├── infra/
│   ├── docker-compose.yml      # Локальная разработка (PostgreSQL, Grafana-стек)
│   └── ansible/                # Плейбуки для управления инфраструктурой
├── .github/workflows/          # CI/CD пайплайны
└── docs/                       # Документация
```

### Границы модулей (enforced by dependency-cruiser)

- `database/` НЕ может импортировать из `auth/` или `metrics/`
- Продакшн-код НЕ может импортировать из `__tests__/`
- Циклические зависимости запрещены

Проверить: `npm run check:arch`

---

## Локальная разработка

### Требования

- Node.js 22+ (LTS)
- npm 10+
- Docker + Docker Compose (для PostgreSQL и стека наблюдаемости)

### Первый запуск

```bash
# 1. Клонировать репозиторий
git clone <repo-url> && cd myapp-hello

# 2. Установить зависимости
npm install

# 3. Скопировать переменные окружения
cp .env.example .env
# Отредактировать .env — заполнить JWT_SECRET, DATABASE_URL

# 4. Запустить PostgreSQL
npm run dev:db
# Это поднимает docker-compose с postgres:17-alpine

# 5. Запустить API в dev-режиме
npm run dev
# API доступен на http://localhost:3001
```

### Основные команды

| Команда | Что делает |
|---------|------------|
| `npm run build` | Собирает все пакеты через Turbo |
| `npm run dev` | Запускает dev-сервер (watch mode) |
| `npm test` | Запускает тесты (Vitest, без coverage) |
| `npm run test:coverage` | Тесты с покрытием (пороги: 90/85/90/90) |
| `npm run lint` | ESLint проверка |
| `npm run format:check` | Prettier проверка (dry-run) |
| `npm run check:arch` | Проверка архитектурных зависимостей |
| `npm run dev:docker` | Полный стек (API + PostgreSQL) через Docker |
| `npm run dev:db` | Только PostgreSQL через Docker |

### Pre-commit хуки

При каждом `git commit` автоматически запускаются:

- **prettier** — форматирование `.ts`, `.json`, `.yml`, `.yaml`
- **markdownlint** — проверка `.md` файлов

Если хуки модифицировали файлы — нужно заново `git add` и сделать **новый** коммит (не `--amend`).

---

## API эндпоинты

Версионирование: URI-based (`/v1/...`). Инфраструктурные эндпоинты — без версии.

### Публичные

| Эндпоинт | Метод | Описание | Пример ответа |
|----------|-------|----------|---------------|
| `/health` | GET | Статус сервиса | `{ "status": "ok" }` |
| `/v1` | GET | Информация о приложении | `{ "message": "...", "env": "production", "app": "myapp-hello", "db": "connected", "timestamp": "..." }` |
| `/metrics` | GET | Prometheus-метрики | Текстовый формат Prometheus |
| `/docs` | GET | Swagger UI | HTML-страница |
| `/openapi.json` | GET | OpenAPI 3.0 спецификация | JSON |

### Проверка вручную

```bash
# Health check
curl https://apolenkov.duckdns.org/health
# → {"status":"ok"}

# Информация о приложении + статус БД
curl https://apolenkov.duckdns.org/v1
# → {"message":"...","db":"connected","env":"production",...}

# Prometheus-метрики
curl https://apolenkov.duckdns.org/metrics
# → # HELP http_request_duration_seconds ...

# Swagger UI — открыть в браузере
open https://apolenkov.duckdns.org/docs

# OpenAPI спецификация
curl https://apolenkov.duckdns.org/openapi.json | jq .info
```

### Rate Limiting

Глобальный throttle на все роуты (кроме `/health` и `/metrics`):

- **Лимит:** 100 запросов за 60 секунд с одного IP
- **Заголовки ответа:** `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`
- **При превышении:** HTTP 429 Too Many Requests

Настраивается через env: `THROTTLE_TTL` (мс) и `THROTTLE_LIMIT` (количество).

---

## Аутентификация

JWT Bearer Token (алгоритм HS256, время жизни 24 часа).

### Как работает

1. Клиент отправляет запрос с заголовком `Authorization: Bearer <token>`
2. `JwtAuthGuard` (глобальный) проверяет подпись токена через `JWT_SECRET`
3. Если токен невалидный → `401 { "error": "Unauthorized" }`
4. Публичные роуты помечены декоратором `@Public()` — пропускаются без токена

### Проверка

```bash
# Запрос без токена на защищённый роут → 401
curl -s https://apolenkov.duckdns.org/v1/protected
# → {"error":"Unauthorized"}

# Запрос с невалидным токеном → 401
curl -s -H "Authorization: Bearer invalid-token" https://apolenkov.duckdns.org/v1/protected
# → {"error":"Unauthorized"}
```

### JWT_SECRET

- Минимум 32 символа
- Уникальный на каждое окружение (prod, staging, dev)
- Хранится в Dokploy env vars + Ansible Vault
- Генерация: `openssl rand -base64 48`

---

## База данных

### PostgreSQL 17

Три отдельных инстанса (по одному на окружение):

| Окружение | Хост | БД | Пользователь |
|-----------|------|----|-------------|
| prod | postgres-prod | myapp_prod | prod_user |
| staging | postgres-staging | myapp_staging | staging_user |
| dev | postgres-dev | myapp_dev | dev_user |

### Подключение

```
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
```

Параметры пула:

- Максимум соединений: 20
- Таймаут подключения: 30 секунд
- Таймаут запроса: 30 секунд
- Graceful shutdown: 10 секунд

### Миграции

Запускаются автоматически при старте приложения:

1. Берётся advisory lock (`pg_advisory_xact_lock(7777777)`) — предотвращает параллельный запуск
2. Проверяется таблица `migrations` — какие уже выполнены
3. Выполняются новые `.sql` файлы из `migrations/` (по порядку имён)
4. Lock автоматически освобождается

### Проверка статуса БД

```bash
# Через API
curl https://apolenkov.duckdns.org/v1 | jq .db
# → "connected"

# Через SSH (прямой SQL-запрос)
ssh -i ~/.ssh/vps_key root@185.239.48.55 \
  "docker exec \$(docker ps --filter name=postgres-prod -q) \
   psql -U prod_user -d myapp_prod -c 'SELECT 1'"
```

---

## CI/CD пайплайн

### Общая схема

```text
Push в main
  ↓
[ci.yml] Quality Gates
  ├── Security audit (npm audit)
  ├── TypeScript strict mode (tsc --noEmit)
  ├── Prettier format check
  ├── YAML lint (.github/)
  ├── ESLint
  ├── Build compilation
  └── Architecture check (dependency-cruiser)
  ↓ (всё зелёное)
[ci.yml] Tests
  ├── Vitest с покрытием
  └── Отправка в Codecov
  ↓ (тесты прошли)
[ci.yml] Semantic Release
  └── Создаёт git tag + GitHub Release
  ↓
[deploy.yml] Build & Push → GHCR
  └── Docker multi-stage build → ghcr.io/apolenkov/myapp-api:<sha>
  ↓
[deploy.yml] Dev Deploy (автоматически, без одобрения)
  ↓ health check OK
[deploy.yml] Staging Deploy (ручное одобрение)
  ↓ health check OK
[deploy.yml] Prod Deploy (ручное одобрение)
  ↓ health check OK
Готово ✓
```

### Воркфлоу-файлы

| Файл | Расписание | Назначение |
|------|-----------|------------|
| `ci.yml` | На каждый push/PR | Quality gates + тесты + релиз |
| `deploy.yml` | После успешного CI | Сборка образа + деплой на 3 окружения |
| `uptime.yml` | Каждые 15 минут | Проверка доступности всех окружений |
| `db-backup.yml` | Ежедневно 03:00 UTC | Бэкап PostgreSQL в S3 |
| `cleanup.yml` | Воскресенье 02:00 UTC | Очистка старых Docker-образов в GHCR |

### Как проверить

```bash
# Последние запуски CI
gh run list --workflow=ci.yml --limit=5

# Последние деплои
gh run list --workflow=deploy.yml --limit=5

# Uptime-мониторинг
gh run list --workflow=uptime.yml --limit=5

# Бэкапы
gh run list --workflow=db-backup.yml --limit=5

# Логи упавшего запуска
gh run view <run-id> --log-failed
```

---

## Деплой и окружения

### Три окружения

| Окружение | URL | Деплой | LOG_LEVEL |
|-----------|-----|--------|-----------|
| **prod** | https://apolenkov.duckdns.org | Ручное одобрение | warn |
| **staging** | https://staging.apolenkov.duckdns.org | Ручное одобрение | info |
| **dev** | https://dev.apolenkov.duckdns.org | Автоматический | debug |

### Инфраструктура

- **VPS:** 185.239.48.55 (SSH: `ssh -i ~/.ssh/vps_key root@185.239.48.55`)
- **PaaS:** Dokploy (Docker Swarm) — http://185.239.48.55:3000
- **Reverse Proxy:** Traefik с Let's Encrypt (TLS 1.3, auto-renewal)
- **Registry:** GHCR (ghcr.io/apolenkov/myapp-api)

### Artifact Promotion

Один Docker-образ собирается один раз и деплоится на все окружения:

```text
Build → GHCR (tag: git SHA) → Dev → Staging → Prod
```

Все 3 окружения работают на **одном и том же** образе — различаются только env-переменными.

### Проверка деплоя

```bash
# Какой образ работает на каждом окружении
curl -s https://apolenkov.duckdns.org/v1 | jq '{env, app, db}'
curl -s https://staging.apolenkov.duckdns.org/v1 | jq '{env, app, db}'
curl -s https://dev.apolenkov.duckdns.org/v1 | jq '{env, app, db}'

# TLS-сертификат
echo | openssl s_client -connect apolenkov.duckdns.org:443 2>/dev/null | openssl x509 -noout -dates -subject

# Dokploy UI (веб-интерфейс)
open http://185.239.48.55:3000
```

### Env-переменные на каждом окружении

| Переменная | Описание | Где хранится |
|------------|----------|-------------|
| `NODE_ENV` | production / staging / development | Dokploy env |
| `APP_NAME` | myapp-hello | Dokploy env |
| `PORT` | 3001 | Dokploy env |
| `DATABASE_URL` | postgresql://... | Dokploy env + Ansible Vault |
| `JWT_SECRET` | 64 символа, уникальный | Dokploy env + Ansible Vault |
| `SENTRY_DSN` | https://...@sentry.io/... | Dokploy env + Ansible Vault |
| `LOG_LEVEL` | warn / info / debug | Dokploy env |

---

## Мониторинг и наблюдаемость

### Четыре столпа

| Столп | Инструмент | Эндпоинт/Порт |
|-------|-----------|---------------|
| **Логи** | nestjs-pino → Promtail → Loki | Loki :3100 |
| **Метрики** | OpenTelemetry → Prometheus | `/metrics`, Prometheus :9090 |
| **Трейсы** | OpenTelemetry → Tempo | Tempo :3200 |
| **Ошибки** | Sentry (`@sentry/nestjs`) | sentry.io |

### Логирование

- Формат: JSON (nestjs-pino)
- Каждый запрос получает уникальный UUID (`genReqId`)
- Уровни: `error` (5xx), `warn` (4xx), `info` (остальное)
- Управление: переменная `LOG_LEVEL`

### Метрики (Prometheus)

Доступны на `/metrics` в текстовом формате Prometheus:

- `http_request_duration_seconds` — гистограмма длительности запросов (method, route, status_code)
- `http_requests_total` — счётчик запросов

```bash
# Посмотреть метрики
curl https://apolenkov.duckdns.org/metrics

# Конкретная метрика
curl -s https://apolenkov.duckdns.org/metrics | grep http_requests_total
```

### Трейсы (OpenTelemetry → Tempo)

- Инструментация: HTTP, Express, PostgreSQL
- Экспорт: OTLP через HTTP (если задан `OTEL_EXPORTER_OTLP_ENDPOINT`)
- Интеграция: `SentrySpanProcessor` — связывает трейсы с ошибками Sentry

### Ошибки (Sentry)

- DSN: задаётся через `SENTRY_DSN` env var
- Без DSN — Sentry не активируется (no-op)
- Глобальный фильтр: `SentryGlobalFilter` ловит все исключения

```bash
# Проверить, что Sentry настроен (DSN в env vars)
curl -s -H "x-api-key: $DOKPLOY_TOKEN" \
  "http://185.239.48.55:3000/api/trpc/application.one?input=$(echo '{"json":{"applicationId":"YPBkMrtU6gGRi_nq-gHir"}}' | jq -sRr @uri)" \
  | jq -r '.result.data.json.env' | grep SENTRY
```

### Grafana

Локальный стек (docker-compose):

```bash
# Запустить полный стек наблюдаемости
docker compose -f infra/docker-compose.observability.yml up -d

# Открыть Grafana
open http://localhost:3000
# Логин: admin / $GRAFANA_ADMIN_PASSWORD
```

Предварительно настроены:

- Datasources: Prometheus, Loki, Tempo
- Dashboards: app-overview, node-runtime, logs-overview
- Alerts: (настраиваются в `provisioning/alerts.yml`)

---

## Бэкапы

### Автоматические бэкапы PostgreSQL

- **Расписание:** Ежедневно в 03:00 UTC
- **Хранение:** Yandex Object Storage (S3-совместимое)
- **Bucket:** `myapp-hellp`
- **Ретенция:** 7 последних копий
- **Триггер:** GitHub Actions `db-backup.yml`

### Проверка бэкапов

```bash
# Запустить бэкап вручную
gh workflow run db-backup.yml -f action=backup-now

# Проверить статус последнего бэкапа
gh run list --workflow=db-backup.yml --limit=3

# Через Dokploy API — посмотреть конфиги бэкапов
curl -s -H "x-api-key: $DOKPLOY_TOKEN" \
  "http://185.239.48.55:3000/api/trpc/postgres.one?input=$(echo '{"json":{"postgresId":"v6YxIy3dOSGbsPDLJyYU0"}}' | jq -sRr @uri)" \
  | jq '.result.data.json.backups'
```

### Ansible-плейбук для бэкапов

```bash
# Настроить бэкапы с нуля (S3 destination + schedules)
ansible-playbook infra/ansible/setup-db-backups.yml \
  -e @infra/ansible/vars/secrets.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")
```

---

## Ansible и секреты

### Структура

```text
infra/ansible/
├── vars/
│   ├── secrets.yml.example      # Шаблон (коммитится)
│   └── secrets.yml              # Реальные секреты (зашифрован Ansible Vault, в .gitignore)
├── setup-db-backups.yml         # Настройка бэкапов PostgreSQL
├── setup-environments.yml       # Настройка env vars на всех окружениях
└── rotate-db-passwords.yml      # Ротация паролей БД
```

### Что хранится в secrets.yml

- Dokploy API credentials (URL + токен)
- Application IDs (prod, staging, dev)
- PostgreSQL IDs и credentials
- JWT secrets (все 3 окружения)
- Sentry DSN
- Yandex S3 credentials
- VPS connection info

### Основные операции

```bash
# Пароль vault хранится в .env
source .env

# Посмотреть секреты
ansible-vault view infra/ansible/vars/secrets.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")

# Редактировать секреты
ansible-vault edit infra/ansible/vars/secrets.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")

# Настроить все окружения (env vars + deploy)
ansible-playbook infra/ansible/setup-environments.yml \
  -e @infra/ansible/vars/secrets.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")

# Ротация паролей БД (генерирует новые пароли + обновляет всё)
ansible-playbook infra/ansible/rotate-db-passwords.yml \
  -e @infra/ansible/vars/secrets.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")

# Только одно окружение
ansible-playbook infra/ansible/setup-environments.yml \
  -e @infra/ansible/vars/secrets.yml \
  -e target_env=prod \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")
```

---

## GitHub Secrets

Секреты хранятся в GitHub Settings → Secrets and Variables → Actions.

| Секрет | Назначение | Где используется |
|--------|-----------|-----------------|
| `DOKPLOY_URL` | URL Dokploy API | deploy.yml, db-backup.yml |
| `DOKPLOY_TOKEN` | API-ключ Dokploy | deploy.yml, db-backup.yml |
| `DOKPLOY_SERVICE_ID_PROD` | ID приложения (prod) | deploy.yml |
| `DOKPLOY_SERVICE_ID_STAGING` | ID приложения (staging) | deploy.yml |
| `DOKPLOY_SERVICE_ID_DEV` | ID приложения (dev) | deploy.yml |
| `DOKPLOY_DESTINATION_ID` | ID S3-назначения для бэкапов | db-backup.yml |
| `CODECOV_TOKEN` | Токен Codecov | ci.yml |
| `APP_PUBLIC_URL` | URL для health check (prod) | deploy.yml |
| `APP_PUBLIC_URL_STAGING` | URL для health check (staging) | deploy.yml |
| `APP_PUBLIC_URL_DEV` | URL для health check (dev) | deploy.yml |
| `SENTRY_DSN` | DSN Sentry | deploy.yml (env var) |
| `SENTRY_AUTH_TOKEN` | Auth-токен Sentry (для source maps) | ci.yml |
| `YANDEX_S3_ACCESS_KEY` | Ключ Yandex Object Storage | db-backup.yml |
| `YANDEX_S3_SECRET_KEY` | Секретный ключ Yandex S3 | db-backup.yml |

### Проверка

```bash
# Список всех секретов (значения не показываются)
gh secret list

# Установить/обновить секрет
gh secret set SECRET_NAME --body "value"
```

---

## Проверка вручную

### Полный чеклист

```bash
# 1. Health check на всех окружениях
curl -s https://apolenkov.duckdns.org/health | jq .
curl -s https://staging.apolenkov.duckdns.org/health | jq .
curl -s https://dev.apolenkov.duckdns.org/health | jq .

# 2. Статус БД
curl -s https://apolenkov.duckdns.org/v1 | jq .db
curl -s https://staging.apolenkov.duckdns.org/v1 | jq .db
curl -s https://dev.apolenkov.duckdns.org/v1 | jq .db

# 3. Метрики
curl -s https://apolenkov.duckdns.org/metrics | head -20

# 4. Swagger UI
open https://apolenkov.duckdns.org/docs

# 5. TLS-сертификат
echo | openssl s_client -connect apolenkov.duckdns.org:443 2>/dev/null \
  | openssl x509 -noout -dates

# 6. CI/CD статус
gh run list --limit=10

# 7. Uptime мониторинг
gh run list --workflow=uptime.yml --limit=5

# 8. Бэкапы
gh run list --workflow=db-backup.yml --limit=5

# 9. Docker-образы в GHCR
gh api user/packages/container/myapp-api/versions --jq '.[0:5] | .[] | {id, tags: .metadata.container.tags}'

# 10. SSH на VPS
ssh -i ~/.ssh/vps_key root@185.239.48.55 "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# 11. Dokploy UI
open http://185.239.48.55:3000

# 12. GitHub Secrets (проверить наличие)
gh secret list
```

---

## Частые проблемы

### Деплой не проходит (health check fail)

```bash
# Посмотреть логи деплоя
gh run view <run-id> --log-failed

# Проверить, что приложение запустилось
ssh -i ~/.ssh/vps_key root@185.239.48.55 \
  "docker ps --filter name=myapp"

# Посмотреть логи контейнера
ssh -i ~/.ssh/vps_key root@185.239.48.55 \
  "docker logs \$(docker ps --filter name=myapp-hello-prod -q) --tail 50"
```

### БД не подключается (`db: "not configured"`)

1. Проверить `DATABASE_URL` в env vars:
   ```bash
   curl -s -H "x-api-key: $DOKPLOY_TOKEN" \
     "http://185.239.48.55:3000/api/trpc/application.one?input=$(echo '{"json":{"applicationId":"YPBkMrtU6gGRi_nq-gHir"}}' | jq -sRr @uri)" \
     | jq -r '.result.data.json.env' | grep DATABASE
   ```
2. Проверить, что PostgreSQL запущен:
   ```bash
   ssh -i ~/.ssh/vps_key root@185.239.48.55 \
     "docker ps --filter name=postgres"
   ```
3. Проверить пароль:
   ```bash
   ssh -i ~/.ssh/vps_key root@185.239.48.55 \
     "docker exec \$(docker ps --filter name=postgres-prod -q) \
      psql -U prod_user -d myapp_prod -c 'SELECT 1'"
   ```

### 502 Bad Gateway

Traefik не может найти сервис. Проверить:

```bash
# Docker Swarm имена сервисов
ssh -i ~/.ssh/vps_key root@185.239.48.55 \
  "docker service ls"

# Traefik dynamic config
ssh -i ~/.ssh/vps_key root@185.239.48.55 \
  "cat /etc/dokploy/traefik/dynamic/*.yml"
```

### Тесты не проходят локально

```bash
# Убедиться, что PostgreSQL запущен
npm run dev:db

# Запустить тесты с подробностями
npm test -- --reporter=verbose

# Проверить покрытие
npm run test:coverage
```

### Pre-commit хук сломал коммит

```bash
# Посмотреть, что изменил хук
git diff

# Добавить исправления и сделать НОВЫЙ коммит (не amend!)
git add .
git commit -m "fix: apply formatting from pre-commit hook"
```

---

## Словарь терминов

| Термин | Описание |
|--------|----------|
| **Turborepo** | Система сборки для monorepo, кеширует результаты |
| **NestJS** | Node.js фреймворк (модули, DI, декораторы) |
| **Dokploy** | Self-hosted PaaS (аналог Heroku) на Docker Swarm |
| **GHCR** | GitHub Container Registry — хранилище Docker-образов |
| **Artifact Promotion** | Один образ деплоится на все окружения |
| **Traefik** | Reverse proxy с автоматическим Let's Encrypt |
| **OpenTelemetry (OTel)** | Стандарт наблюдаемости (метрики, трейсы, логи) |
| **Ansible Vault** | Шифрование файлов с секретами |
| **Advisory Lock** | PostgreSQL-механизм для предотвращения параллельных миграций |
| **Semantic Release** | Автоматическое версионирование по conventional commits |
