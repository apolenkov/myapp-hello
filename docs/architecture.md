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
Person(dev, "Developer", "Opens PRs to main branch")
Person(user, "End User", "Accesses app via browser or API client")
System(myapp, "myapp-hello", "Node.js REST API with 3 environments: dev/staging/prod")
System_Ext(github, "GitHub", "Source control + GitHub Actions CI/CD")
System_Ext(ghcr, "GHCR", "GitHub Container Registry — Docker image storage")
System_Ext(dokploy, "Dokploy", "Self-hosted PaaS — Docker Swarm orchestration")
System_Ext(duckdns, "DuckDNS", "Free dynamic DNS: apolenkov.duckdns.org")
System_Ext(letsencrypt, "Let's Encrypt", "Free TLS certificates via ACME HTTP-01")
Rel(dev, github, "Open PR to main", "HTTPS")
Rel(github, ghcr, "Build & push image", "docker push (SHA tag)")
Rel(github, dokploy, "Trigger deploy", "REST API (application.deploy)")
Rel(dokploy, ghcr, "Pull image", "docker pull")
Rel(dokploy, myapp, "Deploys container", "Docker Swarm")
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
    Container(app_prod, "myapp-hello-prod", "Node.js 22 + NestJS", "Production env, :3013 ext / :3001 int")
    Container(app_staging, "myapp-hello-staging", "Node.js 22 + NestJS", "Staging env, :3012 ext / :3001 int")
    Container(app_dev, "myapp-hello-dev", "Node.js 22 + NestJS", "Dev env, :3011 ext / :3001 int")
    ContainerDb(pg_prod, "PostgreSQL prod", "PostgreSQL 17", "Production database")
    ContainerDb(pg_staging, "PostgreSQL staging", "PostgreSQL 17", "Staging database")
    ContainerDb(pg_dev, "PostgreSQL dev", "PostgreSQL 17", "Dev database")
    Container(grafana, "Grafana", "Grafana 11.5", "Dashboards, alerts, :3100")
    Container(prometheus, "Prometheus", "Prometheus v3.2", "Metrics storage, scrape, 30d retention")
    Container(loki, "Loki", "Grafana Loki 3.4", "Log aggregation, TSDB, 30d retention")
    Container(tempo, "Tempo", "Grafana Tempo 2.7", "Distributed traces, OTLP receiver")
    Container(promtail, "Promtail", "Grafana Promtail 3.4", "Docker log collector")
}
System_Ext(github, "GitHub Actions")
System_Ext(ghcr, "GHCR", "Docker image registry")
Rel(user, traefik, "HTTPS", ":443")
Rel(dev, dokploy_admin, "Manage deployments", "HTTP :3000")
Rel(dev, grafana, "View dashboards", "HTTP :3100")
Rel(github, ghcr, "Push image", "SHA tag + latest")
Rel(github, dokploy_admin, "Trigger deploy", "REST /api/trpc/application.deploy")
Rel(dokploy_admin, ghcr, "Pull image", "docker pull")
Rel(traefik, app_prod, "Route apolenkov.duckdns.org", "HTTP :3001")
Rel(traefik, app_staging, "Route staging.*", "HTTP :3001")
Rel(traefik, app_dev, "Route dev.*", "HTTP :3001")
Rel(app_prod, pg_prod, "SQL", "TCP :5432")
Rel(app_staging, pg_staging, "SQL", "TCP :5432")
Rel(app_dev, pg_dev, "SQL", "TCP :5432")
Rel(prometheus, app_prod, "Scrape /metrics", "HTTP :3001")
Rel(promtail, loki, "Push logs", "HTTP :3100")
Rel(app_prod, tempo, "Send traces", "OTLP HTTP :4318")
Rel(grafana, prometheus, "Query metrics", "HTTP :9090")
Rel(grafana, loki, "Query logs", "HTTP :3100")
Rel(grafana, tempo, "Query traces", "HTTP :3200")
LAYOUT_WITH_LEGEND()
@enduml
```

## C4 Level 3 — Component

Shows the internal structure of the NestJS application: module architecture, guards, interceptors,
dependency injection, and how the database migration system works.

<!-- prettier-ignore -->
```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Component.puml
title Component Diagram — myapp-hello internals
Container_Boundary(app, "myapp-hello — NestJS App") {
    Component(main, "main.ts", "NestJS Bootstrap", "App bootstrap, Swagger setup, graceful shutdown")
    Component(app_module, "app.module.ts", "Root Module", "Imports all feature modules, global guards")
    Component(app_ctrl, "app.controller.ts", "Controller", "GET /, GET /health")
    Component(app_svc, "app.service.ts", "Service", "DB connectivity check, app metadata")
    Component(auth_module, "auth/", "AuthModule", "JwtModule + global JwtAuthGuard")
    Component(auth_guard, "auth/auth.guard.ts", "JwtAuthGuard", "Verify Bearer token, @Public() bypass")
    Component(db_module, "database/", "DatabaseModule", "pg Pool provider + DatabaseService")
    Component(metrics_module, "metrics/", "MetricsModule", "OTel metrics interceptor")
    Component(metrics_int, "metrics/metrics.interceptor.ts", "MetricsInterceptor", "HTTP duration + count")
    Component(otel, "instrumentation.ts", "OpenTelemetry SDK", "Prometheus exporter, OTLP traces")
    Component(migrate, "database/migrate.ts", "node-postgres", "Run SQL migrations on startup (advisory lock)")
}
ContainerDb(postgres, "PostgreSQL", "PostgreSQL 17")
Container(traefik, "Traefik", "Reverse Proxy")
Rel(traefik, main, "HTTP :3001")
Rel(main, app_module, "Bootstrap")
Rel(main, otel, "Import first for monkey-patching")
Rel(app_module, app_ctrl, "Declares")
Rel(app_module, auth_module, "Imports")
Rel(app_module, db_module, "Imports")
Rel(app_module, metrics_module, "Imports")
Rel(app_ctrl, app_svc, "Injects")
Rel(app_svc, db_module, "Injects DatabaseService")
Rel(auth_guard, auth_module, "Provided by")
Rel(metrics_int, metrics_module, "Provided by")
Rel(db_module, postgres, "TCP :5432")
Rel(migrate, postgres, "Run migrations")
Rel(otel, prometheus_ext, "Serve /metrics", "HTTP")
Rel(otel, tempo_ext, "Send traces", "OTLP HTTP :4318")
Container(prometheus_ext, "Prometheus", "Scrapes /metrics")
Container(tempo_ext, "Tempo", "Receives OTLP traces")
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
            ContainerInstance(pg_prod, "pg-prod", "postgres:17-alpine", "Volume: pg_prod_data")
            ContainerInstance(pg_staging, "pg-staging", "postgres:17-alpine", "Volume: pg_staging_data")
            ContainerInstance(pg_dev, "pg-dev", "postgres:17-alpine", "Volume: pg_dev_data")
        }
        Deployment_Node(obs_layer, "Observability Layer") {
            ContainerInstance(grafana, "Grafana", "grafana:11.5.2", "Port: 3100, dashboards + alerts")
            ContainerInstance(prometheus, "Prometheus", "prom/prometheus:v3.2.1", "30d retention, 1GB max")
            ContainerInstance(loki, "Loki", "grafana/loki:3.4.2", "TSDB v13, 30d retention")
            ContainerInstance(tempo, "Tempo", "grafana/tempo:2.7.1", "OTLP HTTP+gRPC, span-metrics")
            ContainerInstance(promtail, "Promtail", "grafana/promtail:3.4.2", "Docker SD auto-discovery")
        }
    }
}
Deployment_Node(ci, "GitHub", "github.com") {
    InfrastructureNode(actions, "GitHub Actions", "CI/CD pipeline")
    InfrastructureNode(ghcr, "GHCR", "Docker image registry")
}
Rel(dns_record, traefik, "Resolves to")
Rel(traefik, app_prod, "Route prod domain")
Rel(actions, ghcr, "Build & push image")
Rel(actions, traefik, "Trigger deploy via Dokploy API")
Rel(prometheus, app_prod, "Scrape /metrics")
Rel(promtail, loki, "Push logs")
Rel(app_prod, tempo, "OTLP traces")
LAYOUT_WITH_LEGEND()
@enduml
```

## Key Design Decisions

### Three Isolated Environments

Production, staging, and dev run as separate Docker services with separate databases. This
eliminates shared-state bugs between environments and allows safe testing of migrations before they
reach production.

### Migration Safety via Advisory Lock

`database/migrate.ts` acquires a PostgreSQL transaction-scoped advisory lock
(`pg_advisory_xact_lock(7777777)`) inside a single transaction before running migrations. The lock
auto-releases on `COMMIT`/`ROLLBACK`, eliminating the risk of lock leaks if a migration fails. In a
Docker Swarm deployment where multiple replicas can start simultaneously, only one instance applies
pending migrations — the others wait until the lock is released.

### Non-Root Container

The Dockerfile uses a dedicated `nodejs` (uid 1001) user for the production stage. The application
never runs as root inside the container, limiting the blast radius of any container escape.

### Graceful Shutdown

NestJS built-in `enableShutdownHooks()` handles `SIGTERM` and `SIGINT`. On shutdown, NestJS invokes
the `OnModuleDestroy` lifecycle hooks (draining the PostgreSQL connection pool via `DatabaseService`)
and stops accepting new connections.

### Observability via OpenTelemetry

The application uses OpenTelemetry SDK for vendor-neutral instrumentation. `instrumentation.ts` must
be imported before any other module to enable monkey-patching of `http`, `express` (NestJS adapter),
and `pg`.
Metrics are exposed via a Prometheus exporter at `/metrics`, and traces are sent to Tempo via OTLP.
Promtail collects structured Pino logs from Docker and forwards them to Loki. All three signals
(metrics, logs, traces) are correlated in Grafana via `traceId`.

## See Also

- [Observability Guide](observability.md) — Stack overview, dashboards, alerts, adding new services
- [Deployment Guide](deployment.md) — CI/CD pipeline and environment configuration
- [Development Guide](development.md) — Local setup and migration workflow
- [API Reference](api.md) — Endpoint documentation
