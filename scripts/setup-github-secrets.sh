#!/usr/bin/env bash
set -euo pipefail

# Setup GitHub secrets for myapp-hello
#
# Prerequisites:
#   - gh CLI installed and authenticated (gh auth login)
#   - Repository access (owner or admin)
#
# Usage:
#   ./scripts/setup-github-secrets.sh              # interactive mode
#   ./scripts/setup-github-secrets.sh --dry-run     # show what would be set
#   ./scripts/setup-github-secrets.sh --from-env .env.secrets  # read from file

REPO="apolenkov/myapp-hello"
DRY_RUN=false
ENV_FILE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --from-env) ENV_FILE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--from-env <file>]"
      echo ""
      echo "Options:"
      echo "  --dry-run         Show what would be set without setting"
      echo "  --from-env <file> Read values from KEY=VALUE file"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Verify gh CLI
if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI not found. Install from https://cli.github.com/"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Error: gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

header() { echo -e "\n${CYAN}── $1 ──${NC}"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
skip() { echo -e "  ${DIM}· $1 (skipped)${NC}"; }
info() { echo -e "  ${DIM}$1${NC}"; }

# Read value from env file or prompt interactively
read_secret() {
  local key="$1"
  local desc="$2"
  local value=""

  if [[ -n "$ENV_FILE" ]]; then
    value=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true)
  fi

  if [[ -z "$value" && "$DRY_RUN" == false ]]; then
    echo -e "  ${desc}"
    read -rsp "  ${key}: " value
    echo ""
  fi

  if [[ "$DRY_RUN" == true ]]; then
    info "$key — $desc"
    return
  fi

  if [[ -z "$value" ]]; then
    skip "$key"
    return
  fi

  gh secret set "$key" --repo "$REPO" --body "$value"
  success "$key"
}

echo -e "${CYAN}GitHub Secrets Setup for ${REPO}${NC}"
if [[ "$DRY_RUN" == true ]]; then
  echo -e "${DIM}(dry-run mode — showing secrets that would be set)${NC}"
fi
echo ""

# ── Dokploy ────────────────────────────────────────────────────────────
header "Dokploy (deployment platform)"
read_secret "DOKPLOY_URL"            "Dokploy API URL (e.g. http://<VPS_IP>:3000)"
read_secret "DOKPLOY_TOKEN"          "Dokploy API token (Settings → API)"
read_secret "DOKPLOY_SERVICE_ID_PROD"    "App ID — production"
read_secret "DOKPLOY_SERVICE_ID_STAGING" "App ID — staging"
read_secret "DOKPLOY_SERVICE_ID_DEV"     "App ID — dev"
read_secret "DOKPLOY_DESTINATION_ID"     "S3 backup destination ID"

# ── App URLs ───────────────────────────────────────────────────────────
header "Application URLs (health checks)"
read_secret "APP_PUBLIC_URL"         "Production URL (e.g. https://apolenkov.duckdns.org)"
read_secret "APP_PUBLIC_URL_STAGING" "Staging URL"
read_secret "APP_PUBLIC_URL_DEV"     "Dev URL"

# ── Sentry ─────────────────────────────────────────────────────────────
header "Sentry (error tracking)"
read_secret "SENTRY_DSN"        "Sentry DSN (Project Settings → Client Keys)"
read_secret "SENTRY_AUTH_TOKEN" "Sentry auth token (source maps upload)"

# ── Codecov ────────────────────────────────────────────────────────────
header "Codecov (coverage)"
read_secret "CODECOV_TOKEN" "Codecov upload token (Repo Settings → Upload Token)"

# ── Grafana Cloud ──────────────────────────────────────────────────────
header "Grafana Cloud (observability)"
read_secret "GRAFANA_URL"       "Grafana stack URL (e.g. https://<stack>.grafana.net)"
read_secret "GRAFANA_API_TOKEN" "Cloud Access Policy token (all scopes)"
read_secret "OTEL_EXPORTER_OTLP_ENDPOINT" "OTLP gateway URL"
read_secret "OTEL_EXPORTER_OTLP_HEADERS"  "OTLP auth header (Authorization=Bearer <token>)"
read_secret "GRAFANA_TEMPO_QUERY_URL"      "Tempo query URL (for trace verification)"
read_secret "GRAFANA_TEMPO_USER"           "Tempo user ID"
read_secret "GRAFANA_TEMPO_READ_TOKEN"     "Tempo read token"
read_secret "GRAFANA_TEMPO_DATASOURCE_UID" "Tempo datasource UID in Grafana"

# ── S3 Backup ──────────────────────────────────────────────────────────
header "Yandex Object Storage (DB backups)"
read_secret "YANDEX_S3_ACCESS_KEY" "S3 access key ID"
read_secret "YANDEX_S3_SECRET_KEY" "S3 secret access key"

# ── Summary ────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}Done!${NC} All secrets configured for ${REPO}."
echo -e "${DIM}Verify: gh secret list --repo ${REPO}${NC}"
