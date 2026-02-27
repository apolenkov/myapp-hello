#!/bin/bash
# ── Epic 1: SSL/HTTPS Setup ──────────────────────────────────────────────────
# Run on VPS: ssh root@185.239.48.55 'bash -s' < scripts/ssl-setup.sh
#
# Prerequisites:
#   - ACME_EMAIL:         your real email for Let's Encrypt notifications
#   - DOKPLOY_API_TOKEN:  from Dokploy UI → Settings → API Tokens
#   - DOKPLOY_SERVICE_ID_PROD: from Dokploy UI → Application → Settings
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${ACME_EMAIL:?Set ACME_EMAIL env var}"
: "${DOKPLOY_API_TOKEN:?Set DOKPLOY_API_TOKEN env var}"
: "${DOKPLOY_SERVICE_ID_PROD:?Set DOKPLOY_SERVICE_ID_PROD env var}"

DOKPLOY_URL="http://localhost:3000"
TRAEFIK_CFG="/etc/dokploy/traefik/traefik.yml"
DOMAIN="apolenkov.duckdns.org"

echo "=== Step 1: Fix ACME email in traefik.yml ==="
# Check current email
CURRENT_EMAIL=$(grep -oP 'email:\s*\K\S+' "$TRAEFIK_CFG" || true)
echo "Current ACME email: $CURRENT_EMAIL"

if [ "$CURRENT_EMAIL" != "$ACME_EMAIL" ]; then
  # Backup first
  cp "$TRAEFIK_CFG" "${TRAEFIK_CFG}.bak.$(date +%Y%m%d_%H%M%S)"
  # Replace email
  sed -i "s|email:.*|email: ${ACME_EMAIL}|" "$TRAEFIK_CFG"
  echo "Updated ACME email to: $ACME_EMAIL"

  # Restart Traefik to pick up new email
  TRAEFIK_SVC=$(docker service ls --filter name=traefik --format "{{.Name}}" | head -1)
  if [ -n "$TRAEFIK_SVC" ]; then
    echo "Restarting Traefik service: $TRAEFIK_SVC"
    docker service update --force "$TRAEFIK_SVC"
    echo "Waiting 30s for Traefik to restart..."
    sleep 30
  fi
else
  echo "ACME email already correct, skipping."
fi

echo ""
echo "=== Step 2: Register domain in Dokploy ==="
HTTP_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "${DOKPLOY_URL}/api/trpc/domain.create" \
  -H "x-api-key: ${DOKPLOY_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"json\":{\"applicationId\":\"${DOKPLOY_SERVICE_ID_PROD}\",\"host\":\"${DOMAIN}\",\"https\":true,\"port\":3001,\"certificateType\":\"letsencrypt\"}}" \
  || true)

if [ "$HTTP_STATUS" = "200" ]; then
  echo "Domain registered successfully via Dokploy API"
else
  echo "Dokploy API returned: $HTTP_STATUS — falling back to manual Traefik config"
  echo "Creating manual dynamic config..."

  # Find container IP for prod app
  PROD_CONTAINER=$(docker ps --filter name="myapp-hello-prod" --format "{{.Names}}" | head -1)
  if [ -n "$PROD_CONTAINER" ]; then
    CONTAINER_IP=$(docker inspect "$PROD_CONTAINER" --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' | head -1)
    echo "Prod container IP: $CONTAINER_IP"
  else
    echo "WARNING: prod container not found, using placeholder IP"
    CONTAINER_IP="127.0.0.1"
  fi

  mkdir -p /etc/dokploy/traefik/dynamic
  cat > /etc/dokploy/traefik/dynamic/myapp-prod.yml << EOF
http:
  routers:
    myapp-prod:
      rule: Host(\`${DOMAIN}\`)
      entryPoints: [websecure]
      service: myapp-prod-svc
      tls:
        certResolver: letsencrypt
    myapp-prod-http:
      rule: Host(\`${DOMAIN}\`)
      entryPoints: [web]
      middlewares: [redirect-to-https]
      service: myapp-prod-svc
  services:
    myapp-prod-svc:
      loadBalancer:
        servers:
          - url: http://${CONTAINER_IP}:3001
EOF
  echo "Manual config written to /etc/dokploy/traefik/dynamic/myapp-prod.yml"
fi

echo ""
echo "=== Step 3: Wait for certificate issuance ==="
echo "Watching acme.json for certificate (up to 2 minutes)..."
ACME_JSON="/etc/dokploy/traefik/dynamic/acme.json"

for i in $(seq 1 24); do
  if [ -f "$ACME_JSON" ] && [ "$(wc -c < "$ACME_JSON")" -gt 100 ]; then
    echo "Certificate issued! acme.json size: $(wc -c < "$ACME_JSON") bytes"
    break
  fi
  echo "  Waiting... (${i}/24)"
  sleep 5
done

echo ""
echo "=== Step 4: Verify ==="
echo "Testing HTTPS..."
HTTP_CODE=$(curl -sI "https://${DOMAIN}/health" -o /dev/null -w "%{http_code}" || true)
echo "HTTPS /health → HTTP $HTTP_CODE (expected: 200)"

echo "Testing HTTP redirect..."
REDIRECT=$(curl -sI "http://${DOMAIN}/" -o /dev/null -w "%{http_code}" || true)
echo "HTTP / → HTTP $REDIRECT (expected: 301)"

if [ "$HTTP_CODE" = "200" ]; then
  echo ""
  echo "SUCCESS: SSL is working! https://${DOMAIN}/health returns 200"
else
  echo ""
  echo "NOTICE: SSL not yet ready. Certificate may still be issuing (can take 1-2 min)."
  echo "Manual check: watch -n 5 'ls -lh ${ACME_JSON}'"
fi
