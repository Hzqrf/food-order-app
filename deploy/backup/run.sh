#!/bin/bash
# Runs a backup every night at BACKUP_TIME (shop time, from TZ), and once straight away on the
# first start so a new server is never without one.
set -u

[ -f /backups/status.json ] || /scripts/backup.sh

while true; do
  now=$(date +%s)
  next=$(date -d "today ${BACKUP_TIME}" +%s)
  [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${BACKUP_TIME}" +%s)
  echo "{\"msg\": \"next backup\", \"at\": \"$(date -d "@$next" --iso-8601=seconds)\"}"
  sleep $((next - now))
  /scripts/backup.sh
done
