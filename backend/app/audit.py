from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def audit(db: Session, actor_user_id: int | None, action: str, entity_type: str, entity_id: int | None,
          before: dict[str, Any] | None = None, after: dict[str, Any] | None = None,
          ip: str | None = None) -> None:
    db.add(AuditLog(actor_user_id=actor_user_id, action=action, entity_type=entity_type,
                    entity_id=entity_id, before=before, after=after, ip=ip))


def changes(obj: Any, fields: list[str], new_values: dict[str, Any]) -> tuple[dict, dict]:
    """Before/after dicts for only the fields that actually change."""
    before, after = {}, {}
    for f in fields:
        if f in new_values and getattr(obj, f) != new_values[f]:
            before[f], after[f] = getattr(obj, f), new_values[f]
    return before, after
