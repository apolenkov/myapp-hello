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

# Determine mode and authentication.
# For Grafana Cloud Access Policies (glc_ tokens), Bearer auth is preferred.
# Legacy tokens or direct cluster access might still use Basic auth (InstanceID:Token).

AUTH_HEADER=""
BASIC_AUTH=""
MODE="direct"

if [ -n "${GRAFANA_TEMPO_READ_TOKEN:-}" ]; then
  if [[ "$GRAFANA_TEMPO_READ_TOKEN" =~ ^glc_ ]]; then
    MODE="bearer"
    AUTH_HEADER="Authorization: Bearer ${GRAFANA_TEMPO_READ_TOKEN}"
  elif [ -n "${GRAFANA_TEMPO_USER:-}" ]; then
    MODE="direct-basic"
    BASIC_AUTH="${GRAFANA_TEMPO_USER}:${GRAFANA_TEMPO_READ_TOKEN}"
  fi
fi

# Fallback to general API token if specific tempo read token is not set
if [ -z "$AUTH_HEADER" ] && [ -z "$BASIC_AUTH" ] && [ -n "${GRAFANA_API_TOKEN:-}" ]; then
  MODE="bearer"
  AUTH_HEADER="Authorization: Bearer ${GRAFANA_API_TOKEN}"
fi

if [ -n "${GRAFANA_TEMPO_QUERY_URL:-}" ]; then
  BASE_URL="${GRAFANA_TEMPO_QUERY_URL%/}"
elif [ -n "${GRAFANA_URL:-}" ]; then
  MODE="grafana-proxy"
  require_var GRAFANA_URL
  BASE_URL="${GRAFANA_URL%/}"

  TEMPO_UID="${GRAFANA_TEMPO_DATASOURCE_UID:-}"
  if [ -z "$TEMPO_UID" ]; then
    if ! command -v jq >/dev/null 2>&1; then
      echo "jq is required to auto-detect Tempo datasource UID." >&2
      exit 1
    fi
    datasources_json="$(curl -fsS -H "$AUTH_HEADER" "$BASE_URL/api/datasources")"
    TEMPO_UID="$(printf '%s' "$datasources_json" | jq -r '[.[] | select(.type=="tempo")] | (map(select(.isDefault==true))[0] // .[0]).uid // empty')"
  fi

  if [ -z "$TEMPO_UID" ] || [ "$TEMPO_UID" = "null" ]; then
    echo "Unable to resolve Tempo datasource UID via Grafana API." >&2
    exit 1
  fi

  BASE_URL="$BASE_URL/api/datasources/proxy/uid/$TEMPO_UID"
else
  echo "No valid Grafana credentials or URLs provided." >&2
  exit 1
fi

curl_json() {
  local url="$1"
  if [ "$MODE" = "direct-basic" ]; then
    curl -fsS -u "$BASIC_AUTH" "$url"
  else
    curl -fsS -H "$AUTH_HEADER" "$url"
  fi
}

curl_json_g() {
  local url="$1"
  local q="$2"
  if [ "$MODE" = "direct-basic" ]; then
    curl -fsS -u "$BASIC_AUTH" -G "$url" \
      --data-urlencode "q=$q" \
      --data-urlencode "since=$LOOKBACK" \
      --data-urlencode "limit=$LIMIT"
  else
    curl -fsS -H "$AUTH_HEADER" -G "$url" \
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
