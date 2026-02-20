# myapp-hello

Hello World Node.js app — шаблон для быстрого старта любого проекта.

## Stack

- Node.js 22 + TypeScript + Express
- PostgreSQL
- Docker (multi-stage build)
- Dokploy (self-hosted PaaS)
- GitHub Actions (CI/CD)

## Environments

| Branch    | Environment | Dokploy service        |
| --------- | ----------- | ---------------------- |
| `main`    | production  | myapp-hello-prod       |
| `develop` | staging     | myapp-hello-staging    |
| `dev`     | development | myapp-hello-dev        |

## Local dev

```bash
cp .env.example .env
docker compose up
```

## GitHub Secrets (required)

| Secret                       | Value                                     |
| ----------------------------- | ----------------------------------------- |
| `DOKPLOY_URL`                | `http://185.239.48.55:3000`               |
| `DOKPLOY_TOKEN`              | Dokploy API key                           |
| `DOKPLOY_SERVICE_ID_PROD`    | Service ID from Dokploy (production)      |
| `DOKPLOY_SERVICE_ID_STAGING` | Service ID from Dokploy (staging)         |
| `DOKPLOY_SERVICE_ID_DEV`     | Service ID from Dokploy (dev)             |

## API

- `GET /` — Hello World + DB status
- `GET /health` — health check
