# myapp-hello Infrastructure Guide

> Complete developer guide. Describes all tools, endpoints, CI/CD pipeline, monitoring, and
> maintenance procedures. Written so that a junior developer can independently verify and understand
> every component of the system.

## Table of Contents

- [Project Architecture](#project-architecture)
- [Local Development](#local-development)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Database](#database)
- [CI/CD Pipeline](#cicd-pipeline)
- [Deployment and Environments](#deployment-and-environments)
- [Monitoring and Observability](#monitoring-and-observability)
- [Backups](#backups)
- [Ansible and Secrets](#ansible-and-secrets)
- [GitHub Secrets](#github-secrets)
- [Manual Verification](#manual-verification)
- [Common Issues](#common-issues)

---

## Project Architecture

Monorepo based on Turborepo with npm workspaces:

```text
myapp-hello/
├── apps/
│   └── api/                    # @myapp/api — NestJS REST API
│       ├── src/
│       │   ├── main.ts         # Entry point, Swagger, graceful shutdown
│       │   ├── app.module.ts   # Root module (config, logging, throttle, auth, db, metrics)
│       │   ├── app.controller.ts  # GET / and GET /health
│       │   ├── app.service.ts     # Business logic, DB status (ping)
│       │   ├── instrumentation.ts # OpenTelemetry + Sentry SDK (loaded via --require)
│       │   ├── auth/           # JWT authentication (global guard)
│       │   ├── database/       # PostgreSQL via pg.Pool (global module)
│       │   ├── metrics/        # Request metrics interceptor
│       │   ├── db/             # Migrations (advisory lock + SQL files)
│       │   ├── config/         # Environment variable validation
│       │   └── __tests__/      # Integration tests (Vitest + supertest)
│       └── migrations/         # SQL migration files
├── packages/
│   ├── eslint-config/          # Shared ESLint config
│   └── typescript-config/      # Shared tsconfig presets
├── infra/
│   ├── docker-compose.yml      # Local development (PostgreSQL, Grafana stack)
│   └── ansible/                # Infrastructure management playbooks
├── .github/workflows/          # CI/CD pipelines
└── docs/                       # Documentation
```

### Module Boundaries (enforced by dependency-cruiser)

- `database/` must NOT import from `auth/` or `metrics/`
- Production code must NOT import from `__tests__/`
- Circular dependencies are forbidden

Verify: `npm run check:arch`

---

## Local Development

### Requirements

- Node.js 22+ (LTS)
- npm 10+
- Docker + Docker Compose (for PostgreSQL and the observability stack)

### First Run

```bash
# 1. Clone the repository
git clone <repo-url> && cd myapp-hello

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env
# Edit .env — fill in JWT_SECRET, DATABASE_URL

# 4. Start PostgreSQL
npm run dev:db
# This starts docker-compose with postgres:17-alpine

# 5. Start the API in dev mode
npm run dev
# API is available at http://localhost:3001
```

### Main Commands

| Command                 | Description                                   |
| ----------------------- | --------------------------------------------- |
| `npm run build`         | Build all packages via Turbo                  |
| `npm run dev`           | Start dev server (watch mode)                 |
| `npm test`              | Run tests (Vitest, no coverage)               |
| `npm run test:coverage` | Tests with coverage (thresholds: 90/85/90/90) |
| `npm run lint`          | ESLint check                                  |
| `npm run format:check`  | Prettier check (dry-run)                      |
| `npm run check:arch`    | Check architectural dependencies              |
| `npm run dev:docker`    | Full stack (API + PostgreSQL) via Docker      |
| `npm run dev:db`        | PostgreSQL only via Docker                    |

### Pre-commit Hooks

On every `git commit`, the following run automatically:

- **prettier** — formats `.ts`, `.json`, `.yml`, `.yaml`
- **markdownlint** — checks `.md` files

If hooks modified files, you need to `git add` again and create a **new** commit (not `--amend`).

---

## API Endpoints

Versioning: URI-based (`/v1/...`). Infrastructure endpoints have no version prefix.

### Public

| Endpoint        | Method | Description               | Example Response                                                                                         |
| --------------- | ------ | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/health`       | GET    | Service status            | `{ "status": "ok" }`                                                                                     |
| `/v1`           | GET    | Application info          | `{ "message": "...", "env": "production", "app": "myapp-hello", "db": "connected", "timestamp": "..." }` |
| `/metrics`      | GET    | Prometheus metrics        | Prometheus text format                                                                                   |
| `/docs`         | GET    | Swagger UI                | HTML page                                                                                                |
| `/openapi.json` | GET    | OpenAPI 3.0 specification | JSON                                                                                                     |

### Manual Verification

```bash
# Health check
curl https://apolenkov.duckdns.org/health
# → {"status":"ok"}

# Application info + DB status
curl https://apolenkov.duckdns.org/v1
# → {"message":"...","db":"connected","env":"production",...}

# Prometheus metrics
curl https://apolenkov.duckdns.org/metrics
# → # HELP http_request_duration_seconds ...

# Swagger UI — open in browser
open https://apolenkov.duckdns.org/docs

# OpenAPI specification
curl https://apolenkov.duckdns.org/openapi.json | jq .info
```

### Rate Limiting

Global throttle on all routes (except `/health` and `/metrics`):

- **Limit:** 100 requests per 60 seconds from a single IP
- **Response headers:** `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`
- **On exceeding:** HTTP 429 Too Many Requests

Configured via env: `THROTTLE_TTL` (ms) and `THROTTLE_LIMIT` (count).

---

## Authentication

JWT Bearer Token (HS256 algorithm, 24-hour expiry).

### How It Works

1. Client sends a request with `Authorization: Bearer <token>` header
2. `JwtAuthGuard` (global) verifies the token signature using `JWT_SECRET`
3. If the token is invalid, returns `401 { "error": "Unauthorized" }`
4. Public routes marked with `@Public()` decorator are allowed without a token

### Verification

```bash
# Request without token to a protected route → 401
curl -s https://apolenkov.duckdns.org/v1/protected
# → {"error":"Unauthorized"}

# Request with invalid token → 401
curl -s -H "Authorization: Bearer invalid-token" https://apolenkov.duckdns.org/v1/protected
# → {"error":"Unauthorized"}
```

### JWT_SECRET

- Minimum 32 characters
- Unique per environment (prod, staging, dev)
- Stored in Dokploy env vars + Ansible Vault
- Generation: `openssl rand -base64 48`

---

## Database

### PostgreSQL 17

Three separate instances (one per environment):

| Environment | Host             | Database      | User         |
| ----------- | ---------------- | ------------- | ------------ |
| prod        | postgres-prod    | myapp_prod    | prod_user    |
| staging     | postgres-staging | myapp_staging | staging_user |
| dev         | postgres-dev     | myapp_dev     | dev_user     |

### Connection

```
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
```

Pool parameters:

- Max connections: 20
- Connection timeout: 30 seconds
- Statement timeout: 30 seconds
- Graceful shutdown: 10 seconds

### Migrations

Migrations run automatically on application startup:

1. An advisory lock (`pg_advisory_xact_lock(7777777)`) is acquired to prevent parallel execution
2. The `migrations` table is checked for already-executed migrations
3. New `.sql` files from `migrations/` are executed (in filename order)
4. The lock is released automatically

### Checking DB Status

```bash
# Via API (ping)
curl https://apolenkov.duckdns.org/v1 | jq .db
# → "connected"

# Via SSH (direct SQL query)
ssh -i ~/.ssh/vps_key root@185.239.48.55 \
  "docker exec \$(docker ps --filter name=postgres-prod -q) \
   psql -U prod_user -d myapp_prod -c 'SELECT 1'"
```

---

## CI/CD Pipeline

### Overview

```text
Push to main
  ↓
[ci.yml] Quality Gates
  ├── Security audit (npm audit)
  ├── TypeScript strict mode (tsc --noEmit)
  ├── Prettier format check
  ├── YAML lint (.github/)
  ├── ESLint
  ├── Build compilation
  └── Architecture check (dependency-cruiser)
  ↓ (all green)
[ci.yml] Tests
  ├── Vitest with coverage
  └── Upload to Codecov
  ↓ (tests passed)
[ci.yml] Semantic Release
  └── Creates git tag + GitHub Release
  ↓
[deploy.yml] Build & Push → GHCR
  └── Docker multi-stage build → ghcr.io/apolenkov/myapp-api:<sha>
  ↓
[deploy.yml] Dev Deploy (automatic, no approval)
  ↓ health check OK
[deploy.yml] Staging Deploy (manual approval)
  ↓ health check OK
[deploy.yml] Prod Deploy (manual approval)
  ↓ health check OK
Done ✓
```

### Workflow Files

| File            | Schedule            | Purpose                                 |
| --------------- | ------------------- | --------------------------------------- |
| `ci.yml`        | On every push/PR    | Quality gates + tests + release         |
| `deploy.yml`    | After successful CI | Image build + deploy to 3 environments  |
| `uptime.yml`    | Every 15 minutes    | Availability check for all environments |
| `db-backup.yml` | Daily at 03:00 UTC  | PostgreSQL backup to S3                 |
| `cleanup.yml`   | Sunday at 02:00 UTC | Cleanup of old Docker images in GHCR    |

### How to Verify

```bash
# Recent CI runs
gh run list --workflow=ci.yml --limit=5

# Recent deployments
gh run list --workflow=deploy.yml --limit=5

# Uptime monitoring
gh run list --workflow=uptime.yml --limit=5

# Backups
gh run list --workflow=db-backup.yml --limit=5

# Logs of a failed run
gh run view <run-id> --log-failed
```

---

## Deployment and Environments

### Three Environments

| Environment | URL                                   | Deployment      | LOG_LEVEL |
| ----------- | ------------------------------------- | --------------- | --------- |
| **prod**    | https://apolenkov.duckdns.org         | Manual approval | warn      |
| **staging** | https://staging.apolenkov.duckdns.org | Manual approval | info      |
| **dev**     | https://dev.apolenkov.duckdns.org     | Automatic       | debug     |

### Infrastructure

- **VPS:** 185.239.48.55 (SSH: `ssh -i ~/.ssh/vps_key root@185.239.48.55`)
- **PaaS:** Dokploy (Docker Swarm) — http://185.239.48.55:3000
- **Reverse Proxy:** Traefik with Let's Encrypt (TLS 1.3, auto-renewal)
- **Registry:** GHCR (ghcr.io/apolenkov/myapp-api)

### Artifact Promotion

A single Docker image is built once and deployed to all environments:

```text
Build → GHCR (tag: git SHA) → Dev → Staging → Prod
```

All 3 environments run the **same** image — they differ only in environment variables.

### Verifying Deployment

```bash
# Which image is running on each environment
curl -s https://apolenkov.duckdns.org/v1 | jq '{env, app, db}'
curl -s https://staging.apolenkov.duckdns.org/v1 | jq '{env, app, db}'
curl -s https://dev.apolenkov.duckdns.org/v1 | jq '{env, app, db}'

# TLS certificate
echo | openssl s_client -connect apolenkov.duckdns.org:443 2>/dev/null | openssl x509 -noout -dates -subject

# Dokploy UI (web interface)
open http://185.239.48.55:3000
```

### Environment Variables per Environment

| Variable       | Description                        | Stored In                   |
| -------------- | ---------------------------------- | --------------------------- |
| `NODE_ENV`     | production / staging / development | Dokploy env                 |
| `APP_NAME`     | myapp-hello                        | Dokploy env                 |
| `PORT`         | 3001                               | Dokploy env                 |
| `DATABASE_URL` | postgresql://...                   | Dokploy env + Ansible Vault |
| `JWT_SECRET`   | 64 characters, unique              | Dokploy env + Ansible Vault |
| `SENTRY_DSN`   | https://...@sentry.io/...          | Dokploy env + Ansible Vault |
| `LOG_LEVEL`    | warn / info / debug                | Dokploy env                 |

---

## Monitoring and Observability

### Four Pillars

| Pillar      | Tool                          | Endpoint/Port                |
| ----------- | ----------------------------- | ---------------------------- |
| **Logs**    | nestjs-pino → Promtail → Loki | Loki :3100                   |
| **Metrics** | OpenTelemetry → Prometheus    | `/metrics`, Prometheus :9090 |
| **Traces**  | OpenTelemetry → Tempo         | Tempo :3200                  |
| **Errors**  | Sentry (`@sentry/nestjs`)     | sentry.io                    |

### Logging

- Format: JSON (nestjs-pino)
- Each request gets a unique UUID (`genReqId`)
- Levels: `error` (5xx), `warn` (4xx), `info` (everything else)
- Control: `LOG_LEVEL` environment variable

### Metrics (Prometheus)

Available at `/metrics` in Prometheus text format:

- `http_request_duration_seconds` — request duration histogram (method, route, status_code)
- `http_requests_total` — request counter

```bash
# View metrics
curl https://apolenkov.duckdns.org/metrics

# Specific metric
curl -s https://apolenkov.duckdns.org/metrics | grep http_requests_total
```

### Traces (OpenTelemetry → Tempo)

- Instrumentation: HTTP, Express, PostgreSQL
- Export: OTLP via HTTP (when `OTEL_EXPORTER_OTLP_ENDPOINT` is set)
- Integration: `SentrySpanProcessor` — links traces with Sentry errors

### Errors (Sentry)

- DSN: set via `SENTRY_DSN` env var
- Without DSN — Sentry is not activated (no-op)
- Global filter: `SentryGlobalFilter` catches all exceptions

```bash
# Check that Sentry is configured (DSN in env vars)
curl -s -H "x-api-key: $DOKPLOY_TOKEN" \
  "http://185.239.48.55:3000/api/trpc/application.one?input=$(echo '{"json":{"applicationId":"YPBkMrtU6gGRi_nq-gHir"}}' | jq -sRr @uri)" \
  | jq -r '.result.data.json.env' | grep SENTRY
```

### Grafana Cloud

Dashboards and alerts are managed through Grafana Cloud (not a local instance).

Only 2 agents run on the VPS (Promtail + Alloy), pushing telemetry to Grafana Cloud:

```bash
# Start observability agents on the VPS
cd /opt/observability
docker compose -f docker-compose.observability.yml up -d

# Check agent status
docker ps | grep -E 'promtail|alloy'
```

Dashboard configurations are stored in `observability/grafana/dashboards/` for version control:

- app-overview, node-runtime, logs-overview, api-telemetry

---

## Backups

### Automatic PostgreSQL Backups

- **Schedule:** Daily at 03:00 UTC
- **Storage:** Yandex Object Storage (S3-compatible)
- **Bucket:** `myapp-hello`
- **Retention:** 7 latest copies
- **Trigger:** GitHub Actions `db-backup.yml`

### Verifying Backups

```bash
# Run a backup manually
gh workflow run db-backup.yml -f action=backup-now

# Check the status of the latest backup
gh run list --workflow=db-backup.yml --limit=3

# Via Dokploy API — view backup configurations
curl -s -H "x-api-key: $DOKPLOY_TOKEN" \
  "http://185.239.48.55:3000/api/trpc/postgres.one?input=$(echo '{"json":{"postgresId":"v6YxIy3dOSGbsPDLJyYU0"}}' | jq -sRr @uri)" \
  | jq '.result.data.json.backups'
```

### Ansible Playbook for Backups

```bash
# Set up backups from scratch (S3 destination + schedules)
ansible-playbook infra/ansible/setup-db-backups.yml \
  -e @infra/ansible/vars/secrets.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")
```

---

## Ansible and Secrets

### Structure

```text
infra/ansible/
├── vars/
│   ├── secrets.yml.example      # Template (committed)
│   └── secrets.yml              # Real secrets (encrypted with Ansible Vault, in .gitignore)
├── setup-db-backups.yml         # PostgreSQL backup setup
├── setup-environments.yml       # Environment variable setup for all environments
└── rotate-db-passwords.yml      # DB password rotation
```

### What Is Stored in secrets.yml

- Dokploy API credentials (URL + token)
- Application IDs (prod, staging, dev)
- PostgreSQL IDs and credentials
- JWT secrets (all 3 environments)
- Sentry DSN
- Yandex S3 credentials
- VPS connection info

### Main Operations

```bash
# Vault password is stored in .env
source .env

# View secrets
ansible-vault view infra/ansible/vars/secrets.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")

# Edit secrets
ansible-vault edit infra/ansible/vars/secrets.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")

# Set up all environments (env vars + deploy)
ansible-playbook infra/ansible/setup-environments.yml \
  -e @infra/ansible/vars/secrets.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")

# DB password rotation (generates new passwords + updates everything)
ansible-playbook infra/ansible/rotate-db-passwords.yml \
  -e @infra/ansible/vars/secrets.yml \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")

# Single environment only
ansible-playbook infra/ansible/setup-environments.yml \
  -e @infra/ansible/vars/secrets.yml \
  -e target_env=prod \
  --vault-password-file <(echo "$ANSIBLE_VAULT_PASSWORD")
```

---

## GitHub Secrets

Secrets are stored in GitHub Settings → Secrets and Variables → Actions.

| Secret                       | Purpose                             | Used In                   |
| ---------------------------- | ----------------------------------- | ------------------------- |
| `DOKPLOY_URL`                | Dokploy API URL                     | deploy.yml, db-backup.yml |
| `DOKPLOY_TOKEN`              | Dokploy API key                     | deploy.yml, db-backup.yml |
| `DOKPLOY_SERVICE_ID_PROD`    | Application ID (prod)               | deploy.yml                |
| `DOKPLOY_SERVICE_ID_STAGING` | Application ID (staging)            | deploy.yml                |
| `DOKPLOY_SERVICE_ID_DEV`     | Application ID (dev)                | deploy.yml                |
| `DOKPLOY_DESTINATION_ID`     | S3 destination ID for backups       | db-backup.yml             |
| `CODECOV_TOKEN`              | Codecov token                       | ci.yml                    |
| `APP_PUBLIC_URL`             | Health check URL (prod)             | deploy.yml                |
| `APP_PUBLIC_URL_STAGING`     | Health check URL (staging)          | deploy.yml                |
| `APP_PUBLIC_URL_DEV`         | Health check URL (dev)              | deploy.yml                |
| `SENTRY_DSN`                 | Sentry DSN                          | deploy.yml (env var)      |
| `SENTRY_AUTH_TOKEN`          | Sentry auth token (for source maps) | ci.yml                    |
| `YANDEX_S3_ACCESS_KEY`       | Yandex Object Storage key           | db-backup.yml             |
| `YANDEX_S3_SECRET_KEY`       | Yandex Object Storage secret key    | db-backup.yml             |

### Verification

```bash
# List all secrets (values are not shown)
gh secret list

# Set/update a secret
gh secret set SECRET_NAME --body "value"
```

---

## Manual Verification

### Full Checklist

```bash
# 1. Health check on all environments
curl -s https://apolenkov.duckdns.org/health | jq .
curl -s https://staging.apolenkov.duckdns.org/health | jq .
curl -s https://dev.apolenkov.duckdns.org/health | jq .

# 2. DB status
curl -s https://apolenkov.duckdns.org/v1 | jq .db
curl -s https://staging.apolenkov.duckdns.org/v1 | jq .db
curl -s https://dev.apolenkov.duckdns.org/v1 | jq .db

# 3. Metrics
curl -s https://apolenkov.duckdns.org/metrics | head -20

# 4. Swagger UI
open https://apolenkov.duckdns.org/docs

# 5. TLS certificate
echo | openssl s_client -connect apolenkov.duckdns.org:443 2>/dev/null \
  | openssl x509 -noout -dates

# 6. CI/CD status
gh run list --limit=10

# 7. Uptime monitoring
gh run list --workflow=uptime.yml --limit=5

# 8. Backups
gh run list --workflow=db-backup.yml --limit=5

# 9. Docker images in GHCR
gh api user/packages/container/myapp-api/versions --jq '.[0:5] | .[] | {id, tags: .metadata.container.tags}'

# 10. SSH to VPS
ssh -i ~/.ssh/vps_key root@185.239.48.55 "docker ps --format 'table {{.Names}}\t{{.Status}}'"

# 11. Dokploy UI
open http://185.239.48.55:3000

# 12. GitHub Secrets (check existence)
gh secret list
```

---

## Common Issues

### Deployment Fails (health check fail)

```bash
# View deployment logs
gh run view <run-id> --log-failed

# Check that the application started
ssh -i ~/.ssh/vps_key root@185.239.48.55 \
  "docker ps --filter name=myapp"

# View container logs
ssh -i ~/.ssh/vps_key root@185.239.48.55 \
  "docker logs \$(docker ps --filter name=myapp-hello-prod -q) --tail 50"
```

### DB Not Connecting (`db: "not configured"`)

1. Check `DATABASE_URL` in env vars:
   ```bash
   curl -s -H "x-api-key: $DOKPLOY_TOKEN" \
     "http://185.239.48.55:3000/api/trpc/application.one?input=$(echo '{"json":{"applicationId":"YPBkMrtU6gGRi_nq-gHir"}}' | jq -sRr @uri)" \
     | jq -r '.result.data.json.env' | grep DATABASE
   ```
2. Check that PostgreSQL is running:
   ```bash
   ssh -i ~/.ssh/vps_key root@185.239.48.55 \
     "docker ps --filter name=postgres"
   ```
3. Check the password:
   ```bash
   ssh -i ~/.ssh/vps_key root@185.239.48.55 \
     "docker exec \$(docker ps --filter name=postgres-prod -q) \
      psql -U prod_user -d myapp_prod -c 'SELECT 1'"
   ```

### 502 Bad Gateway

Traefik cannot find the service. Check:

```bash
# Docker Swarm service names
ssh -i ~/.ssh/vps_key root@185.239.48.55 \
  "docker service ls"

# Traefik dynamic config
ssh -i ~/.ssh/vps_key root@185.239.48.55 \
  "cat /etc/dokploy/traefik/dynamic/*.yml"
```

### Tests Failing Locally

```bash
# Make sure PostgreSQL is running
npm run dev:db

# Run tests with verbose output
npm test -- --reporter=verbose

# Check coverage
npm run test:coverage
```

### Pre-commit Hook Broke the Commit

```bash
# See what the hook changed
git diff

# Add the fixes and create a NEW commit (not amend!)
git add .
git commit -m "fix: apply formatting from pre-commit hook"
```

---

## Glossary

| Term                     | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| **Turborepo**            | Build system for monorepos, caches results            |
| **NestJS**               | Node.js framework (modules, DI, decorators)           |
| **Dokploy**              | Self-hosted PaaS (Heroku alternative) on Docker Swarm |
| **GHCR**                 | GitHub Container Registry — Docker image storage      |
| **Artifact Promotion**   | A single image is deployed to all environments        |
| **Traefik**              | Reverse proxy with automatic Let's Encrypt            |
| **OpenTelemetry (OTel)** | Observability standard (metrics, traces, logs)        |
| **Ansible Vault**        | Encryption for files containing secrets               |
| **Advisory Lock**        | PostgreSQL mechanism to prevent parallel migrations   |
| **Semantic Release**     | Automatic versioning based on conventional commits    |
