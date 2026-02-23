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
- **CI/CD:** GitHub Actions — `ci.yml` (quality + tests) + `deploy.yml` (GHCR + cascade) +
  `db-backup.yml` (PostgreSQL backups via Dokploy API)
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

## API Contracts (must NOT change)

| Endpoint            | Response                                    |
| ------------------- | ------------------------------------------- |
| `GET /health`       | `{ status: 'ok' }` (public)                 |
| `GET /`             | `{ message, env, app, db, ... }`            |
| `GET /metrics`      | Prometheus text format (public)             |
| `GET /openapi.json` | OpenAPI 3.0 spec                            |
| `GET /docs`         | Swagger UI                                  |
| Auth 401            | `{ error: 'Unauthorized' }`                 |
| Rate limit          | `x-ratelimit-limit/remaining/reset` headers |

## Secrets (GitHub Secrets, never commit)

- `DOKPLOY_URL`, `DOKPLOY_TOKEN` — Dokploy API access
- `DOKPLOY_SERVICE_ID_PROD/STAGING/DEV` — application IDs
- `CODECOV_TOKEN` — coverage upload
- `APP_PUBLIC_URL`, `APP_PUBLIC_URL_DEV`, `APP_PUBLIC_URL_STAGING` — health check URLs per env
- `GRAFANA_API_TOKEN`, `GRAFANA_URL` — deploy annotations
- `JWT_SECRET` — auth token signing (runtime env var)
- `SENTRY_DSN` — Sentry error tracking (runtime env var, no-op when absent)

## Observability

- **Logging:** nestjs-pino (JSON format, parsed by Promtail)
- **Metrics:** Prometheus via OTel PrometheusExporter on `/metrics`
- **Traces:** OTel SDK → Tempo via OTLP (HTTP, Express, PostgreSQL instrumentation)
- **Errors:** Sentry via `@sentry/nestjs` + `SentrySpanProcessor` (no-op without `SENTRY_DSN`)
- **Dashboards:** Grafana (app-overview, node-runtime, logs-overview)
- **DB Backups:** Automated via `db-backup.yml` workflow (Dokploy API, daily cron + manual trigger)
