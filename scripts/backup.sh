#!/bin/bash
set -euo pipefail

ALERT_WEBHOOK="${BACKUP_ALERT_WEBHOOK:-}"
DATE=$(date +%Y%m%d_%H%M%S)
TMP=$(mktemp -d "/tmp/backup_${DATE}_XXXXXX")
chmod 700 "$TMP"
LOGFILE="/var/log/backup.log"

cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

alert() {
  echo "[BACKUP ERROR] $1" | tee -a "$LOGFILE"
  if [ -n "$ALERT_WEBHOOK" ]; then
    local payload
    payload=$(jq -nc --arg text "Backup FAILED: $1" '{"text": $text}')
    curl -sf -X POST "$ALERT_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "$payload" || true
  fi
}

mkdir -p "$TMP/postgres" "$TMP/configs"

# 1. PostgreSQL dumps + size validation
for SVC in prod staging dev; do
  CNAME=$(docker ps --filter name="pg-${SVC}" --format "{{.Names}}" | head -1)
  if [ -n "$CNAME" ]; then
    DUMP="$TMP/postgres/myapp_${SVC}.sql.gz"
    docker exec "$CNAME" pg_dump -U postgres "myapp_${SVC}" 2>>"$LOGFILE" | gzip > "$DUMP"
    if [ "${PIPESTATUS[0]}" -ne 0 ]; then
      alert "pg_dump failed for ${SVC}"
      exit 1
    fi
    SIZE=$(stat -c%s "$DUMP" 2>/dev/null || stat -f%z "$DUMP")
    if [ "$SIZE" -lt 1024 ]; then
      alert "Dump for ${SVC} is suspiciously small: ${SIZE} bytes"
      exit 1
    fi
  fi
done

# 2. Dokploy config + DB
cp -r /etc/dokploy "$TMP/configs/dokploy"

# 3. Grafana persistent data (dashboards, annotations, preferences)
if docker volume inspect observability_grafana_data >/dev/null 2>&1; then
  mkdir -p "$TMP/grafana"
  docker run --rm -v observability_grafana_data:/data -v "$TMP/grafana":/backup \
    alpine tar czf /backup/grafana-data.tar.gz -C /data .
fi

# 4. Upload to R2 — use copy (NOT sync) to avoid accidental deletion
rclone copy "$TMP" "r2:myapp-backups/${DATE}" --progress 2>>"$LOGFILE" || {
  alert "rclone upload failed for ${DATE}"
  exit 1
}

# 5. Prune backups older than 30 days
rclone delete r2:myapp-backups --min-age 30d 2>>"$LOGFILE" || true

# Cleanup handled by trap EXIT
echo "$(date): Backup ${DATE} uploaded to R2 successfully" | tee -a "$LOGFILE"
