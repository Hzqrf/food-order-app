"""All SQLAlchemy models. Release 1: 15 tables.

Conventions: BIGINT UNSIGNED ids, created_at/updated_at, money as INT sen, status columns as
VARCHAR(20) validated in the application, every foreign key ON DELETE RESTRICT, times in UTC.
"""
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# BIGINT UNSIGNED on MySQL; plain INTEGER on SQLite so autoincrement works in tests.
BigId = BigInteger().with_variant(mysql.BIGINT(unsigned=True), "mysql").with_variant(Integer, "sqlite")


class UtcDateTime(TypeDecorator):
    """Stores naive UTC (MySQL DATETIME has no zone), always returns aware UTC datetimes."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "mysql":
            return dialect.type_descriptor(mysql.DATETIME(fsp=6))
        return dialect.type_descriptor(DateTime())

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime passed to UtcDateTime")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect):
        return value.replace(tzinfo=UTC) if value is not None else None


def utcnow() -> datetime:
    return datetime.now(UTC)


def fk(target: str, **kw) -> ForeignKey:
    return ForeignKey(target, ondelete="RESTRICT", **kw)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    id: Mapped[int] = mapped_column(BigId, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow, onupdate=utcnow, nullable=False)


# --- People and access ---------------------------------------------------------------------------


class Branch(TimestampMixin, Base):
    __tablename__ = "branches"

    name: Mapped[str] = mapped_column(String(100))
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kuala_Lumpur")
    is_accepting_online_orders: Mapped[bool] = mapped_column(Boolean, default=True)
    # {"mon": [["10:00", "22:00"]], ..., "sun": []}
    opening_hours: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    prep_minutes: Mapped[int] = mapped_column(Integer, default=15)


class User(TimestampMixin, Base):
    """Admin and staff accounts. Deactivated, never deleted."""

    __tablename__ = "users"

    role: Mapped[str] = mapped_column(String(20))  # admin, staff
    username: Mapped[str] = mapped_column(String(50), unique=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    pin_hash: Mapped[str | None] = mapped_column(String(255))
    totp_secret: Mapped[str | None] = mapped_column(String(64))
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    full_name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(20))
    position: Mapped[str | None] = mapped_column(String(50))
    joined_on: Mapped[date | None] = mapped_column(Date)
    left_on: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(UtcDateTime)


class AuthSession(TimestampMixin, Base):
    """A logged-in session. subject_type: user, customer, device (device subject_id = branch id)."""

    __tablename__ = "auth_sessions"
    __table_args__ = (Index("ix_auth_sessions_subject", "subject_type", "subject_id"),)

    subject_type: Mapped[str] = mapped_column(String(20))
    subject_id: Mapped[int] = mapped_column(BigId)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime)
    # Sliding idle timeout in seconds, measured from last_seen_at. NULL = no idle timeout.
    idle_seconds: Mapped[int | None] = mapped_column(Integer)
    # True for PIN unlocks on the shop tablet.
    via_pin: Mapped[bool] = mapped_column(Boolean, default=False)
    revoked_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    last_seen_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utcnow)
    user_agent: Mapped[str | None] = mapped_column(String(255))


# --- Menu ----------------------------------------------------------------------------------------


class MenuCategory(TimestampMixin, Base):
    __tablename__ = "menu_categories"

    name: Mapped[str] = mapped_column(String(100))
    name_ms: Mapped[str | None] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    items: Mapped[list["MenuItem"]] = relationship(back_populates="category")


class MenuItem(TimestampMixin, Base):
    __tablename__ = "menu_items"
    __table_args__ = (
        Index("ix_menu_items_category_sort", "category_id", "sort_order"),
        CheckConstraint("price_sen >= 0", name="ck_menu_items_price"),
    )

    category_id: Mapped[int] = mapped_column(BigId, fk("menu_categories.id"))
    name: Mapped[str] = mapped_column(String(100))
    name_ms: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500))
    description_ms: Mapped[str | None] = mapped_column(String(500))
    price_sen: Mapped[int] = mapped_column(Integer)
    image_path: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_sold_out: Mapped[bool] = mapped_column(Boolean, default=False)

    category: Mapped[MenuCategory] = relationship(back_populates="items")
    group_links: Mapped[list["MenuItemOptionGroup"]] = relationship(
        back_populates="item", order_by="MenuItemOptionGroup.sort_order", cascade="all, delete-orphan"
    )


class OptionGroup(TimestampMixin, Base):
    __tablename__ = "option_groups"
    __table_args__ = (
        CheckConstraint("min_select <= max_select", name="ck_option_groups_min_max"),
        CheckConstraint("min_select >= 0 AND max_select >= 1", name="ck_option_groups_range"),
    )

    name: Mapped[str] = mapped_column(String(100))
    name_ms: Mapped[str | None] = mapped_column(String(100))
    min_select: Mapped[int] = mapped_column(Integer, default=0)
    max_select: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    options: Mapped[list["Option"]] = relationship(back_populates="group", order_by="Option.sort_order")


class Option(TimestampMixin, Base):
    __tablename__ = "options"
    __table_args__ = (Index("ix_options_group_sort", "option_group_id", "sort_order"),)

    option_group_id: Mapped[int] = mapped_column(BigId, fk("option_groups.id"))
    name: Mapped[str] = mapped_column(String(100))
    name_ms: Mapped[str | None] = mapped_column(String(100))
    price_delta_sen: Mapped[int] = mapped_column(Integer, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_sold_out: Mapped[bool] = mapped_column(Boolean, default=False)

    group: Mapped[OptionGroup] = relationship(back_populates="options")


class MenuItemOptionGroup(TimestampMixin, Base):
    __tablename__ = "menu_item_option_groups"
    __table_args__ = (UniqueConstraint("menu_item_id", "option_group_id", name="uq_item_group"),)

    menu_item_id: Mapped[int] = mapped_column(BigId, fk("menu_items.id"))
    option_group_id: Mapped[int] = mapped_column(BigId, fk("option_groups.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    item: Mapped[MenuItem] = relationship(back_populates="group_links")
    group: Mapped[OptionGroup] = relationship()


# --- Orders and payments -------------------------------------------------------------------------


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("branch_id", "business_date", "order_number", name="uq_orders_number"),
        Index("ix_orders_board", "branch_id", "status", "created_at"),
        Index("ix_orders_business_date", "business_date"),
        Index("ix_orders_customer", "customer_id", "created_at"),
        Index("ix_orders_customer_phone", "customer_phone"),
        CheckConstraint("total_sen = subtotal_sen - discount_sen + tax_sen", name="ck_orders_total"),
    )

    branch_id: Mapped[int] = mapped_column(BigId, fk("branches.id"))
    business_date: Mapped[date] = mapped_column(Date)
    order_number: Mapped[int] = mapped_column(Integer)
    # A permanent ID for the order, e.g. "7Q2M9X". The daily number above is for calling out and
    # repeats every day; this one never repeats. Not a secret: the tracking link uses public_token.
    order_code: Mapped[str] = mapped_column(String(12), unique=True)
    public_token: Mapped[str] = mapped_column(String(64), unique=True)
    channel: Mapped[str] = mapped_column(String(20))  # online, counter, phone
    created_by_user_id: Mapped[int | None] = mapped_column(BigId, fk("users.id"))
    customer_id: Mapped[int | None] = mapped_column(BigId)  # FK to customers arrives in Release 2
    customer_name: Mapped[str | None] = mapped_column(String(100))
    customer_phone: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    subtotal_sen: Mapped[int] = mapped_column(Integer)
    discount_sen: Mapped[int] = mapped_column(Integer, default=0)
    tax_sen: Mapped[int] = mapped_column(Integer, default=0)
    total_sen: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(200))
    cancel_reason: Mapped[str | None] = mapped_column(String(200))
    auto_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), unique=True)
    placed_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    ready_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    linked_at: Mapped[datetime | None] = mapped_column(UtcDateTime)

    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", order_by="OrderItem.id")
    events: Mapped[list["OrderStatusEvent"]] = relationship(order_by="OrderStatusEvent.id")
    payments: Mapped[list["Payment"]] = relationship(order_by="Payment.id")
    created_by: Mapped[User | None] = relationship()


class OrderItem(TimestampMixin, Base):
    __tablename__ = "order_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_order_items_quantity"),)

    order_id: Mapped[int] = mapped_column(BigId, fk("orders.id"), index=True)
    menu_item_id: Mapped[int] = mapped_column(BigId, fk("menu_items.id"), index=True)
    item_name: Mapped[str] = mapped_column(String(100))
    unit_price_sen: Mapped[int] = mapped_column(Integer)
    options_total_sen: Mapped[int] = mapped_column(Integer, default=0)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total_sen: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(200))

    order: Mapped[Order] = relationship(back_populates="items")
    options: Mapped[list["OrderItemOption"]] = relationship(order_by="OrderItemOption.id")


class OrderItemOption(TimestampMixin, Base):
    __tablename__ = "order_item_options"

    order_item_id: Mapped[int] = mapped_column(BigId, fk("order_items.id"), index=True)
    option_id: Mapped[int] = mapped_column(BigId, fk("options.id"))
    group_name: Mapped[str] = mapped_column(String(100))
    option_name: Mapped[str] = mapped_column(String(100))
    price_sen: Mapped[int] = mapped_column(Integer)


class OrderStatusEvent(TimestampMixin, Base):
    """Insert only."""

    __tablename__ = "order_status_events"
    __table_args__ = (Index("ix_order_status_events_order", "order_id", "created_at"),)

    order_id: Mapped[int] = mapped_column(BigId, fk("orders.id"))
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    actor_type: Mapped[str] = mapped_column(String(20))  # system, customer, staff, admin
    actor_user_id: Mapped[int | None] = mapped_column(BigId, fk("users.id"))
    note: Mapped[str | None] = mapped_column(String(200))

    actor: Mapped[User | None] = relationship()


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (Index("ix_payments_status_created", "status", "created_at"),)

    order_id: Mapped[int] = mapped_column(BigId, fk("orders.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # charge, refund
    method: Mapped[str] = mapped_column(String(20))  # cash, qr_counter, card_terminal, gateway
    provider: Mapped[str | None] = mapped_column(String(30))
    provider_ref: Mapped[str | None] = mapped_column(String(100), unique=True)
    amount_sen: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))  # pending, succeeded, failed, expired
    paid_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    recorded_by_user_id: Mapped[int | None] = mapped_column(BigId, fk("users.id"))
    refund_of_payment_id: Mapped[int | None] = mapped_column(BigId, fk("payments.id"))
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class OrderCounter(Base):
    """Hands out the short daily order number. The row is locked while numbering."""

    __tablename__ = "order_counters"

    branch_id: Mapped[int] = mapped_column(BigId, fk("branches.id"), primary_key=True)
    business_date: Mapped[date] = mapped_column(Date, primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0)


class AuditLog(TimestampMixin, Base):
    """Insert only."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_entity", "entity_type", "entity_id"),)

    actor_user_id: Mapped[int | None] = mapped_column(BigId, fk("users.id"))
    action: Mapped[str] = mapped_column(String(50))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int | None] = mapped_column(BigId)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    ip: Mapped[str | None] = mapped_column(String(45))


Index("ix_audit_logs_created_at", AuditLog.created_at)
