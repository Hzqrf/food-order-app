"""pre-orders: a pickup time later today, and the owner's switch and slot limit

Revision ID: c3a8f1e6d204
Revises: b7e1d4c9a2f0
Create Date: 2026-10-29 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3a8f1e6d204"
down_revision: str | None = "b7e1d4c9a2f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("branches", sa.Column("preorders_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("branches", sa.Column("preorder_slot_limit", sa.Integer(), nullable=False, server_default="5"))
    op.create_check_constraint("ck_branches_preorder_slot_limit", "branches", "preorder_slot_limit >= 1")
    # The chosen pickup time, in UTC. NULL for as-soon-as-possible and counter orders.
    op.add_column("orders", sa.Column("pickup_at", sa.DateTime(), nullable=True))
    op.create_index("ix_orders_branch_pickup", "orders", ["branch_id", "pickup_at"])


def downgrade() -> None:
    op.drop_index("ix_orders_branch_pickup", table_name="orders")
    op.drop_column("orders", "pickup_at")
    op.drop_constraint("ck_branches_preorder_slot_limit", "branches", type_="check")
    op.drop_column("branches", "preorder_slot_limit")
    op.drop_column("branches", "preorders_enabled")
