#!/usr/bin/env bash
# Setup Dokploy apps to pull pre-built images from GHCR instead of building from git.
#
# Prerequisites:
#   - DOKPLOY_URL and DOKPLOY_TOKEN env vars set
#   - Dokploy apps already exist (dev, staging, prod)
#   - GHCR image already pushed (run deploy.yml first)
#
# Usage:
#   export DOKPLOY_URL="https://your-dokploy.example.com"
#   export DOKPLOY_TOKEN="your-api-key"
#   bash scripts/setup-ghcr-dokploy.sh

set -euo pipefail

REGISTRY="ghcr.io"
IMAGE="apolenkov/myapp-api"

# Dokploy application IDs (from GitHub Secrets / CLAUDE.md)
DEV_APP_ID="${DOKPLOY_SERVICE_ID_DEV:-LhtGf_Cl2ITpD7CcSex8a}"
STAGING_APP_ID="${DOKPLOY_SERVICE_ID_STAGING:-L2cYMGloyihivImeTfoYt}"
PROD_APP_ID="${DOKPLOY_SERVICE_ID_PROD:-YPBkMrtU6gGRi_nq-gHir}"

if [ -z "${DOKPLOY_URL:-}" ] || [ -z "${DOKPLOY_TOKEN:-}" ]; then
  echo "Error: DOKPLOY_URL and DOKPLOY_TOKEN must be set"
  exit 1
fi

update_app() {
  local app_id="$1"
  local env_name="$2"

  echo "Updating $env_name ($app_id) → sourceType=docker, image=$REGISTRY/$IMAGE:latest"

  curl -sf -X POST \
    "$DOKPLOY_URL/api/trpc/application.update" \
    -H "x-api-key: $DOKPLOY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"json\":{\"applicationId\":\"$app_id\",\"sourceType\":\"docker\",\"dockerImage\":\"$REGISTRY/$IMAGE:latest\"}}"

  echo ""
  echo "$env_name updated ✓"
}

echo "=== Dokploy GHCR Migration ==="
echo "Registry: $REGISTRY/$IMAGE"
echo ""

# Step 1: Verify current state
echo "--- Current app states ---"
for pair in "$DEV_APP_ID:dev" "$STAGING_APP_ID:staging" "$PROD_APP_ID:production"; do
  app_id="${pair%%:*}"
  env_name="${pair##*:}"
  source_type=$(curl -s "$DOKPLOY_URL/api/trpc/application.one?input=%7B%22json%22%3A%7B%22applicationId%22%3A%22$app_id%22%7D%7D" \
    -H "x-api-key: $DOKPLOY_TOKEN" | jq -r '.result.data.json.sourceType' 2>/dev/null || echo "unknown")
  echo "$env_name: sourceType=$source_type"
done

echo ""
read -p "Switch all apps to docker source? (y/N) " confirm
if [ "$confirm" != "y" ]; then
  echo "Aborted."
  exit 0
fi

# Step 2: Update each environment
update_app "$DEV_APP_ID" "dev"
update_app "$STAGING_APP_ID" "staging"
update_app "$PROD_APP_ID" "production"

echo ""
echo "=== Done ==="
echo "All apps now pull from $REGISTRY/$IMAGE"
echo ""
echo "Next steps:"
echo "  1. Configure GHCR authentication in Dokploy (Settings → Docker Registry)"
echo "  2. Add registry: ghcr.io, username: apolenkov, password: <GitHub PAT with packages:read>"
echo "  3. Push a commit to main to trigger deploy.yml"
echo "  4. Verify: curl https://apolenkov.duckdns.org/health"
