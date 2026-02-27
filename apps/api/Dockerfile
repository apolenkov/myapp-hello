# Pin versions: update periodically via `docker pull` + `npm view turbo version`
# ── Pruner ─────────────────────────────────────────────────────────────────
FROM node:22.22.0-alpine3.22 AS pruner
RUN npm i -g turbo@2.8.11
WORKDIR /app
COPY . .
RUN turbo prune @myapp/api --docker

# ── Builder ────────────────────────────────────────────────────────────────
FROM node:22.22.0-alpine3.22 AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN npm ci
COPY --from=pruner /app/out/full/ .
RUN npx turbo run build --filter=@myapp/api

# ── Production ─────────────────────────────────────────────────────────────
FROM node:22.22.0-alpine3.22 AS production
RUN apk add --no-cache dumb-init

ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE

WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --chown=nodejs:nodejs --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=nodejs:nodejs --from=builder /app/apps/api/migrations ./apps/api/migrations

USER nodejs
ENV PORT=3001
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--require", "./apps/api/dist/instrumentation.js", "apps/api/dist/main.js"]
