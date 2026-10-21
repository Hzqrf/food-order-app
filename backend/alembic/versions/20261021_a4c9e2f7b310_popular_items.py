"""owner's Popular switch on menu items

Revision ID: a4c9e2f7b310
Revises: 7d2b4e9a1c55
Create Date: 2026-10-21 18:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a4c9e2f7b310"
down_revision: str | None = "7d2b4e9a1c55"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Owner picks. When none are set, the public menu falls back to the best sellers.
    op.add_column("menu_items", sa.Column("is_popular", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("menu_items", "is_popular")
