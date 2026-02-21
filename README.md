# myapp-hello

[![CI/CD](https://img.shields.io/github/actions/workflow/status/apolenkov/myapp-hello/ci-cd.yml?branch=main&label=CI%2FCD&logo=github)](https://github.com/apolenkov/myapp-hello/actions)
[![codecov](https://img.shields.io/codecov/c/github/apolenkov/myapp-hello?logo=codecov)](https://codecov.io/gh/apolenkov/myapp-hello)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A production-ready Node.js REST API built with Express and PostgreSQL. Ships with structured
logging, OpenTelemetry instrumentation, JWT authentication middleware, rate limiting, OpenAPI
documentation, automated database migrations, a full CI/CD pipeline, and a complete observability
stack (Grafana + Prometheus + Loki + Tempo) — all deploying to three isolated environments on a
Docker Swarm VPS via Dokploy.

## Architecture

<!-- prettier-ignore -->
```mermaid
%%{init: {theme: 'neutral'}}%%
flowchart TD
    dev[Developer] -->|git push| github[GitHub]
    user[End User] -->|HTTPS| traefik[Traefik v3\nReverse Proxy]

    github -->|GitHub Actions CI/CD| dokploy[Dokploy\nPaaS API]
    dokploy -->|Docker Swarm deploy| swarm

    subgraph swarm[VPS 185.239.48.55 — Docker Swarm]
        traefik --> prod[myapp-hello-prod\n:3013]
        traefik --> staging[myapp-hello-staging\n:3012]
        traefik --> devenv[myapp-hello-dev\n:3011]
        prod --> pg_prod[(PostgreSQL prod)]
        staging --> pg_staging[(PostgreSQL staging)]
        devenv --> pg_dev[(PostgreSQL dev)]

        subgraph obs[Observability Stack]
            grafana[Grafana\n:3100]
            prometheus[Prometheus] -->|scrape /metrics| prod
            promtail[Promtail] -->|push logs| loki[Loki]
            prod -->|OTLP traces| tempo[Tempo]
        end
        grafana --> prometheus & loki & tempo
    end

    traefik -->|ACME HTTP-01| letsencrypt[Let's Encrypt]
    swarm -.->|DNS| duckdns[apolenkov.duckdns.org]
```

## Quick Start

**Prerequisites:** Docker and Docker Compose installed locally.

```bash
git clone https://github.com/apolenkov/myapp-hello.git
cd myapp-hello
docker compose up --build
```

The API is available at `http://localhost:3001`.

For local development without Docker:

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL
npm run dev
```

## Environment Variables

| Variable       | Required | Default       | Description                                  |
| -------------- | -------- | ------------- | -------------------------------------------- |
| `PORT`         | No       | `3001`        | HTTP port the app listens on                 |
| `NODE_ENV`     | No       | `development` | Runtime environment label                    |
| `APP_NAME`     | No       | `myapp-hello` | Application name included in responses       |
| `DATABASE_URL` | No       | —             | PostgreSQL connection string                 |
| `JWT_SECRET`   | No       | —             | Secret key for JWT verification              |
| `LOG_LEVEL`    | No       | `info`        | Pino log level (trace/debug/info/warn/error) |

When `DATABASE_URL` is not set the app runs without a database and reports `db: "not configured"`.

## API Endpoints

| Method | Path            | Auth | Description                           |
| ------ | --------------- | ---- | ------------------------------------- |
| GET    | `/`             | None | Hello World response with DB status   |
| GET    | `/health`       | None | Health check — returns `status: "ok"` |
| GET    | `/metrics`      | None | Prometheus metrics (internal only)    |
| GET    | `/docs`         | None | Swagger UI (OpenAPI 3.0)              |
| GET    | `/openapi.json` | None | Raw OpenAPI specification             |

Protected routes can be added using the `requireAuth` middleware from `src/middleware/auth.ts`.

## Environments

| Environment | Branch    | External Port | URL                                     |
| ----------- | --------- | ------------- | --------------------------------------- |
| Production  | `main`    | `:3013`       | `https://apolenkov.duckdns.org`         |
| Staging     | `develop` | `:3012`       | `https://staging.apolenkov.duckdns.org` |
| Dev         | `dev`     | `:3011`       | `https://dev.apolenkov.duckdns.org`     |

Each environment has its own PostgreSQL instance and independent configuration.

## Documentation

- [Architecture](docs/architecture.md) — C4 diagrams (Context, Container, Component, Deployment)
- [Deployment](docs/deployment.md) — CI/CD pipeline, environments, rollback, secrets
- [Development](docs/development.md) — Local setup, npm scripts, DB migrations, testing
- [API Reference](docs/api.md) — Endpoints, authentication, rate limiting
- [Observability](docs/observability.md) — Monitoring stack, dashboards, alerts, adding new services

## Tech Stack

| Layer             | Technology                                           |
| ----------------- | ---------------------------------------------------- |
| Runtime           | Node.js 22 (LTS)                                     |
| Framework         | Express 4                                            |
| Language          | TypeScript 5 (strict mode)                           |
| Database          | PostgreSQL 16/17 via `node-postgres`                 |
| Logging           | pino + pino-http (structured JSON)                   |
| Observability     | OpenTelemetry + Prometheus + Loki + Tempo + Grafana  |
| Auth middleware   | jsonwebtoken                                         |
| Rate limiting     | express-rate-limit                                   |
| API docs          | swagger-jsdoc + swagger-ui-express                   |
| Testing           | Vitest + @vitest/coverage-v8                         |
| Linting           | ESLint 9 (sonarjs, unicorn, security, import-x)      |
| Formatting        | Prettier 3                                           |
| Architecture lint | dependency-cruiser                                   |
| Containerization  | Docker (multi-stage build, non-root user, dumb-init) |
| Orchestration     | Docker Swarm via Dokploy                             |
| CI/CD             | GitHub Actions                                       |
| Releases          | semantic-release                                     |
