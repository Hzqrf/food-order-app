"""Cart in, priced lines and total out. Pure: no database, no clock.

Used by the quote endpoint, online orders and counter orders, so the price a customer sees and
the price an order is saved with always come from the same code.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class MenuOption:
    id: int
    group_id: int
    name: str
    price_delta_sen: int
    available: bool  # active and not sold out


@dataclass(frozen=True)
class MenuGroup:
    id: int
    name: str
    min_select: int
    max_select: int
    option_ids: tuple[int, ...]  # active options, in display order


@dataclass(frozen=True)
class MenuItem:
    id: int
    name: str
    price_sen: int
    active: bool  # item and its category are active
    sold_out: bool
    group_ids: tuple[int, ...]  # active groups attached to the item


@dataclass(frozen=True)
class MenuIndex:
    items: dict[int, MenuItem]
    groups: dict[int, MenuGroup]
    options: dict[int, MenuOption]


@dataclass(frozen=True)
class CartLine:
    menu_item_id: int
    quantity: int
    option_ids: tuple[int, ...] = ()
    note: str | None = None


@dataclass(frozen=True)
class PricedOption:
    option_id: int
    group_name: str
    option_name: str
    price_sen: int


@dataclass(frozen=True)
class PricedLine:
    menu_item_id: int
    item_name: str
    unit_price_sen: int
    options_total_sen: int
    quantity: int
    line_total_sen: int
    note: str | None
    options: tuple[PricedOption, ...]


@dataclass(frozen=True)
class Problem:
    line: int  # index into the cart
    reason: str  # unavailable, sold_out, option_sold_out, invalid_options
    menu_item_id: int
    option_id: int | None = None
    option_group_id: int | None = None

    def as_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class PriceResult:
    lines: list[PricedLine] = field(default_factory=list)
    problems: list[Problem] = field(default_factory=list)

    @property
    def subtotal_sen(self) -> int:
        return sum(line.line_total_sen for line in self.lines)

    @property
    def ok(self) -> bool:
        return not self.problems


def _price_line(index: int, line: CartLine, menu: MenuIndex) -> PricedLine | list[Problem]:
    item = menu.items.get(line.menu_item_id)
    if item is None or not item.active:
        return [Problem(index, "unavailable", line.menu_item_id)]
    if item.sold_out:
        return [Problem(index, "sold_out", line.menu_item_id)]

    problems: list[Problem] = []
    if len(set(line.option_ids)) != len(line.option_ids):
        problems.append(Problem(index, "invalid_options", item.id))

    chosen_by_group: dict[int, list[MenuOption]] = {gid: [] for gid in item.group_ids}
    for oid in dict.fromkeys(line.option_ids):
        option = menu.options.get(oid)
        if option is None or option.group_id not in chosen_by_group:
            problems.append(Problem(index, "invalid_options", item.id, option_id=oid))
        elif not option.available:
            problems.append(Problem(index, "option_sold_out", item.id, option_id=oid))
        else:
            chosen_by_group[option.group_id].append(option)

    priced_options: list[PricedOption] = []
    for gid in item.group_ids:
        group = menu.groups[gid]
        available = [o for o in group.option_ids if menu.options[o].available]
        if len(available) < group.min_select:
            # A required choice has nothing left, so the item cannot be made today.
            return [Problem(index, "sold_out", item.id)]
        chosen = chosen_by_group[gid]
        if not problems and not (group.min_select <= len(chosen) <= group.max_select):
            problems.append(Problem(index, "invalid_options", item.id, option_group_id=gid))
        # Keep the menu's display order for snapshots and receipts.
        order = {oid: pos for pos, oid in enumerate(group.option_ids)}
        for option in sorted(chosen, key=lambda o: order.get(o.id, 0)):
            priced_options.append(PricedOption(option.id, group.name, option.name, option.price_delta_sen))

    if problems:
        return problems
    options_total = sum(o.price_sen for o in priced_options)
    return PricedLine(
        menu_item_id=item.id, item_name=item.name, unit_price_sen=item.price_sen,
        options_total_sen=options_total, quantity=line.quantity,
        line_total_sen=(item.price_sen + options_total) * line.quantity,
        note=line.note, options=tuple(priced_options),
    )


def price_cart(cart: list[CartLine], menu: MenuIndex) -> PriceResult:
    result = PriceResult()
    for index, line in enumerate(cart):
        if line.quantity <= 0:
            raise ValueError("quantity must be positive")
        priced = _price_line(index, line, menu)
        if isinstance(priced, PricedLine):
            result.lines.append(priced)
        else:
            result.problems.extend(priced)
    return result
