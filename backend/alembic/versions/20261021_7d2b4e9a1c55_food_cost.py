"""food cost on menu items and options, saved on order lines

Revision ID: 7d2b4e9a1c55
Revises: 5c1e7a2b9d40
Create Date: 2026-10-21 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7d2b4e9a1c55"
down_revision: str | None = "5c1e7a2b9d40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # NULL means "cost not set yet", which is not the same as free.
    op.add_column("menu_items", sa.Column("cost_sen", sa.Integer(), nullable=True))
    op.add_column("options", sa.Column("cost_delta_sen", sa.Integer(), nullable=False, server_default="0"))
    # Saved at sale time, like the price, so editing a cost later never changes past profit.
    op.add_column("order_items", sa.Column("unit_cost_sen", sa.Integer(), nullable=True))
    op.create_check_constraint("ck_menu_items_cost", "menu_items", "cost_sen IS NULL OR cost_sen >= 0")
    op.create_check_constraint("ck_options_cost", "options", "cost_delta_sen >= 0")


def downgrade() -> None:
    op.drop_constraint("ck_options_cost", "options", type_="check")
    op.drop_constraint("ck_menu_items_cost", "menu_items", type_="check")
    op.drop_column("order_items", "unit_cost_sen")
    op.drop_column("options", "cost_delta_sen")
    op.drop_column("menu_items", "cost_sen")
