# Roadmap

Post-migration infrastructure hardening and feature roadmap.

## Completed

- [x] Monorepo migration (Turborepo + npm workspaces)
- [x] GHCR artifact promotion (dev → staging → prod)
- [x] JWT_SECRET on all 3 environments
- [x] DB backups to Yandex S3 (daily cron + manual trigger)
- [x] GHCR cleanup workflow (weekly prune)
- [x] Uptime monitoring workflow (15min health checks)
- [x] Semantic release integration (ci.yml release job)
- [x] Shell injection fix in deploy.yml (`jq -nc --arg`)
- [x] Database timeouts hardening (30s connection, 30s statement, 10s shutdown)
- [x] Removed unused eslint-plugin-boundaries
- [x] Added engines field to package.json
- [x] Sentry integration (`@sentry/nestjs` + source maps)
- [x] Grafana dashboards (app-overview, node-runtime, logs-overview)

## High Priority

### DB Password Rotation (manual)

Current passwords are weak (`*_secret_123`). Requires manual Dokploy UI work:

1. Open Dokploy → each PostgreSQL service → change password
2. Update `DATABASE_URL` in app env vars
3. Redeploy each environment
4. Verify `/health` returns `db: connected`

### OTel Exporter Error Handling

`instrumentation.ts:39-41` — no error handling if `OTEL_EXPORTER_OTLP_ENDPOINT` is unreachable.
Add try-catch around `OTLPTraceExporter` initialization with graceful fallback.

### Rate Limiting Configuration

`app.module.ts:28-33` — throttler TTL (60s) and limit (100) are hardcoded. Extract to env vars:

- `THROTTLE_TTL` (default: 60000)
- `THROTTLE_LIMIT` (default: 100)

## Medium Priority

### E2E Tests

Add end-to-end tests against a running instance:

- Health check flow
- Auth flow (login → token → protected route)
- Rate limiting behavior
- Metrics endpoint format

### API Versioning

Prepare for breaking changes:

- Add `/v1/` prefix to routes
- Document versioning strategy in CLAUDE.md

### Docker Build Caching

Optimize CI build times:

- Add `cache-from` / `cache-to` in `docker/build-push-action`
- Use GitHub Actions cache for Docker layers

### Local Development DX

- Document `docker-compose up` → `npm run dev` workflow in README
- Add `npm run dev:docker` script for one-command local start

## Low Priority

### DevDep Updates

- `@swc/cli`: 0.7.x → 0.8.x
- `eslint`: 10.0.x → latest patch

### CORS Configuration

Currently handled by Traefik. If API becomes public-facing, add `enableCors()` in `main.ts`.

### Changelog

`@semantic-release/changelog` plugin could generate CHANGELOG.md automatically. Currently only
GitHub Releases are created.

### Load Testing

- k6 or autocannon scripts for `/health`, `GET /`, protected routes
- Baseline latency numbers for regression detection

## Future

### Multi-Region

- Second VPS in different region
- Database replication
- DNS failover

### Feature Flags

- LaunchDarkly or Unleash integration
- Gradual rollouts for new features

### WebSocket Support

- If real-time features needed
- Consider `@nestjs/websockets` + Socket.IO
