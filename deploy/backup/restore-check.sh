#!/bin/bash
# Proves a dump restores: loads it into a scratch database and compares it with the live one.
#   restore-check.sh <dump.sql.gz> [start-time]
# start-time (UTC, from just before the dump) lets it check that every order and payment created
# before then is in the copy. Prints a one-line summary; exits non-zero on any difference.
set -euo pipefail

DUMP=$1
START=${2:-}
DB_HOST=${DB_HOST:-mysql}
SCRATCH=kaunter_restore_check
q() { mysql -h "$DB_HOST" -uroot -N -B "$@"; }

cleanup() { q -e "DROP DATABASE IF EXISTS $SCRATCH" || true; }
trap cleanup EXIT

cleanup
q -e "CREATE DATABASE $SCRATCH CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
# The dump names its database (--databases), so point it at the scratch one instead.
gunzip -c "$DUMP" \
  | sed -e 's/^CREATE DATABASE .*`kaunter`.*;$//' -e "s/^USE \`kaunter\`;$/USE \`$SCRATCH\`;/" \
  | q "$SCRATCH"

tables() { q -e "SELECT table_name FROM information_schema.tables WHERE table_schema = '$1' ORDER BY 1"; }
if [ "$(tables kaunter)" != "$(tables $SCRATCH)" ]; then
  echo "the copy does not have the same tables"
  exit 1
fi

live_version=$(q kaunter -e "SELECT version_num FROM alembic_version")
copy_version=$(q $SCRATCH -e "SELECT version_num FROM alembic_version")
if [ "$live_version" != "$copy_version" ]; then
  echo "schema version differs: live $live_version, copy $copy_version"
  exit 1
fi

before=""
[ -n "$START" ] && before="WHERE created_at < '$START'"
summary=""
for table in orders payments; do
  live=$(q kaunter -e "SELECT COUNT(*) FROM $table $before")
  copy=$(q $SCRATCH -e "SELECT COUNT(*) FROM $table $before")
  if [ "$live" != "$copy" ]; then
    echo "$table: live $live, copy $copy"
    exit 1
  fi
  summary="$summary$table $copy, "
done
items=$(q $SCRATCH -e "SELECT COUNT(*) FROM menu_items")
echo "restore checked (${summary}menu items $items)"
