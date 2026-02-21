# Architecture

This document describes the architecture of **myapp-hello** using the C4 model at all four levels:
System Context, Container, Component, and Deployment.

## C4 Level 1 — System Context

Shows how myapp-hello sits within its broader ecosystem: who uses it, which external systems it
depends on, and how code travels from developer to production.

<!-- prettier-ignore -->
```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml
title System Context — myapp-hello
Person(dev, "Developer", "Pushes code to GitHub branches")
Person(user, "End User", "Accesses app via browser or API client")
System(myapp, "myapp-hello", "Node.js REST API with 3 environments: dev/staging/prod")
System_Ext(github, "GitHub", "Source control + GitHub Actions CI/CD")
System_Ext(dokploy, "Dokploy", "Self-hosted PaaS — Docker Swarm orchestration")
System_Ext(duckdns, "DuckDNS", "Free dynamic DNS: apolenkov.duckdns.org")
System_Ext(letsencrypt, "Let's Encrypt", "Free TLS certificates via ACME HTTP-01")
Rel(dev, github, "git push", "HTTPS")
Rel(github, dokploy, "Trigger deploy", "REST API (application.deploy)")
Rel(dokploy, myapp, "Builds & deploys", "Docker Swarm")
Rel(user, myapp, "GET /health, GET /", "HTTPS via Traefik")
Rel(myapp, duckdns, "DNS resolves to VPS", "185.239.48.55")
Rel(dokploy, letsencrypt, "ACME HTTP-01 challenge", "HTTP :80")
LAYOUT_WITH_LEGEND()
@enduml
```

## C4 Level 2 — Container

Shows what runs inside the VPS. Three independent application instances (prod/staging/dev) each have
their own PostgreSQL database. All inbound traffic enters through Traefik which handles TLS
termination and routing.

<!-- prettier-ignore -->
```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml
title Container Diagram — VPS 185.239.48.55 (Docker Swarm)
Person(user, "User")
Person(dev, "Developer")
System_Boundary(vps, "VPS — Docker Swarm") {
    Container(traefik, "Traefik v3.6.7", "Reverse Proxy", "TLS termination, routing, ACME, :80/:443")
    Container(dokploy_admin, "Dokploy Admin", "Next.js", "PaaS management UI/API on :3000")
    Container(app_prod, "myapp-hello-prod", "Node.js 22 + Express", "Production env, :3013 ext / :3001 int")
    Container(app_staging, "myapp-hello-staging", "Node.js 22 + Express", "Staging env, :3012 ext / :3001 int")
    Container(app_dev, "myapp-hello-dev", "Node.js 22 + Express", "Dev env, :3011 ext / :3001 int")
    ContainerDb(pg_prod, "PostgreSQL prod", "PostgreSQL 16", "Production database")
    ContainerDb(pg_staging, "PostgreSQL staging", "PostgreSQL 16", "Staging database")
    ContainerDb(pg_dev, "PostgreSQL dev", "PostgreSQL 16", "Dev database")
}
System_Ext(github, "GitHub Actions")
Rel(user, traefik, "HTTPS", ":443")
Rel(dev, dokploy_admin, "Manage deployments", "HTTP :3000")
Rel(github, dokploy_admin, "Trigger deploy", "REST /api/trpc/application.deploy")
Rel(traefik, app_prod, "Route apolenkov.duckdns.org", "HTTP :3001")
Rel(traefik, app_staging, "Route staging.*", "HTTP :3001")
Rel(traefik, app_dev, "Route dev.*", "HTTP :3001")
Rel(app_prod, pg_prod, "SQL", "TCP :5432")
Rel(app_staging, pg_staging, "SQL", "TCP :5432")
Rel(app_dev, pg_dev, "SQL", "TCP :5432")
LAYOUT_WITH_LEGEND()
@enduml
```

## C4 Level 3 — Component

Shows the internal structure of the Express application: how the middleware chain is assembled,
how the database migration system works, and how Swagger documentation is served.

<!-- prettier-ignore -->
```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Component.puml
title Component Diagram — myapp-hello internals
Container_Boundary(app, "myapp-hello — Express App") {
    Component(server, "server.ts", "Express", "App bootstrap, middleware chain, graceful shutdown")
    Component(router, "routes/index.ts", "Express Router", "GET /, GET /health, GET /docs")
    Component(auth_mw, "middleware/auth.ts", "JWT Middleware", "Verify Bearer token on protected routes")
    Component(rate_mw, "middleware/rate-limiter.ts", "express-rate-limit", "100 req/min per IP")
    Component(log_mw, "middleware/logger.ts", "pino", "Structured JSON logs + correlation IDs")
    Component(db, "db/index.ts", "node-postgres Pool", "Connection pool, query helper")
    Component(migrate, "db/migrate.ts", "node-postgres", "Run SQL migrations on startup (advisory lock)")
    Component(swagger, "swagger.ts", "swagger-ui-express", "OpenAPI 3.0 docs at /docs")
}
ContainerDb(postgres, "PostgreSQL", "PostgreSQL 16")
Container(traefik, "Traefik", "Reverse Proxy")
Rel(traefik, server, "HTTP :3001")
Rel(server, router, "Mount routes")
Rel(server, auth_mw, "Use middleware")
Rel(server, rate_mw, "Use middleware")
Rel(server, log_mw, "Use middleware")
Rel(server, migrate, "await on startup")
Rel(router, db, "Query")
Rel(router, swagger, "Serve docs")
Rel(db, postgres, "TCP :5432")
Rel(migrate, postgres, "Run migrations")
LAYOUT_WITH_LEGEND()
@enduml
```

## C4 Level 4 — Deployment

Shows the physical infrastructure: DNS resolution, Traefik as the entry point, Docker Swarm layers
(proxy, application, data), and how GitHub Actions triggers deployments.

<!-- prettier-ignore -->
```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Deployment.puml
title Deployment Diagram — Production Infrastructure
Deployment_Node(dns, "DuckDNS", "Free Dynamic DNS") {
    InfrastructureNode(dns_record, "apolenkov.duckdns.org", "DNS A record → 185.239.48.55")
}
Deployment_Node(vps, "VPS Ubuntu", "185.239.48.55") {
    Deployment_Node(swarm, "Docker Swarm", "Single-node swarm") {
        Deployment_Node(proxy_layer, "Proxy Layer") {
            ContainerInstance(traefik, "Traefik v3.6.7", "traefik:v3", "Ports: 80, 443")
        }
        Deployment_Node(app_layer, "Application Layer") {
            ContainerInstance(app_prod, "myapp-hello-prod", "node:22-alpine", "non-root, HEALTHCHECK")
            ContainerInstance(app_staging, "myapp-hello-staging", "node:22-alpine", "Replicas: 1")
            ContainerInstance(app_dev, "myapp-hello-dev", "node:22-alpine", "Replicas: 1")
        }
        Deployment_Node(data_layer, "Data Layer") {
            ContainerInstance(pg_prod, "pg-prod", "postgres:16-alpine", "Volume: pg_prod_data")
            ContainerInstance(pg_staging, "pg-staging", "postgres:16-alpine", "Volume: pg_staging_data")
            ContainerInstance(pg_dev, "pg-dev", "postgres:16-alpine", "Volume: pg_dev_data")
        }
    }
}
Deployment_Node(ci, "GitHub", "github.com") {
    InfrastructureNode(actions, "GitHub Actions", "CI/CD pipeline")
}
Rel(dns_record, traefik, "Resolves to")
Rel(traefik, app_prod, "Route prod domain")
Rel(actions, traefik, "Trigger deploy via Dokploy API")
LAYOUT_WITH_LEGEND()
@enduml
```

## Key Design Decisions

### Three Isolated Environments

Production, staging, and dev run as separate Docker services with separate databases. This
eliminates shared-state bugs between environments and allows safe testing of migrations before they
reach production.

### Migration Safety via Advisory Lock

`db/migrate.ts` acquires a PostgreSQL transaction-scoped advisory lock
(`pg_advisory_xact_lock(7777777)`) inside a single transaction before running migrations. The lock
auto-releases on `COMMIT`/`ROLLBACK`, eliminating the risk of lock leaks if a migration fails. In a
Docker Swarm deployment where multiple replicas can start simultaneously, only one instance applies
pending migrations — the others wait until the lock is released.

### Non-Root Container

The Dockerfile uses a dedicated `nodejs` (uid 1001) user for the production stage. The application
never runs as root inside the container, limiting the blast radius of any container escape.

### Graceful Shutdown

The server listens for `SIGTERM` and `SIGINT`. On shutdown it stops accepting new connections,
waits for active connections to finish, drains the PostgreSQL connection pool, and exits cleanly.
A 10-second hard timeout ensures the process eventually exits even if connections hang.

## See Also

- [Deployment Guide](deployment.md) — CI/CD pipeline and environment configuration
- [Development Guide](development.md) — Local setup and migration workflow
- [API Reference](api.md) — Endpoint documentation
