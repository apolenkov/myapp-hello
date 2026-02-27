# Contributing

Thank you for your interest in contributing to myapp-hello!

## Getting Started

1. Fork the repository
2. Clone your fork and create a feature branch from `main`
3. Follow the [Development Guide](docs/development.md) for local setup

## Development Workflow

```bash
npm install              # Installs all workspaces (root + apps/* + packages/*)
cp .env.example .env
npm run dev              # Turbo dev mode (watch)
```

## TDD Requirement

This project follows Test-Driven Development. For every new feature or bug fix:

1. Write a failing test first (`apps/api/src/__tests__/`)
2. Run `npm test` to verify it fails (red)
3. Write the minimal implementation to pass the test
4. Run `npm test` to verify it passes (green)
5. Refactor if needed, keeping tests green

Test pattern: `Test.createTestingModule()` per test suite with `app.init()` in `beforeAll`.
Coverage thresholds: 90% lines/functions/statements, 85% branches.

## Before Submitting a PR

Run the full quality pipeline:

```bash
npx tsc --noEmit -p apps/api/tsconfig.json   # Type-check without emitting
npm run format:check                           # Verify formatting
npm run lint                                   # ESLint
npm run test:coverage                          # Tests with coverage thresholds
npm run check:arch                             # Architectural boundary enforcement
```

All checks must pass before merging.

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): add new feature
fix(scope): fix a bug
docs(scope): update documentation
refactor(scope): restructure code without behavior change
test(scope): add or update tests
chore(scope): maintenance tasks
ci(scope): CI/CD changes
```

## Code Style

- TypeScript strict mode, no `any`, explicit return types
- 2 spaces, single quotes, no semicolons, trailing commas (Prettier)
- kebab-case filenames
- See [apps/api/eslint.config.js](apps/api/eslint.config.js) for full rules

## Architecture

Module boundaries are enforced by dependency-cruiser:

- `database/` must NOT import from `auth/` or `metrics/`
- Production code must NOT import from `__tests__/`
- No circular dependencies

## Observability

The application uses OpenTelemetry for metrics and traces, Pino for structured
logging, and Sentry for error tracking. Everything is disabled by default
without the corresponding environment variables — local development is
unaffected.

### Custom Metrics

To add a new application metric:

1. Define an instrument in `apps/api/src/metrics/instruments.ts`:

   ```typescript
   export const myCounter = meter.createCounter('my_counter', {
     description: 'Counts something useful',
   })
   ```

2. Use it in the appropriate interceptor, guard, or service:

   ```typescript
   import { myCounter } from '../metrics/instruments'

   myCounter.add(1, { route: '/v1/example' })
   ```

3. The Prometheus exporter on `/metrics` picks up new instruments
   automatically. In production, Grafana Alloy scrapes the endpoint and
   pushes metrics to Grafana Cloud.

### Traces

HTTP, Express, and PostgreSQL are auto-instrumented via the OTel SDK
(`apps/api/src/instrumentation.ts`). Health check paths (`/health`,
`/metrics`) are excluded from tracing.

To add a custom span:

```typescript
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('myapp-hello')
const span = tracer.startSpan('my-operation')
try {
  // ... do work
} finally {
  span.end()
}
```

### Local Testing

- **Metrics:** `curl http://localhost:3001/metrics` (Prometheus text format)
- **Logs:** `docker compose logs -f app` (Pino JSON output)
- **Traces:** disabled locally — requires `OTEL_EXPORTER_OTLP_ENDPOINT`

### No-Op Behavior

All observability features degrade gracefully without configuration:

- No Sentry errors without `SENTRY_DSN`
- No trace export without `OTEL_EXPORTER_OTLP_ENDPOINT`
- Prometheus `/metrics` always works (local exporter, no external dependency)

For the full observability stack details (dashboards, alerts, Grafana Cloud
setup), see [docs/observability.md](docs/observability.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
