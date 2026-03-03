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

**Rate limited:** No (`@SkipThrottle()` — health checks must not be rejected)

**Response — 200 OK** (database connected)

```json
{
  "status": "ok",
  "db": "connected"
}
```

**Response — 503 Service Unavailable** (database unreachable)

```json
{
  "status": "error",
  "db": "error"
}
```

| Field  | Type   | Description                                                         |
| ------ | ------ | ------------------------------------------------------------------- |
| status | string | `"ok"` when healthy, `"error"` when degraded                        |
| db     | string | `"connected"`, `"error"`, or `"not configured"` (no `DATABASE_URL`) |

The health endpoint intentionally omits environment details (`env`, `app`) to avoid leaking internal
configuration to unauthenticated callers. Returns HTTP 503 when the database is unreachable so that
load balancers and orchestrators can detect degraded instances.

**Example:**

```bash
curl -w "\n%{http_code}" https://apolenkov.duckdns.org/health
```

### GET /v1

Returns a Hello World payload including the current database connection status. This is a versioned
business route — URI versioning resolves `GET /` to `GET /v1`.

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
curl https://apolenkov.duckdns.org/v1
```

### GET /metrics

Returns application metrics in Prometheus text exposition format. Used by the Prometheus server to
scrape metrics. Includes OpenTelemetry default metrics (runtime, target info) and custom application
metrics (HTTP request duration, request count).

**Auth required:** No (should be blocked from external access via Traefik middleware)

**Rate limited:** No (excluded from metrics recording to avoid self-scrape noise)

**Response — 200 OK** (Content-Type: text/plain; version=0.0.4)

```text
# HELP http_request_duration HTTP request duration in seconds
# UNIT http_request_duration seconds
# TYPE http_request_duration histogram
http_request_duration_bucket{method="GET",route="/",status_code="200",le="0.005"} 1
...
# HELP http_requests Total HTTP requests
# TYPE http_requests counter
http_requests{method="GET",route="/",status_code="200"} 1
# HELP target_info Target metadata
# TYPE target_info gauge
target_info{service_name="myapp-hello",service_version="1.0.0"} 1
```

**Key metrics:**

| Metric                  | Type      | Labels                            |
| ----------------------- | --------- | --------------------------------- |
| `http_request_duration` | Histogram | `method`, `route`, `status_code`  |
| `http_requests`         | Counter   | `method`, `route`, `status_code`  |
| `target_info`           | Gauge     | `service_name`, `service_version` |

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

### Items CRUD — /v1/items

A complete CRUD resource demonstrating the recommended pattern for building API endpoints. Items are
scoped to the authenticated user — each user can only access their own items.

**Auth required:** Yes (Bearer JWT token)

**Rate limited:** Yes (100 req/min per IP)

#### POST /v1/items — Create

```bash
curl -X POST https://apolenkov.duckdns.org/v1/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "My first item", "description": "Optional description"}'
```

**Request body:**

| Field       | Type   | Required | Constraints    |
| ----------- | ------ | -------- | -------------- |
| title       | string | Yes      | 1-255 chars    |
| description | string | No       | max 2000 chars |

**Response — 201 Created**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-123",
  "title": "My first item",
  "description": "Optional description",
  "status": "active",
  "createdAt": "2026-03-02T10:00:00.000Z",
  "updatedAt": "2026-03-02T10:00:00.000Z"
}
```

#### GET /v1/items — List (paginated)

```bash
curl https://apolenkov.duckdns.org/v1/items?page=1&limit=20 \
  -H "Authorization: Bearer $TOKEN"
```

**Query parameters:**

| Param | Default | Range |
| ----- | ------- | ----- |
| page  | 1       | >= 1  |
| limit | 20      | 1-100 |

**Response — 200 OK**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "userId": "user-123",
      "title": "My first item",
      "description": "Optional description",
      "status": "active",
      "createdAt": "2026-03-02T10:00:00.000Z",
      "updatedAt": "2026-03-02T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

#### GET /v1/items/:id — Get one

```bash
curl https://apolenkov.duckdns.org/v1/items/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** 200 with item object, or 404 if not found.

#### PATCH /v1/items/:id — Update

```bash
curl -X PATCH https://apolenkov.duckdns.org/v1/items/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated title", "status": "archived"}'
```

**Request body (all fields optional):**

| Field       | Type   | Constraints                |
| ----------- | ------ | -------------------------- |
| title       | string | 1-255 chars                |
| description | string | max 2000 chars             |
| status      | enum   | `"active"` or `"archived"` |

**Note:** Setting status to `"deleted"` via PATCH is not allowed — use DELETE instead.

**Response:** 200 with updated item, or 404 if not found.

#### DELETE /v1/items/:id — Soft delete

```bash
curl -X DELETE https://apolenkov.duckdns.org/v1/items/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** 200 with deleted item (status = "deleted"), or 404 if not found.

Items are soft-deleted — the record stays in the database with `status = 'deleted'` but is excluded
from all queries. This allows recovery and audit trails.

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

#### POST /v1/auth/register — Register a new user

Creates a new user account and returns a JWT access token.

**Auth required:** No (`@Public()`)

```bash
curl -X POST https://apolenkov.duckdns.org/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "johndoe", "password": "SecurePass123!"}'
```

**Request body:**

| Field    | Type   | Required | Constraints |
| -------- | ------ | -------- | ----------- |
| username | string | Yes      | 3-100 chars |
| password | string | Yes      | 8-128 chars |

**Response — 201 Created**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Error responses:**

| Status | Body                                         | Cause              |
| ------ | -------------------------------------------- | ------------------ |
| 400    | `{"message": [...], "error": "Bad Request"}` | Validation error   |
| 409    | `{"message": "Username already taken", ...}` | Duplicate username |

#### POST /v1/auth/login — Authenticate

Verifies credentials and returns a JWT access token.

**Auth required:** No (`@Public()`)

```bash
curl -X POST https://apolenkov.duckdns.org/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "johndoe", "password": "SecurePass123!"}'
```

**Request body:**

| Field    | Type   | Required |
| -------- | ------ | -------- |
| username | string | Yes      |
| password | string | Yes      |

**Response — 200 OK**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Error responses:**

| Status | Body                                               | Cause             |
| ------ | -------------------------------------------------- | ----------------- |
| 400    | `{"message": [...], "error": "Bad Request"}`       | Missing fields    |
| 401    | `{"message": "Invalid username or password", ...}` | Wrong credentials |

#### Token Details

Tokens are signed with HS256 using the `JWT_SECRET` environment variable.

| Claim | Value                  |
| ----- | ---------------------- |
| `sub` | User UUID              |
| `iss` | `myapp-hello`          |
| `aud` | `myapp-hello-api`      |
| `exp` | 24 hours from issuance |

Passwords are hashed with bcrypt (12 rounds) before storage.

### Request Format

```http
GET /protected HTTP/1.1
Authorization: Bearer <your-jwt-token>
```

### Error Responses

| Status | Body                         | Cause                                                             |
| ------ | ---------------------------- | ----------------------------------------------------------------- |
| 401    | `{"error": "Unauthorized"}`  | Missing header, non-Bearer scheme, or `JWT_SECRET` not configured |
| 401    | `{"error": "Invalid token"}` | Token expired, malformed, or signed with wrong secret             |

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
| Headers         | `x-ratelimit-*` (limit, remaining, reset)                 |

When the limit is exceeded, the server returns HTTP `429 Too Many Requests`.

### Rate Limit Response Headers

| Header                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `x-ratelimit-limit`     | Maximum requests allowed in the window   |
| `x-ratelimit-remaining` | Remaining requests in the current window |
| `x-ratelimit-reset`     | Unix timestamp when the window resets    |

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
    router -->|GET /v1| ctrl_root[AppController\nDB status check]
    router -->|GET /health| ctrl_health[AppController\nHealth 200/503]
    router -->|GET /metrics| metrics_ctrl[Metrics handler\nPrometheus text format]
    router -->|GET /docs| swagger[Swagger UI]
    router -->|GET /openapi.json| openapi[OpenAPI spec]
    router -->|POST /v1/auth/*| ctrl_auth[AuthController\nRegister + Login]
    router -->|/v1/items/*| ctrl_items[ItemsController\nCRUD]
    router -->|protected route| ctrl_protected[Protected controller]
    ctrl_auth --> pg
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
| 400    | Validation error (missing or invalid fields in body)     |
| 401    | Missing/invalid JWT or wrong credentials on login        |
| 404    | Resource not found (items)                               |
| 409    | Conflict (duplicate username on registration)            |
| 429    | Rate limit exceeded                                      |
| 503    | Service degraded (database unreachable, on /health)      |
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
