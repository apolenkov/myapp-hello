#!/usr/bin/env bash

set -euo pipefail

require_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

ensure_not_login_redirect() {
  local body="$1"
  if printf '%s' "$body" | grep -qiE '<a href="/login|redirectTo='; then
    echo "Query endpoint returned Grafana login redirect." >&2
    echo "Use Grafana API token mode or a correct Tempo query URL." >&2
    exit 1
  fi
}

SERVICE_NAME="${SERVICE_NAME:-myapp-hello}"
SERVICE_NAMESPACE="${SERVICE_NAMESPACE:-my-application-group}"
DEPLOYMENT_ENVIRONMENT="${DEPLOYMENT_ENVIRONMENT:-production}"
LOOKBACK="${LOOKBACK:-1h}"
LIMIT="${LIMIT:-20}"

MODE="direct"
BASE_URL=""
AUTH_HEADER=""
BASIC_AUTH=""

# Determine mode based on available variables.
# Direct mode with a specific Tempo cluster URL is often more reliable for Access Policy tokens.
if [ -n "${GRAFANA_TEMPO_QUERY_URL:-}" ] && [ -n "${GRAFANA_TEMPO_USER:-}" ] && [ -n "${GRAFANA_TEMPO_READ_TOKEN:-}" ]; then
  MODE="direct"
  require_var GRAFANA_TEMPO_QUERY_URL
  require_var GRAFANA_TEMPO_USER
  require_var GRAFANA_TEMPO_READ_TOKEN
  BASE_URL="${GRAFANA_TEMPO_QUERY_URL%/}"
  BASIC_AUTH="${GRAFANA_TEMPO_USER}:${GRAFANA_TEMPO_READ_TOKEN}"
elif [ -n "${GRAFANA_URL:-}" ] && [ -n "${GRAFANA_API_TOKEN:-}" ]; then
  MODE="grafana-proxy"
  require_var GRAFANA_URL
  require_var GRAFANA_API_TOKEN
  BASE_URL="${GRAFANA_URL%/}"

  TEMPO_UID="${GRAFANA_TEMPO_DATASOURCE_UID:-}"
  if [ -z "$TEMPO_UID" ]; then
    if ! command -v jq >/dev/null 2>&1; then
      echo "jq is required to auto-detect Tempo datasource UID." >&2
      exit 1
    fi
    datasources_json="$(/usr/bin/curl -fsS -H "Authorization: Bearer ${GRAFANA_API_TOKEN}" "$BASE_URL/api/datasources")"
    TEMPO_UID="$(printf '%s' "$datasources_json" | jq -r '[.[] | select(.type=="tempo")] | (map(select(.isDefault==true))[0] // .[0]).uid // empty')"
  fi

  if [ -z "$TEMPO_UID" ] || [ "$TEMPO_UID" = "null" ]; then
    echo "Unable to resolve Tempo datasource UID via Grafana API." >&2
    exit 1
  fi

  AUTH_HEADER="Authorization: Bearer ${GRAFANA_API_TOKEN}"
  BASE_URL="$BASE_URL/api/datasources/proxy/uid/$TEMPO_UID"
else
  echo "No valid Grafana credentials provided." >&2
  echo "Set GRAFANA_TEMPO_QUERY_URL + GRAFANA_TEMPO_USER + GRAFANA_TEMPO_READ_TOKEN (preferred for Access Policies)" >&2
  echo "or GRAFANA_URL + GRAFANA_API_TOKEN (proxy mode)." >&2
  exit 1
fi

curl_json() {
  local url="$1"
  if [ "$MODE" = "grafana-proxy" ]; then
    /usr/bin/curl -fsS -H "$AUTH_HEADER" "$url"
  else
    /usr/bin/curl -fsS -u "$BASIC_AUTH" "$url"
  fi
}

curl_json_g() {
  local url="$1"
  local q="$2"
  if [ "$MODE" = "grafana-proxy" ]; then
    /usr/bin/curl -fsS -H "$AUTH_HEADER" -G "$url" \
      --data-urlencode "q=$q" \
      --data-urlencode "since=$LOOKBACK" \
      --data-urlencode "limit=$LIMIT"
  else
    /usr/bin/curl -fsS -u "$BASIC_AUTH" -G "$url" \
      --data-urlencode "q=$q" \
      --data-urlencode "since=$LOOKBACK" \
      --data-urlencode "limit=$LIMIT"
  fi
}

echo "Mode: $MODE"
echo "Checking Tempo tag values..."
for tag in service.name service.namespace deployment.environment; do
  tag_response="$(curl_json "$BASE_URL/api/search/tag/$tag/values")"
  ensure_not_login_redirect "$tag_response"
  echo "  ok: $tag"
done

query="{ resource.service.name=\"${SERVICE_NAME}\" && resource.service.namespace=\"${SERVICE_NAMESPACE}\" && resource.deployment.environment=\"${DEPLOYMENT_ENVIRONMENT}\" }"

echo "Running TraceQL search..."
response="$(curl_json_g "$BASE_URL/api/search" "$query")"
ensure_not_login_redirect "$response"

if echo "$response" | grep -q '"traces"'; then
  echo "Trace search completed successfully"
  echo "$response"
  exit 0
fi

echo "Unexpected Tempo response:" >&2
echo "$response" >&2
exit 1
