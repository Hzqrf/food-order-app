"""pay at the counter: the owner's payment options, and orders paid at pickup

Revision ID: b7e1d4c9a2f0
Revises: a4c9e2f7b310
Create Date: 2026-10-22 10:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7e1d4c9a2f0"
down_revision: str | None = "a4c9e2f7b310"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing shops keep working as before: online payment allowed, counter payment off.
    op.add_column("branches", sa.Column("pay_online", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("branches", sa.Column("pay_at_counter", sa.Boolean(), nullable=False, server_default=sa.false()))
    # Set when an online order is placed to be paid at pickup. Never changes afterwards.
    op.add_column("orders", sa.Column("pay_at_counter", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("orders", "pay_at_counter")
    op.drop_column("branches", "pay_at_counter")
    op.drop_column("branches", "pay_online")
