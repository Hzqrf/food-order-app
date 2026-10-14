#!/bin/bash
# Puts a backup back, replacing the live database and photos. Stop the API first:
#   docker compose stop api
#   docker compose run --rm --no-deps backup /scripts/restore.sh kaunter_2026-10-12_0430 --yes
#   docker compose start api
# (--no-deps, or compose starts the API again first.) List the backups with:
#   docker compose exec backup ls /backups/db
set -euo pipefail

NAME=${1:?give the backup name, e.g. kaunter_2026-10-12_0430}
STAMP=${NAME#kaunter_}
STAMP=${STAMP%.sql.gz}
DUMP=/backups/db/kaunter_${STAMP}.sql.gz
PHOTOS=/backups/media/media_${STAMP}.tar.gz
DB_HOST=${DB_HOST:-mysql}

[ -f "$DUMP" ] || { echo "No such backup: $DUMP"; exit 1; }
if [ "${2:-}" != "--yes" ]; then
  echo "This replaces ALL current orders, menu and staff with the backup from $STAMP."
  echo "Run again with --yes at the end to go ahead."
  exit 1
fi

gunzip -t "$DUMP" || { echo "The backup file is damaged: $DUMP"; exit 1; }

# Restoring under a running API would mix new orders into the old data.
connected=$(mysql -h "$DB_HOST" -uroot -N -e "SELECT COUNT(*) FROM information_schema.processlist WHERE user = 'kaunter'")
if [ "$connected" != "0" ]; then
  echo "The API is still connected to the database. Stop it first: docker compose stop api"
  exit 1
fi

echo "Restoring the database from $DUMP"
mysql -h "$DB_HOST" -uroot -e "DROP DATABASE IF EXISTS kaunter"
gunzip -c "$DUMP" | mysql -h "$DB_HOST" -uroot
mysql -h "$DB_HOST" -uroot -e "GRANT ALL PRIVILEGES ON kaunter.* TO 'kaunter'@'%'"

if [ -f "$PHOTOS" ]; then
  echo "Restoring photos from $PHOTOS"
  find /media -mindepth 1 -delete
  tar -xzf "$PHOTOS" -C /media
else
  echo "No photo archive for $STAMP; photos left as they are."
fi
echo "Done. Start the API again: docker compose start api"
