#!/bin/sh
# Bring the database up to date, then serve. One worker only: the timed jobs (payments check,
# day close) run inside the API process, and a second worker would run each of them twice.
set -e
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --no-access-log
