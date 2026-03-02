#!/usr/bin/env bash
# Setup Grafana Cloud alert rules for myapp-hello.
#
# Prerequisites:
#   GRAFANA_URL          — Grafana Cloud stack URL (e.g. https://<stack>.grafana.net)
#   GRAFANA_API_TOKEN    — Grafana API token with alerting:write scope
#
# Usage:
#   ./scripts/setup-grafana-alerts.sh
#
# The script creates a folder "myapp-hello" in Grafana and imports alert rules
# from observability/grafana/alerts/alert-rules.yml.

set -euo pipefail

: "${GRAFANA_URL:?Set GRAFANA_URL env var (e.g. https://your-stack.grafana.net)}"
: "${GRAFANA_API_TOKEN:?Set GRAFANA_API_TOKEN env var}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALERTS_FILE="${SCRIPT_DIR}/../observability/grafana/alerts/alert-rules.yml"

if [[ ! -f "$ALERTS_FILE" ]]; then
  echo "Error: Alert rules file not found: $ALERTS_FILE"
  exit 1
fi

echo "==> Creating alert folder 'myapp-hello' in Grafana..."
FOLDER_UID=$(curl -sf -X POST "${GRAFANA_URL}/api/folders" \
  -H "Authorization: Bearer ${GRAFANA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"uid":"myapp-hello","title":"myapp-hello"}' \
  2>/dev/null | jq -r '.uid // empty' || true)

if [[ -z "$FOLDER_UID" ]]; then
  # Folder may already exist
  FOLDER_UID=$(curl -sf "${GRAFANA_URL}/api/folders/myapp-hello" \
    -H "Authorization: Bearer ${GRAFANA_API_TOKEN}" \
    | jq -r '.uid')
  echo "    Folder already exists: ${FOLDER_UID}"
else
  echo "    Created folder: ${FOLDER_UID}"
fi

echo "==> Alert rules file: ${ALERTS_FILE}"
echo ""
echo "To import alert rules:"
echo "  1. Open ${GRAFANA_URL}/alerting/list"
echo "  2. Click 'Import' or use the Alerting Provisioning API"
echo "  3. Upload observability/grafana/alerts/alert-rules.yml"
echo ""
echo "Or use the Grafana Provisioning API:"
echo "  curl -X POST '${GRAFANA_URL}/api/v1/provisioning/alert-rules' \\"
echo "    -H 'Authorization: Bearer \${GRAFANA_API_TOKEN}' \\"
echo "    -H 'Content-Type: application/yaml' \\"
echo "    --data-binary @${ALERTS_FILE}"
echo ""
echo "Done. Alert rules are ready for import."
