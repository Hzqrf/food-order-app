import logging

from sqlalchemy import create_engine

from alembic import context
from app.config import get_settings
from app.models import Base, UtcDateTime

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logging.getLogger("sqlalchemy").setLevel(logging.WARNING)

target_metadata = Base.metadata


def render_item(type_, obj, autogen_context):
    """Render UtcDateTime as plain SQL types so migrations never import application code."""
    if type_ == "type" and isinstance(obj, UtcDateTime):
        autogen_context.imports.add("from sqlalchemy.dialects import mysql")
        return "sa.DateTime().with_variant(mysql.DATETIME(fsp=6), 'mysql')"
    return False


def run_migrations_offline() -> None:
    context.configure(url=get_settings().database_url, target_metadata=target_metadata,
                      literal_binds=True, compare_type=True, render_item=render_item)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = context.config.attributes.get("database_url") or get_settings().database_url
    engine = create_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True,
                          render_item=render_item)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
