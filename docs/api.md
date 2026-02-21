# API Reference

## Base URLs

| Environment | Base URL                                |
| ----------- | --------------------------------------- |
| Production  | `https://apolenkov.duckdns.org`         |
| Staging     | `https://staging.apolenkov.duckdns.org` |
| Dev         | `https://dev.apolenkov.duckdns.org`     |
| Local       | `http://localhost:3001`                 |

## Endpoints

### GET /health

Returns the current health status of the service. Used by Docker's `HEALTHCHECK` instruction and
by Traefik/Dokploy monitoring.

**Auth required:** No

**Rate limited:** Yes (100 req/min per IP)

**Response — 200 OK**

```json
{
  "status": "ok"
}
```

| Field  | Type   | Description                               |
| ------ | ------ | ----------------------------------------- |
| status | string | Always `"ok"` when the service is healthy |

The health endpoint intentionally omits environment details (`env`, `app`) to avoid leaking internal
configuration to unauthenticated callers.

**Example:**

```bash
curl https://apolenkov.duckdns.org/health
```

### GET /

Returns a Hello World payload including the current database connection status.

**Auth required:** No

**Rate limited:** Yes (100 req/min per IP)

**Response — 200 OK**

```json
{
  "message": "Hello World!",
  "env": "production",
  "app": "myapp-hello",
  "db": "connected",
  "timestamp": "2026-02-20T10:00:00.000Z"
}
```

| Field     | Type   | Description                                                         |
| --------- | ------ | ------------------------------------------------------------------- |
| message   | string | Static greeting                                                     |
| env       | string | Value of `NODE_ENV` environment variable                            |
| app       | string | Value of `APP_NAME` environment variable                            |
| db        | string | `"connected"`, `"error"`, or `"not configured"` (no `DATABASE_URL`) |
| timestamp | string | ISO 8601 timestamp of the response                                  |

**Example:**

```bash
curl https://apolenkov.duckdns.org/
```

### GET /metrics

Returns application metrics in Prometheus text exposition format. Used by the Prometheus server to
scrape metrics. Includes OpenTelemetry default metrics (runtime, target info) and custom application
metrics (HTTP request duration, request count).

**Auth required:** No (should be blocked from external access via Traefik middleware)

**Rate limited:** No (excluded from metrics recording to avoid self-scrape noise)

**Response — 200 OK** (Content-Type: text/plain; version=0.0.4)

```text
# HELP http_server_request_duration_seconds Duration of HTTP requests
# UNIT http_server_request_duration_seconds seconds
# TYPE http_server_request_duration_seconds histogram
http_server_request_duration_seconds_bucket{http_method="GET",http_route="/",http_status_code="200",le="0.005"} 1
...
# HELP http_server_request_total Total number of HTTP requests
# TYPE http_server_request_total counter
http_server_request_total_total{http_method="GET",http_route="/",http_status_code="200"} 1
# HELP target_info Target metadata
# TYPE target_info gauge
target_info{service_name="myapp-hello",service_version="1.0.0"} 1
```

**Key metrics:**

| Metric                                 | Type      | Labels                                          |
| -------------------------------------- | --------- | ----------------------------------------------- |
| `http_server_request_duration_seconds` | Histogram | `http_method`, `http_route`, `http_status_code` |
| `http_server_request_total_total`      | Counter   | `http_method`, `http_route`, `http_status_code` |
| `target_info`                          | Gauge     | `service_name`, `service_version`               |

**Example:**

```bash
curl http://localhost:3001/metrics
```

**Note:** The `/metrics` endpoint is intended for internal use only. In production, Traefik should
block external access to this path. See the [Observability Guide](observability.md) for details.

### GET /docs

Serves the Swagger UI — an interactive HTML page for exploring and testing the API. The OpenAPI
specification is generated automatically from `@nestjs/swagger` decorators on controllers.

**Auth required:** No

**Response:** HTML page (Content-Type: text/html)

**Example:** Open `https://apolenkov.duckdns.org/docs` in a browser.

### GET /openapi.json

Returns the raw OpenAPI 3.0 specification as JSON. Useful for code generation or importing into
API clients such as Insomnia or Postman.

**Auth required:** No

**Response — 200 OK** (Content-Type: application/json)

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "myapp-hello API",
    "version": "1.0.0"
  },
  "servers": [{ "url": "https://apolenkov.duckdns.org" }],
  "paths": { ... }
}
```

**Example:**

```bash
curl https://apolenkov.duckdns.org/openapi.json | jq .info
```

## Authentication

The application uses a global `JwtAuthGuard` (`src/auth/auth.guard.ts`) that validates JSON Web
Tokens on all routes by default. Public routes are opted out using the `@Public()` decorator.

### How It Works

The guard reads the `Authorization` header, strips the `Bearer` prefix, and calls
`JwtService.verify(token, { secret })`. On success, the decoded payload is attached to the request
object as `req.user`. On failure, a `401 Unauthorized` response is returned.

### Adding a Protected Route

All routes require authentication by default. To create a public route, use the `@Public()`
decorator:

```typescript
import { Controller, Get } from '@nestjs/common'
import { Public } from './auth/public.decorator'

@Controller()
export class ExampleController {
  @Get('/protected')
  getProtected(): { message: string } {
    return { message: 'Authenticated' }
  }

  @Public()
  @Get('/open')
  getOpen(): { message: string } {
    return { message: 'Public' }
  }
}
```

### Obtaining a Token

The built-in routes do not issue tokens. Implement a `/auth/login` endpoint in your application that
uses `JwtService.sign(payload)` and returns the token to the client.

### Request Format

```http
GET /protected HTTP/1.1
Authorization: Bearer <your-jwt-token>
```

### Error Responses

| Status | Body                         | Cause                                                 |
| ------ | ---------------------------- | ----------------------------------------------------- |
| 401    | `{"error": "Unauthorized"}`  | Missing `Authorization` header                        |
| 401    | `{"error": "Invalid token"}` | Token expired, malformed, or signed with wrong secret |

### Environment Variable

| Variable     | Required                   | Description                                                 |
| ------------ | -------------------------- | ----------------------------------------------------------- |
| `JWT_SECRET` | Yes (for protected routes) | Signing secret — must match the secret used to issue tokens |

If `JWT_SECRET` is an empty string, `JwtService.verify()` will reject all tokens. Set a strong,
random value in production.

## Rate Limiting

All routes are protected by `@nestjs/throttler` configured as a global guard in `app.module.ts`.

| Parameter       | Value                                                     |
| --------------- | --------------------------------------------------------- |
| Window          | 60 seconds                                                |
| Max requests    | 100 per IP                                                |
| Response format | `{"error": "Too many requests, please try again later."}` |
| Headers         | Standard (`RateLimit-*`) — legacy headers disabled        |

When the limit is exceeded, the server returns HTTP `429 Too Many Requests`.

### Rate Limit Response Headers

| Header                | Description                              |
| --------------------- | ---------------------------------------- |
| `RateLimit-Limit`     | Maximum requests allowed in the window   |
| `RateLimit-Remaining` | Remaining requests in the current window |
| `RateLimit-Reset`     | Unix timestamp when the window resets    |

**Note:** This is an application-level safety net. For production deployments, configure rate
limiting at the Traefik level as well to protect against high-volume traffic before it reaches
the Node.js process.

## Request Flow

<!-- prettier-ignore -->
```mermaid
%%{init: {theme: 'neutral'}}%%
flowchart TD
    client[Client] -->|HTTPS| traefik[Traefik\nTLS termination]
    traefik -->|HTTP :3001| nestjs[NestJS\nnestjs-pino logger]
    nestjs --> throttler[ThrottlerGuard\n100 req/min per IP]
    throttler -->|429 if exceeded| client
    throttler --> auth_guard[JwtAuthGuard\nJWT verification]
    auth_guard -->|401 if invalid| client
    auth_guard -->|@Public routes bypass| router{Route match}
    router -->|GET /| ctrl_root[AppController\nDB status check]
    router -->|GET /health| ctrl_health[AppController\nHealth check]
    router -->|GET /metrics| metrics_ctrl[Metrics handler\nPrometheus text format]
    router -->|GET /docs| swagger[Swagger UI]
    router -->|GET /openapi.json| openapi[OpenAPI spec]
    router -->|protected route| ctrl_protected[Protected controller]
    ctrl_root --> interceptor[MetricsInterceptor\nDuration + count]
    ctrl_health --> interceptor
    ctrl_protected --> interceptor
    ctrl_root --> pg[(PostgreSQL)]
    interceptor --> response[JSON response]
    response --> client
```

## Error Responses

All error responses follow a consistent JSON format:

```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning                                                  |
| ------ | -------------------------------------------------------- |
| 401    | Missing or invalid JWT token on a protected route        |
| 429    | Rate limit exceeded                                      |
| 500    | Unhandled server error (logged at `error` level by pino) |

## Logging

All requests are logged in structured JSON format by `nestjs-pino`. Each request receives a unique
UUID as a correlation ID (`reqId`), allowing distributed tracing across log lines.

Log level for each response is determined by the HTTP status code:

- Status `>= 500` → `error`
- Status `>= 400` → `warn`
- Status `< 400` → `info`

Log output example (development):

```json
{
  "level": "info",
  "time": 1708425600000,
  "reqId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "req": { "method": "GET", "url": "/health" },
  "res": { "statusCode": 200 },
  "responseTime": 3
}
```

## See Also

- [Architecture](architecture.md) — Component diagram showing the NestJS module structure
- [Development Guide](development.md) — Running the API locally
- [Deployment Guide](deployment.md) — Environment URLs and CI/CD
