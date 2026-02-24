# ── Pruner ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS pruner
RUN npm i -g turbo@2
WORKDIR /app
COPY . .
RUN turbo prune @myapp/api --docker

# ── Builder ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN npm ci
COPY --from=pruner /app/out/full/ .
RUN npx turbo run build --filter=@myapp/api

# ── Production ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS production
RUN apk add --no-cache dumb-init

WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --chown=nodejs:nodejs --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=nodejs:nodejs --from=builder /app/apps/api/migrations ./apps/api/migrations

USER nodejs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{process.exit(r.statusCode===200?0:1)})}).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--require", "./apps/api/dist/instrumentation.js", "apps/api/dist/main.js"]
