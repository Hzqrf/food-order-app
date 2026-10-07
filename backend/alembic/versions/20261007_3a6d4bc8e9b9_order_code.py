"""order code: a permanent ID for every order

Revision ID: 3a6d4bc8e9b9
Revises: 2500f73ad93b
Create Date: 2026-10-07
"""
import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3a6d4bc8e9b9"
down_revision: str | None = "2500f73ad93b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Same alphabet as app.orders.service.CODE_ALPHABET; copied so the migration never changes with the app.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def upgrade() -> None:
    op.add_column("orders", sa.Column("order_code", sa.String(length=12), nullable=True))
    conn = op.get_bind()
    used: set[str] = set()
    for (order_id,) in conn.execute(sa.text("SELECT id FROM orders")):
        code = ""
        while not code or code in used:
            code = "".join(secrets.choice(ALPHABET) for _ in range(6))
        used.add(code)
        conn.execute(sa.text("UPDATE orders SET order_code = :c WHERE id = :i"), {"c": code, "i": order_id})
    op.alter_column("orders", "order_code", existing_type=sa.String(length=12), nullable=False)
    op.create_unique_constraint("order_code", "orders", ["order_code"])


def downgrade() -> None:
    op.drop_constraint("order_code", "orders", type_="unique")
    op.drop_column("orders", "order_code")
