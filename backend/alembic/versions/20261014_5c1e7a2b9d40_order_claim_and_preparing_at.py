"""order claim and preparing_at

Revision ID: 5c1e7a2b9d40
Revises: 9423d9f40623
Create Date: 2026-10-14 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql
from sqlalchemy.engine import Connection

revision: str = "5c1e7a2b9d40"
down_revision: str | None = "9423d9f40623"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_DATETIME = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")
_ID = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), "mysql").with_variant(sa.Integer(), "sqlite")


def backfill_preparing_at(bind: Connection) -> None:
    """Orders that were cooked before this column existed: take the first move into 'preparing'."""
    bind.execute(sa.text(
        "UPDATE orders o JOIN (SELECT order_id, MIN(created_at) AS first_at FROM order_status_events "
        "WHERE to_status = 'preparing' GROUP BY order_id) e ON e.order_id = o.id "
        "SET o.preparing_at = e.first_at WHERE o.preparing_at IS NULL"
    ))


def upgrade() -> None:
    op.add_column("orders", sa.Column("preparing_at", _DATETIME, nullable=True))
    op.add_column("orders", sa.Column("claimed_by_user_id", _ID, nullable=True))
    op.add_column("orders", sa.Column("claimed_at", _DATETIME, nullable=True))
    op.create_foreign_key("fk_orders_claimed_by_user_id_users", "orders", "users", ["claimed_by_user_id"], ["id"],
                          ondelete="RESTRICT")
    backfill_preparing_at(op.get_bind())


def downgrade() -> None:
    op.drop_constraint("fk_orders_claimed_by_user_id_users", "orders", type_="foreignkey")
    op.drop_column("orders", "claimed_at")
    op.drop_column("orders", "claimed_by_user_id")
    op.drop_column("orders", "preparing_at")
