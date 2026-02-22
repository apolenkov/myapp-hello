# myapp-hello

Production NestJS 11 REST API with PostgreSQL, JWT auth, OpenTelemetry observability, and Dokploy
deployment.

## Quick Reference

```bash
npm run build          # Compile (SWC via NestJS CLI)
npm run dev            # Watch mode (nest start --watch)
npm test               # Vitest (no coverage)
npm run test:coverage  # Vitest + v8 coverage (90/85/90/90 thresholds)
npm run lint           # ESLint on src/
npm run lint:fix       # ESLint with --fix
npm run format:check   # Prettier dry-run
npm run format         # Prettier format all
npm run check:arch     # dependency-cruiser architecture validation
```

## Pre-Commit Validation

Husky + lint-staged run on commit. Before committing manually:

```bash
npx tsc --noEmit && npm run format:check && npm run lint && npm run test:coverage
```

## Architecture

```text
src/
  main.ts                  # Bootstrap, Swagger, graceful shutdown
  app.module.ts            # Root module (config, logging, throttling, auth, metrics, db)
  app.controller.ts        # GET / and GET /health
  app.service.ts           # Business logic, DB status
  instrumentation.ts       # OTel SDK init (loaded via --require)
  metrics.ts               # Custom OTel meters (duration histogram, request counter)
  auth/                    # JWT authentication (global guard)
  database/                # PostgreSQL via pg Pool (global module)
  metrics/                 # Request metrics interceptor (global)
  db/                      # Migration runner (advisory lock, SQL files)
  __tests__/               # Integration tests (Vitest + @nestjs/testing + supertest)
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

- **Docker:** Multi-stage build, node:22-alpine, dumb-init, non-root user (nodejs:1001)
- **PaaS:** Dokploy (Docker Swarm on VPS 185.239.48.55)
- **CI/CD:** GitHub Actions — quality gates → test → deploy (Dokploy API trigger + polling /health)
- **Environments:** main → prod (:3013), develop → staging (:3012), dev → dev (:3011)
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
- `APP_PUBLIC_URL` — health check verification in CI
- `GRAFANA_API_TOKEN`, `GRAFANA_URL` — deploy annotations
- `JWT_SECRET` — auth token signing (runtime env var)

## Observability

- **Logging:** nestjs-pino (JSON format, parsed by Promtail)
- **Metrics:** Prometheus via OTel PrometheusExporter on `/metrics`
- **Traces:** OTel SDK → Tempo via OTLP (HTTP, Express, PostgreSQL instrumentation)
- **Dashboards:** Grafana (app-overview, node-runtime, logs-overview)
