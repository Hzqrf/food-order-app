#!/bin/bash
# One backup: dump the database, archive the photos, prove the dump restores, copy it off the
# server if configured, then delete backups older than KEEP_DAYS.
#
# The result goes to /backups/status.json, which the owner's Today page reads: a failed or late
# backup shows under "Needs attention".
set -uo pipefail

DB_HOST=${DB_HOST:-mysql}
KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date +%Y-%m-%d_%H%M)
DUMP=/backups/db/kaunter_${STAMP}.sql.gz
PHOTOS=/backups/media/media_${STAMP}.tar.gz
mkdir -p /backups/db /backups/media
# The dumps hold password hashes and customer phone numbers: root only. The status file is
# made readable below, for the API.
umask 077

log() { echo "{\"msg\": \"$1\", \"time\": \"$(date --iso-8601=seconds)\"}"; }

finish() {  # finish <true|false> <message>
  local message=${2//\"/\'}
  printf '{"ok": %s, "finished_at": "%s", "message": "%s", "dump": "%s"}\n' \
    "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$message" "$(basename "$DUMP")" > /backups/status.json.tmp
  chmod 644 /backups/status.json.tmp
  mv /backups/status.json.tmp /backups/status.json
  log "backup finished: ok=$1 $message"
  [ "$1" = true ]
  exit $?
}

log "backup started"

# Rows created before this moment must all be in the dump; the restore check counts them.
START=$(mysql -h "$DB_HOST" -uroot -N -e "SELECT UTC_TIMESTAMP(6)") || finish false "cannot reach the database"

# --single-transaction: a consistent snapshot without stopping the shop.
if ! mysqldump -h "$DB_HOST" -uroot --single-transaction --routines --triggers --no-tablespaces \
    --databases kaunter | gzip > "$DUMP.tmp"; then
  rm -f "$DUMP.tmp"
  finish false "mysqldump failed"
fi
mv "$DUMP.tmp" "$DUMP"

tar -czf "$PHOTOS.tmp" -C /media . || { rm -f "$PHOTOS.tmp"; finish false "photo archive failed"; }
mv "$PHOTOS.tmp" "$PHOTOS"

check=$(/scripts/restore-check.sh "$DUMP" "$START" 2>&1) || finish false "restore check failed: ${check//$'\n'/ }"

offsite=""
if [ -n "${RCLONE_REMOTE:-}" ]; then
  if rclone copy /backups/db "$RCLONE_REMOTE/db" && rclone copy /backups/media "$RCLONE_REMOTE/media"; then
    offsite=", copied to $RCLONE_REMOTE"
  else
    finish false "saved on the server, but the copy to $RCLONE_REMOTE failed"
  fi
fi

find /backups/db /backups/media -type f -mtime +"$KEEP_DAYS" -delete

finish true "$(du -h "$DUMP" | cut -f1) database, $(du -h "$PHOTOS" | cut -f1) photos, $check$offsite"
