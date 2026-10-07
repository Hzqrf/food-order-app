import io
import secrets
import threading
import time
from typing import Any

from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.audit import audit, changes
from app.config import get_settings
from app.errors import AppError, not_found
from app.menu import schemas
from app.models import MenuCategory, MenuItem, MenuItemOptionGroup, Option, OptionGroup, User

MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_SIZES = {"sm": 400, "lg": 1200}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

# --- Public menu, cached for 30 s and dropped on every menu change -------------------------------

_CACHE_TTL = 30.0
_cache: dict[str, Any] = {}
_cache_lock = threading.Lock()


def invalidate_menu_cache() -> None:
    with _cache_lock:
        _cache.clear()


def image_urls(image_path: str | None) -> tuple[str | None, str | None]:
    if not image_path:
        return None, None
    base = f"{get_settings().media_url}/menu/{image_path}"
    return f"{base}-sm.webp", f"{base}-lg.webp"


def group_unavailable(group: OptionGroup) -> bool:
    """A required group with fewer available options than it requires makes the item unorderable."""
    available = [o for o in group.options if o.is_active and not o.is_sold_out]
    return group.min_select > 0 and len(available) < group.min_select


def public_menu(db: Session) -> schemas.MenuOut:
    with _cache_lock:
        if _cache.get("expires", 0) > time.monotonic():
            return _cache["menu"]
    menu = _build_public_menu(db)
    with _cache_lock:
        _cache.update(menu=menu, expires=time.monotonic() + _CACHE_TTL)
    return menu


def _build_public_menu(db: Session) -> schemas.MenuOut:
    categories = db.scalars(
        select(MenuCategory).where(MenuCategory.is_active.is_(True))
        .order_by(MenuCategory.sort_order, MenuCategory.id)
    ).all()
    items = db.scalars(
        select(MenuItem).where(MenuItem.is_active.is_(True))
        .options(selectinload(MenuItem.group_links).selectinload(MenuItemOptionGroup.group)
                 .selectinload(OptionGroup.options))
        .order_by(MenuItem.sort_order, MenuItem.id)
    ).all()
    by_category: dict[int, list[schemas.MenuItemOut]] = {}
    for item in items:
        groups, blocked = [], False
        for link in item.group_links:
            g = link.group
            if not g.is_active:
                continue
            blocked = blocked or group_unavailable(g)
            groups.append(schemas.MenuGroupOut(
                id=g.id, name=g.name, name_ms=g.name_ms, min_select=g.min_select, max_select=g.max_select,
                options=[schemas.MenuOptionOut(id=o.id, name=o.name, name_ms=o.name_ms,
                                               price_delta_sen=o.price_delta_sen, is_sold_out=o.is_sold_out)
                         for o in g.options if o.is_active],
            ))
        small, large = image_urls(item.image_path)
        by_category.setdefault(item.category_id, []).append(schemas.MenuItemOut(
            id=item.id, category_id=item.category_id, name=item.name, name_ms=item.name_ms,
            description=item.description, description_ms=item.description_ms, price_sen=item.price_sen,
            image_url=small, image_url_large=large, is_sold_out=item.is_sold_out or blocked,
            item_sold_out=item.is_sold_out, groups=groups,
        ))
    # A category with no active items is hidden automatically.
    return schemas.MenuOut(categories=[
        schemas.MenuCategoryOut(id=c.id, name=c.name, name_ms=c.name_ms, items=by_category[c.id])
        for c in categories if by_category.get(c.id)
    ])


# --- Sold-out switches (staff and admin) ---------------------------------------------------------


def set_item_sold_out(db: Session, item_id: int, sold_out: bool) -> None:
    item = db.get(MenuItem, item_id)
    if item is None or not item.is_active:
        raise not_found("Item not found.")
    item.is_sold_out = sold_out
    invalidate_menu_cache()


def set_option_sold_out(db: Session, option_id: int, sold_out: bool) -> None:
    option = db.get(Option, option_id)
    if option is None or not option.is_active:
        raise not_found("Option not found.")
    option.is_sold_out = sold_out
    invalidate_menu_cache()


# --- Admin ---------------------------------------------------------------------------------------


def admin_menu(db: Session) -> schemas.AdminMenuOut:
    categories = db.scalars(select(MenuCategory).order_by(MenuCategory.sort_order, MenuCategory.id)).all()
    items = db.scalars(select(MenuItem).options(selectinload(MenuItem.group_links))
                       .order_by(MenuItem.sort_order, MenuItem.id)).all()
    groups = db.scalars(select(OptionGroup).options(selectinload(OptionGroup.options))
                        .order_by(OptionGroup.name)).all()
    return schemas.AdminMenuOut(
        categories=[schemas.AdminCategory.model_validate(c, from_attributes=True) for c in categories],
        items=[_admin_item(i) for i in items],
        option_groups=[schemas.AdminOptionGroup(
            id=g.id, name=g.name, name_ms=g.name_ms, min_select=g.min_select, max_select=g.max_select,
            is_active=g.is_active,
            options=[schemas.AdminOption.model_validate(o, from_attributes=True) for o in g.options],
        ) for g in groups],
    )


def _admin_item(item: MenuItem) -> schemas.AdminItem:
    return schemas.AdminItem(
        id=item.id, category_id=item.category_id, name=item.name, name_ms=item.name_ms,
        description=item.description, description_ms=item.description_ms, price_sen=item.price_sen,
        image_url=image_urls(item.image_path)[0], sort_order=item.sort_order, is_active=item.is_active,
        is_sold_out=item.is_sold_out, option_group_ids=[link.option_group_id for link in item.group_links],
    )


def _next_sort(db: Session, column, *where) -> int:
    current = db.scalar(select(column).where(*where).order_by(column.desc()).limit(1))
    return (current or 0) + 10


def _apply(obj: Any, values: dict[str, Any]) -> None:
    for k, v in values.items():
        setattr(obj, k, v)


def create_category(db: Session, body: schemas.CategoryIn) -> MenuCategory:
    cat = MenuCategory(**body.model_dump(), sort_order=_next_sort(db, MenuCategory.sort_order))
    db.add(cat)
    db.flush()
    invalidate_menu_cache()
    return cat


def update_category(db: Session, admin: User, cat_id: int, body: schemas.CategoryPatch, ip: str) -> MenuCategory:
    cat = db.get(MenuCategory, cat_id) or _raise(not_found("Category not found."))
    values = body.model_dump(exclude_unset=True)
    before, after = changes(cat, ["is_active"], values)
    _apply(cat, values)
    if after:
        audit(db, admin.id, "category_active_changed", "menu_category", cat.id, before, after, ip)
    invalidate_menu_cache()
    return cat


def create_item(db: Session, admin: User, body: schemas.ItemIn, ip: str) -> schemas.AdminItem:
    if db.get(MenuCategory, body.category_id) is None:
        raise AppError("invalid_category", "Category not found.", 422)
    item = MenuItem(**body.model_dump(),
                    sort_order=_next_sort(db, MenuItem.sort_order, MenuItem.category_id == body.category_id))
    db.add(item)
    db.flush()
    audit(db, admin.id, "menu_item_created", "menu_item", item.id, None,
          {"name": item.name, "price_sen": item.price_sen}, ip)
    invalidate_menu_cache()
    db.refresh(item, ["group_links"])
    return _admin_item(item)


def update_item(db: Session, admin: User, item_id: int, body: schemas.ItemPatch, ip: str) -> schemas.AdminItem:
    item = db.get(MenuItem, item_id) or _raise(not_found("Item not found."))
    values = body.model_dump(exclude_unset=True)
    if "category_id" in values and db.get(MenuCategory, values["category_id"]) is None:
        raise AppError("invalid_category", "Category not found.", 422)
    before, after = changes(item, ["price_sen", "is_active"], values)
    _apply(item, values)
    if after:
        audit(db, admin.id, "menu_item_changed", "menu_item", item.id, before, after, ip)
    invalidate_menu_cache()
    return _admin_item(item)


def deactivate_item(db: Session, admin: User, item_id: int, ip: str) -> None:
    update_item(db, admin, item_id, schemas.ItemPatch(is_active=False), ip)


def set_item_groups(db: Session, item_id: int, body: schemas.ItemGroupsIn) -> schemas.AdminItem:
    item = db.get(MenuItem, item_id) or _raise(not_found("Item not found."))
    ids = list(dict.fromkeys(body.option_group_ids))
    found = set(db.scalars(select(OptionGroup.id).where(OptionGroup.id.in_(ids)))) if ids else set()
    if missing := [i for i in ids if i not in found]:
        raise AppError("invalid_option_group", f"Option group {missing[0]} not found.", 422)
    existing = {link.option_group_id: link for link in item.group_links}
    item.group_links = [existing.get(gid) or MenuItemOptionGroup(option_group_id=gid) for gid in ids]
    for pos, link in enumerate(item.group_links):
        link.sort_order = pos * 10
    db.flush()
    invalidate_menu_cache()
    return _admin_item(item)


def create_group(db: Session, body: schemas.OptionGroupIn) -> OptionGroup:
    group = OptionGroup(**body.model_dump())
    db.add(group)
    db.flush()
    invalidate_menu_cache()
    return group


def update_group(db: Session, admin: User, group_id: int, body: schemas.OptionGroupPatch, ip: str) -> OptionGroup:
    group = db.get(OptionGroup, group_id) or _raise(not_found("Option group not found."))
    values = body.model_dump(exclude_unset=True)
    lo = values.get("min_select", group.min_select)
    hi = values.get("max_select", group.max_select)
    if lo > hi:
        raise AppError("validation_error", "Minimum cannot be more than maximum.", 422)
    before, after = changes(group, ["is_active"], values)
    _apply(group, values)
    if after:
        audit(db, admin.id, "option_group_active_changed", "option_group", group.id, before, after, ip)
    invalidate_menu_cache()
    return group


def create_option(db: Session, admin: User, body: schemas.OptionIn, ip: str) -> Option:
    if db.get(OptionGroup, body.option_group_id) is None:
        raise AppError("invalid_option_group", "Option group not found.", 422)
    option = Option(**body.model_dump(), sort_order=_next_sort(
        db, Option.sort_order, Option.option_group_id == body.option_group_id))
    db.add(option)
    db.flush()
    audit(db, admin.id, "option_created", "option", option.id, None,
          {"name": option.name, "price_delta_sen": option.price_delta_sen}, ip)
    invalidate_menu_cache()
    return option


def update_option(db: Session, admin: User, option_id: int, body: schemas.OptionPatch, ip: str) -> Option:
    option = db.get(Option, option_id) or _raise(not_found("Option not found."))
    values = body.model_dump(exclude_unset=True)
    before, after = changes(option, ["price_delta_sen", "is_active"], values)
    _apply(option, values)
    if after:
        audit(db, admin.id, "option_changed", "option", option.id, before, after, ip)
    invalidate_menu_cache()
    return option


def sort(db: Session, body: schemas.SortIn) -> None:
    model = {"categories": MenuCategory, "items": MenuItem, "options": Option}[body.entity]
    rows = {r.id: r for r in db.scalars(select(model).where(model.id.in_(body.ids)))}
    for pos, row_id in enumerate(body.ids):
        if row_id in rows:
            rows[row_id].sort_order = (pos + 1) * 10
    invalidate_menu_cache()


def save_item_image(db: Session, item_id: int, data: bytes) -> schemas.AdminItem:
    item = db.get(MenuItem, item_id) or _raise(not_found("Item not found."))
    if len(data) > MAX_IMAGE_BYTES:
        raise AppError("image_too_large", "Images must be 5 MB or smaller.", 422)
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            probe.verify()
        if fmt not in ALLOWED_FORMATS:
            raise AppError("invalid_image", "Upload a JPEG, PNG or WebP image.", 422)
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise AppError("invalid_image", "That file is not a readable image.", 422) from None
    img = img.convert("RGB")
    name = secrets.token_hex(16)
    folder = get_settings().media_dir / "menu"
    folder.mkdir(parents=True, exist_ok=True)
    for suffix, size in IMAGE_SIZES.items():
        copy = img.copy()
        copy.thumbnail((size, size))
        copy.save(folder / f"{name}-{suffix}.webp", "WEBP", quality=82)
    item.image_path = name
    invalidate_menu_cache()
    return _admin_item(item)


def _raise(err: Exception):
    raise err
