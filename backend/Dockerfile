# The API for production. Built by deploy/docker-compose.yml; not used in development.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN useradd --system --uid 10001 kaunter && mkdir -p /app/media && chown kaunter /app/media
USER kaunter

EXPOSE 8000
CMD ["sh", "docker/entrypoint.sh"]
