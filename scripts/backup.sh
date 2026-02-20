#!/bin/bash
set -euo pipefail

ALERT_WEBHOOK="${BACKUP_ALERT_WEBHOOK:-}"
DATE=$(date +%Y%m%d_%H%M%S)
TMP="/tmp/backup_${DATE}"
LOGFILE="/var/log/backup.log"

alert() {
  echo "[BACKUP ERROR] $1" | tee -a "$LOGFILE"
  [ -n "$ALERT_WEBHOOK" ] && \
    curl -sf -X POST "$ALERT_WEBHOOK" -d "{\"text\":\"Backup FAILED: $1\"}" || true
}

mkdir -p "$TMP/postgres" "$TMP/configs"

# 1. PostgreSQL dumps + size validation
for SVC in prod staging dev; do
  CNAME=$(docker ps --filter name="pg-${SVC}" --format "{{.Names}}" | head -1)
  if [ -n "$CNAME" ]; then
    DUMP="$TMP/postgres/myapp_${SVC}.sql.gz"
    docker exec "$CNAME" pg_dump -U postgres myapp_db | gzip > "$DUMP"
    SIZE=$(stat -c%s "$DUMP" 2>/dev/null || stat -f%z "$DUMP")
    if [ "$SIZE" -lt 1024 ]; then
      alert "Dump for ${SVC} is suspiciously small: ${SIZE} bytes"
      exit 1
    fi
  fi
done

# 2. Dokploy config + DB
cp -r /etc/dokploy "$TMP/configs/dokploy"

# 3. Upload to R2 — use copy (NOT sync) to avoid accidental deletion
rclone copy "$TMP" "r2:myapp-backups/${DATE}" --progress 2>>"$LOGFILE" || {
  alert "rclone upload failed for ${DATE}"
  exit 1
}

# 4. Prune backups older than 30 days
rclone delete r2:myapp-backups --min-age 30d 2>>"$LOGFILE" || true

# Cleanup
rm -rf "$TMP"
echo "$(date): Backup ${DATE} uploaded to R2 successfully" | tee -a "$LOGFILE"
