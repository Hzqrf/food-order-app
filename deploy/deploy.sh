#!/usr/bin/env bash
# Deploy one tested commit of main. The CI deploy key may run only this script (see deploy/CICD.md);
# the commit comes from the SSH command line. Run by hand: deploy/deploy.sh [commit]
set -euo pipefail

sha="${SSH_ORIGINAL_COMMAND:-${1:-}}"
if [ -n "$sha" ] && ! [[ "$sha" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Refusing: '$sha' is not a commit hash." >&2
  exit 2
fi

cd "$(dirname "$(readlink -f "$0")")/.."
git fetch --quiet origin main
target="${sha:-origin/main}"
# Fast-forward only: a commit that isn't on main, or local edits on the server, stop the deploy.
git merge-base --is-ancestor "$target" origin/main || { echo "Refusing: $target is not on main." >&2; exit 2; }
git merge --ff-only --quiet "$target"
echo "Code at $(git rev-parse --short HEAD)"

cd deploy
docker compose up -d --build --remove-orphans

# The API runs the database migrations as it starts; wait for its health check (up to 3 minutes).
api=$(docker compose ps -q api)
status=starting
for _ in $(seq 1 36); do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$api")
  [ "$status" = healthy ] && break
  sleep 5
done
if [ "$status" != healthy ]; then
  echo "API is $status after 3 minutes. Last log lines:" >&2
  docker compose logs --tail 60 api >&2
  exit 1
fi

domain=$(grep -E '^DOMAIN=' .env | cut -d= -f2- | tr -d '"')
curl -fsS --max-time 15 "https://$domain/api/v1/health" > /dev/null
docker image prune -f > /dev/null
echo "Deployed $(git rev-parse --short HEAD) to https://$domain"
