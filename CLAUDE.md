# myapp-hello

Turborepo monorepo: NestJS 11 REST API with PostgreSQL, JWT auth, OpenTelemetry observability, and
Dokploy deployment via GHCR artifact promotion.

## Quick Reference

```bash
npm run build          # turbo run build (all packages)
npm run dev            # turbo run dev (watch mode)
npm test               # turbo run test (Vitest, no coverage)
npm run test:coverage  # turbo run test:coverage (v8, 90/85/90/90)
npm run lint           # turbo run lint (ESLint)
npm run format:check   # Prettier dry-run (root)
npm run check:arch     # turbo run check:arch (dependency-cruiser)
```

## Pre-Commit Validation

Husky + lint-staged run on commit. Before committing manually:

```bash
npx tsc --noEmit -p apps/api/tsconfig.json && npm run format:check && npm run lint && npm run test:coverage
```

## Monorepo Structure

```text
myapp-hello/                          # Turborepo root (npm workspaces)
  turbo.json                          # Pipeline config
  package.json                        # Workspace root
  apps/
    api/                              # @myapp/api — NestJS REST API
      src/
        main.ts                       # Bootstrap, Swagger, graceful shutdown
        app.module.ts                 # Root module (config, logging, throttling, auth, metrics, db)
        app.controller.ts             # GET / and GET /health
        app.service.ts                # Business logic, DB status
        instrumentation.ts            # OTel SDK init (loaded via --require)
        metrics.ts                    # Custom OTel meters
        auth/                         # JWT authentication (global guard)
        database/                     # PostgreSQL via pg Pool (global module)
        metrics/                      # Request metrics interceptor (global)
        db/                           # Migration runner (advisory lock, SQL files)
        __tests__/                    # Integration tests (Vitest + @nestjs/testing + supertest)
      migrations/                     # SQL migration files
      Dockerfile                      # Multi-stage turbo prune build
  packages/
    eslint-config/                    # @myapp/eslint-config — shared ESLint flat config
    typescript-config/                # @myapp/typescript-config — shared tsconfig presets
  infra/
    docker-compose.yml                # Local dev (PostgreSQL, Grafana stack)
    ansible/
      setup-db-backups.yml            # Dokploy backup setup (S3 destination + configs)
      vars/secrets.yml.example        # Template for secrets (copy to secrets.yml)
  scripts/
    setup-ghcr-dokploy.sh            # Switch Dokploy apps to GHCR docker source
```

### Module Boundaries (enforced by dependency-cruiser)

- `database/` must NOT import from `auth/` or `metrics/`
- Production code must NOT import from `__tests__/`
- No circular dependencies allowed

## Development Principles

- **TDD First** — tests before implementation, `Test.createTestingModule()` is the contract
- **const only** — never use `let`, extract helper functions for conditional assignments
- **Plan → Implement** — non-trivial changes require a plan before coding
- **Post-impl refactoring** — refactor while context is fresh, right after completing a feature
- **Task tracking** — use Claude Tasks for multi-step work, persist progress across sessions
- **Memory** — save discoveries and decisions to claude-mem for cross-session continuity
- **RAPID workflow** — Research → Analyze → Plan → Implement → Document

## Code Style

- TypeScript strict mode, no `any`, explicit return types on all functions
- 2 spaces, single quotes, no semicolons, trailing commas (Prettier)
- kebab-case filenames (unicorn/filename-case)
- Max 250 lines per file, max 50 lines per function
- Cognitive complexity max 15 (sonarjs)
- `const` only — never use `let` (extract async helpers instead)

## Testing

- Framework: Vitest + `@nestjs/testing` + supertest
- Pattern: `Test.createTestingModule()` per test suite, `app.init()` in beforeAll
- Coverage: v8 provider, thresholds 90% lines/functions/statements, 85% branches
- Excluded from coverage: `main.ts`, `instrumentation.ts`, `db/migrate.ts`, `config/**`

## Deployment

- **Docker:** Multi-stage turbo prune build, node:22-alpine, dumb-init, non-root user (nodejs:1001)
- **PaaS:** Dokploy (Docker Swarm on VPS 185.239.48.55)
- **Artifact promotion:** Build once → push to GHCR → deploy same image to dev → staging → prod
- **CI/CD:** GitHub Actions — `ci.yml` (quality + tests), `deploy.yml` (GHCR + cascade),
  `db-backup.yml` (PostgreSQL backups), `cleanup.yml` (weekly GHCR image prune),
  `uptime.yml` (15min health checks on all 3 envs)
- **Git workflow:** Trunk-based (single main branch, short-lived feature branches)
- **Environments:** dev (auto-deploy), staging (manual approval), production (manual approval)
- **Domain:** apolenkov.duckdns.org (prod), Traefik reverse proxy with Let's Encrypt

### Dokploy API

- tRPC over HTTP: `POST /api/domain.create`, `domain.byApplicationId`, etc. Auth: `x-api-key` header
- App IDs: prod=`YPBkMrtU6gGRi_nq-gHir`, staging=`L2cYMGloyihivImeTfoYt`, dev=`LhtGf_Cl2ITpD7CcSex8a`

### Infrastructure Gotchas

- **Traefik routing:** File provider at `/etc/dokploy/traefik/dynamic/` uses Docker Swarm service
  names (e.g. `myapp-hello-prod-qps6m7:3001`), NOT hardcoded IPs. 502 = wrong service name.
- **Swarm DNS:** Service names resolve as stable VIPs on overlay networks — no IP tracking needed
- **Deploy verification:** CI uses polling loop (20 attempts x 15s) against /health, not naive sleep
- **Shell injection:** Use `jq -nc --arg` for safe JSON in CI workflows, never string concatenation
- **DB timeouts:** connectionTimeoutMillis 30s, statement_timeout 30s, graceful shutdown 10s
- **Semantic release:** Runs after quality+test gates on main push (`ci.yml` release job)

## API Versioning

URI-based versioning via `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`.

- **Business routes** get `/v1/` prefix automatically (default version)
- **Infrastructure endpoints** (`/health`, `/metrics`, `/docs`, `/openapi.json`) use
  `VERSION_NEUTRAL` or are registered on the HTTP adapter directly — no version prefix
- New API versions: add `@Version('2')` to new controllers/methods, keep v1 unchanged

## API Contracts (must NOT change)

| Endpoint            | Response                                     |
| ------------------- | -------------------------------------------- |
| `GET /health`       | `{ status: 'ok' }` (public, unversioned)     |
| `GET /v1`           | `{ message, env, app, db, ... }`             |
| `GET /metrics`      | Prometheus text format (public, unversioned) |
| `GET /openapi.json` | OpenAPI 3.0 spec (unversioned)               |
| `GET /docs`         | Swagger UI (unversioned)                     |
| Auth 401            | `{ error: 'Unauthorized' }`                  |
| Rate limit          | `x-ratelimit-limit/remaining/reset` headers  |

## Secrets (GitHub Secrets, never commit)

| Secret                             | Purpose                                        |
| ---------------------------------- | ---------------------------------------------- |
| `DOKPLOY_URL`                      | Dokploy API base URL (e.g. `http://<vps>:3000` |
| `DOKPLOY_TOKEN`                    | Dokploy API key (`x-api-key` header)           |
| `DOKPLOY_SERVICE_ID_PROD`          | Dokploy application ID — production            |
| `DOKPLOY_SERVICE_ID_STAGING`       | Dokploy application ID — staging               |
| `DOKPLOY_SERVICE_ID_DEV`           | Dokploy application ID — dev                   |
| `DOKPLOY_DESTINATION_ID`           | Dokploy S3 backup destination ID               |
| `CODECOV_TOKEN`                    | Codecov coverage upload token                  |
| `APP_PUBLIC_URL`                   | Production health check URL                    |
| `APP_PUBLIC_URL_STAGING`           | Staging health check URL                       |
| `APP_PUBLIC_URL_DEV`               | Dev health check URL                           |
| `SENTRY_DSN`                       | Sentry error tracking DSN (runtime env var)    |
| `SENTRY_AUTH_TOKEN`                | Sentry auth token (CI source maps upload)      |
| `YANDEX_S3_ACCESS_KEY`             | Yandex Object Storage access key               |
| `YANDEX_S3_SECRET_KEY`             | Yandex Object Storage secret key               |
| `GRAFANA_API_TOKEN`, `GRAFANA_URL` | Grafana deploy annotations (optional)          |
| `JWT_SECRET`                       | Auth token signing (Dokploy env var, not GH)   |

## Observability

- **Logging:** nestjs-pino (JSON format, parsed by Promtail)
- **Metrics:** Prometheus via OTel PrometheusExporter on `/metrics`
- **Traces:** OTel SDK → Tempo via OTLP (HTTP, Express, PostgreSQL instrumentation)
- **Errors:** Sentry via `@sentry/nestjs` + `SentrySpanProcessor` (no-op without `SENTRY_DSN`)
- **Dashboards:** Grafana (app-overview, node-runtime, logs-overview)
- **DB Backups:** Automated via `db-backup.yml` workflow (Dokploy API, daily cron + manual trigger)

### DB Backup Setup (reproduce on new VPS)

1. **Create S3 bucket** — Yandex Object Storage (or any S3-compatible provider)
   - Current: bucket `myapp-hellp`, endpoint `https://storage.yandexcloud.net`, region `ru-central1`
2. **Create service account** with `storage.editor` role, generate static access keys
3. **Create Dokploy destination** via API or Ansible playbook:
   ```bash
   ansible-playbook infra/ansible/setup-db-backups.yml -e @infra/ansible/vars/secrets.yml
   ```
4. **Set GitHub Secrets**: `DOKPLOY_DESTINATION_ID`, `YANDEX_S3_ACCESS_KEY`, `YANDEX_S3_SECRET_KEY`
5. **Run `setup-schedules`** via GitHub Actions (workflow_dispatch) to create backup configs
6. **Verify**: trigger `backup-now` manually, check S3 bucket for dump files

PostgreSQL instances are auto-discovered via `project.all` API (no hardcoded IDs).
Backups: daily at 03:00 UTC, retention 7 copies, prefix = postgres service name.
