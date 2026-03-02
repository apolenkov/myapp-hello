# Development Guide

This document covers local environment setup for the Turborepo monorepo, available npm scripts,
database migration workflow, and how to run tests.

## Prerequisites

| Requirement    | Minimum version           | Notes                                 |
| -------------- | ------------------------- | ------------------------------------- |
| Node.js        | 22                        | Use `nvm` or `fnm` to manage versions |
| npm            | 11                        | Bundled with Node.js 22               |
| Docker         | 24                        | Required for local PostgreSQL         |
| Docker Compose | v2 (`compose` subcommand) | Bundled with Docker Desktop           |

## Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/apolenkov/myapp-hello.git
cd myapp-hello

# 2. Install dependencies
npm install

# 3. Copy and edit environment variables
cp .env.example .env
# Edit .env — set DATABASE_URL if needed (docker-compose sets it automatically)

# 4. Start with Docker Compose (app + PostgreSQL)
docker compose -f infra/docker-compose.yml up --build

# 5. Verify the app is running
curl http://localhost:3001/health
# {"status":"ok"}
```

To run only the app (without Docker), start PostgreSQL separately then:

```bash
npm run dev
```

`npm run dev` uses `nest start --watch` — the server restarts automatically on file changes using SWC
for fast compilation.

## npm Scripts

### Root (runs via Turborepo)

| Script                  | Command                   | Description                               |
| ----------------------- | ------------------------- | ----------------------------------------- |
| `npm run build`         | `turbo run build`         | Compile all packages                      |
| `npm run dev`           | `turbo run dev`           | Watch mode (all packages)                 |
| `npm test`              | `turbo run test`          | Run all tests once                        |
| `npm run test:coverage` | `turbo run test:coverage` | Run tests with coverage                   |
| `npm run lint`          | `turbo run lint`          | Lint all packages                         |
| `npm run format:check`  | `prettier --check .`      | Verify formatting without modifying files |
| `npm run format`        | `prettier --write .`      | Format all files in place                 |
| `npm run check:arch`    | `turbo run check:arch`    | Enforce architectural boundaries          |

### apps/api (NestJS API)

| Script                  | Command                                          | Description                           |
| ----------------------- | ------------------------------------------------ | ------------------------------------- |
| `npm start`             | `node dist/main.js`                              | Start compiled production build       |
| `npm run dev`           | `nest start --watch`                             | Dev server with hot reload (SWC)      |
| `npm run build`         | `nest build`                                     | Compile TypeScript to `dist/` via SWC |
| `npm test`              | `vitest run`                                     | Run all tests once                    |
| `npm run test:coverage` | `vitest run --coverage`                          | Tests with coverage report            |
| `npm run lint`          | `eslint src`                                     | Lint TypeScript source files          |
| `npm run check:arch`    | `depcruise src --config .dependency-cruiser.cjs` | Enforce architectural boundaries      |

## Database Migrations

Migrations run automatically when the application starts (if `DATABASE_URL` is set). The migration
system is idempotent — running it multiple times is safe.

<!-- prettier-ignore -->
```mermaid
%%{init: {theme: 'neutral'}}%%
sequenceDiagram
    participant App as NestJS App
    participant DB as PostgreSQL
    App->>DB: BEGIN
    App->>DB: SELECT pg_advisory_xact_lock(7777777)
    App->>DB: CREATE TABLE IF NOT EXISTS migrations
    loop Each .sql file (sorted)
        App->>DB: SELECT 1 FROM migrations WHERE name=$1
        alt Not applied
            App->>DB: Execute SQL
            App->>DB: INSERT INTO migrations (name)
        else Already applied
            App-->>App: skip
        end
    end
    App->>DB: COMMIT (lock auto-released)
```

### How It Works

1. The app connects to PostgreSQL, opens a transaction, and acquires
   `pg_advisory_xact_lock(7777777)`. This is a transaction-scoped lock — it auto-releases on
   `COMMIT` or `ROLLBACK`, eliminating the risk of lock leaks. In a Docker Swarm environment where
   multiple replicas can start at the same time, only one instance proceeds — the rest block until
   the lock is released.
2. A `migrations` table is created if it does not exist.
3. All `.sql` files in `apps/api/migrations/` are read and sorted alphabetically. Each file is
   checked against the `migrations` table. Already-applied files are skipped.
4. New files are executed within the same transaction. On success, the filename is recorded and the
   transaction is committed. On failure, the transaction is rolled back and the application exits
   with code 1.

### Adding a Migration

Create a new `.sql` file in `apps/api/migrations/` using a numeric prefix to control ordering:

```bash
# Example: add a users table
cat > apps/api/migrations/002_add_users.sql << 'EOF'
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
EOF
```

The next application startup will apply it automatically.

### Current Migrations

| File                      | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `001_initial.sql`         | Creates `health_checks` table (id, checked_at, status)                      |
| `002_add_constraints.sql` | Adds `CHECK` constraint on `status` column and index on `checked_at` column |

## Environment Variables

### Core

| Variable       | Default                                               | Notes                                |
| -------------- | ----------------------------------------------------- | ------------------------------------ |
| `PORT`         | `3001`                                                | Change if port is occupied           |
| `NODE_ENV`     | `development`                                         | Controls log format and env label    |
| `APP_NAME`     | `myapp-hello`                                         | Appears in API responses             |
| `DATABASE_URL` | See `.env.example` (docker-compose reads from `.env`) | Full connection string               |
| `JWT_SECRET`   | empty string (auth disabled without a secret)         | Required for protected routes        |
| `LOG_LEVEL`    | `info`                                                | Options: trace/debug/info/warn/error |

### Rate Limiting

| Variable         | Default | Notes                                  |
| ---------------- | ------- | -------------------------------------- |
| `THROTTLE_TTL`   | `60000` | Time window in milliseconds            |
| `THROTTLE_LIMIT` | `100`   | Max requests per `THROTTLE_TTL` window |

### Error Tracking

| Variable     | Default | Notes                                              |
| ------------ | ------- | -------------------------------------------------- |
| `SENTRY_DSN` | —       | Sentry DSN for error reporting; no-op when not set |

### Observability (OpenTelemetry)

| Variable                      | Default                | Notes                                                             |
| ----------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `OTEL_SERVICE_NAME`           | value of `APP_NAME`    | Service name in traces and metrics                                |
| `SERVICE_NAMESPACE`           | `my-application-group` | Groups related services in dashboards                             |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | —                      | OTLP gateway URL (e.g. Grafana Cloud); traces disabled when unset |
| `OTEL_EXPORTER_OTLP_HEADERS`  | —                      | Auth header, e.g. `Authorization=Basic <base64(id:token)>`        |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf`        | OTLP transport protocol                                           |

When running with `docker compose -f infra/docker-compose.yml up`, all defaults are applied
automatically.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file change)
npx vitest

# Run tests with coverage report
npm run test:coverage
# Coverage report written to coverage/
```

Tests use [Vitest](https://vitest.dev/). Test files follow the `*.test.ts` or `*.spec.ts` naming
convention.

Coverage is collected via `@vitest/coverage-v8` (Node.js built-in V8 coverage). The coverage
report is uploaded to Codecov on every CI run.

## Code Quality

The project enforces several quality layers:

- **TypeScript strict mode** — `tsconfig.json` enables all strict checks including
  `strictNullChecks`, `noImplicitAny`, and `noUncheckedIndexedAccess`
- **ESLint** with plugins for sonarjs (code quality), unicorn (modern JS), security (vulnerability
  patterns), import-x (import order), and jsdoc (documentation completeness)
- **Prettier** — consistent formatting enforced via pre-commit hook (`husky` + `lint-staged`)
- **dependency-cruiser** — architectural boundaries enforced via `check:arch`; prevents circular
  dependencies and layer violations
- **semantic-release** — automated versioning and changelog generation based on conventional commit
  messages

## Dependency Update Blockers

Some packages cannot be updated to their absolute latest versions due to peer dependency conflicts.
Check these before running bulk updates:

| Package  | Pinned    | Blocker                                             |
| -------- | --------- | --------------------------------------------------- |
| `eslint` | `^9.39.3` | `eslint-plugin-import-x` requires `^8.57 \|\| ^9.0` |

Additional notes:

- `eslint-plugin-unicorn` 63+ uses a default export — ESLint CJS config must use
  `require('eslint-plugin-unicorn').default`
- `vitest` 4 is ESM-only — add `include: ['src/**/*.test.ts']` to vitest config to prevent
  CJS `dist/` files from being picked up

## Troubleshooting

### Tests Failing Locally

```bash
npm run dev:db              # Ensure PostgreSQL is running
npm test -- --reporter=verbose
npm run test:coverage       # Check coverage thresholds
```

### Pre-commit Hook Broke the Commit

Hooks modify files in place. After a failed commit:

```bash
git diff                    # See what the hook changed
git add .                   # Stage the fixes
git commit -m "fix: apply formatting from pre-commit hook"  # NEW commit, never amend
```

## See Also

- [Architecture](architecture.md) — C4 diagrams and design decisions
- [Deployment Guide](deployment.md) — CI/CD pipeline and environment configuration
- [API Reference](api.md) — Endpoint documentation
