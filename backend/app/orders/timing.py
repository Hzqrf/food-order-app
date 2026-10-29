"""When an order is due and when the kitchen should start it. Pure: no database, no clock."""
from datetime import datetime, timedelta

SLOT_MINUTES = 15


def due_at(order, prep_minutes: int) -> datetime | None:
    """When the customer expects the food: the chosen pickup time, or placed + prep."""
    if order.pickup_at is not None:
        return order.pickup_at
    return order.placed_at + timedelta(minutes=prep_minutes) if order.placed_at else None


def start_at(order, prep_minutes: int) -> datetime | None:
    """When the kitchen should start a pre-order. None for as-soon-as-possible orders."""
    return order.pickup_at - timedelta(minutes=prep_minutes) if order.pickup_at is not None else None


def is_later(order, prep_minutes: int, now: datetime) -> bool:
    """A pre-order waiting for its start time: shown in Later today, not yet in New."""
    start = start_at(order, prep_minutes)
    return order.status == "placed" and start is not None and now < start
