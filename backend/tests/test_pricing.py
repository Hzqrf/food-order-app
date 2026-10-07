import pytest

from app.orders.pricing import CartLine, MenuGroup, MenuIndex, MenuItem, MenuOption, price_cart

REGULAR, LARGE, CHEESE, SPICY, EXTRA = 1, 2, 3, 4, 5


def make_menu(**overrides) -> MenuIndex:
    options = {
        REGULAR: MenuOption(REGULAR, 10, "Regular", 0, True),
        LARGE: MenuOption(LARGE, 10, "Large", 400, True),
        CHEESE: MenuOption(CHEESE, 20, "Cheese", 200, True),
        SPICY: MenuOption(SPICY, 20, "Spicy Sauce", 100, True),
        EXTRA: MenuOption(EXTRA, 20, "Extra Chicken", 500, True),
    }
    options.update(overrides.get("options", {}))
    groups = {
        10: MenuGroup(10, "Size", 1, 1, (REGULAR, LARGE)),
        20: MenuGroup(20, "Add-ons", 0, 3, (CHEESE, SPICY, EXTRA)),
    }
    items = {
        100: MenuItem(100, "Chicken Tender", 1000, True, False, (10, 20)),
        200: MenuItem(200, "Iced Milo", 450, True, False, ()),
    }
    items.update(overrides.get("items", {}))
    return MenuIndex(items=items, groups=groups, options=options)


def test_design_doc_example_large_cheese_spicy_is_rm17():
    result = price_cart([CartLine(100, 1, (LARGE, CHEESE, SPICY))], make_menu())
    assert result.ok
    line = result.lines[0]
    assert (line.unit_price_sen, line.options_total_sen, line.line_total_sen) == (1000, 700, 1700)
    assert [o.option_name for o in line.options] == ["Large", "Cheese", "Spicy Sauce"]
    assert result.subtotal_sen == 1700


def test_quantity_multiplies_item_and_options():
    result = price_cart([CartLine(100, 3, (LARGE,)), CartLine(200, 2)], make_menu())
    assert [line.line_total_sen for line in result.lines] == [4200, 900]
    assert result.subtotal_sen == 5100


def test_options_snapshot_in_menu_order_not_cart_order():
    result = price_cart([CartLine(100, 1, (SPICY, REGULAR, CHEESE))], make_menu())
    assert [o.option_name for o in result.lines[0].options] == ["Regular", "Cheese", "Spicy Sauce"]


@pytest.mark.parametrize("option_ids,reason", [
    ((), "invalid_options"),  # required size missing
    ((REGULAR, LARGE), "invalid_options"),  # two sizes
    ((REGULAR, CHEESE, CHEESE), "invalid_options"),  # duplicate
    ((REGULAR, 999), "invalid_options"),  # unknown option
])
def test_invalid_option_choices(option_ids, reason):
    result = price_cart([CartLine(100, 1, option_ids)], make_menu())
    assert not result.ok
    assert result.problems[0].reason == reason
    assert result.lines == []


def test_too_many_addons():
    menu = make_menu()
    menu.groups[20] = MenuGroup(20, "Add-ons", 0, 2, (CHEESE, SPICY, EXTRA))
    result = price_cart([CartLine(100, 1, (REGULAR, CHEESE, SPICY, EXTRA))], menu)
    assert result.problems[0].reason == "invalid_options"
    assert result.problems[0].option_group_id == 20


def test_option_from_group_not_on_item_is_invalid():
    result = price_cart([CartLine(200, 1, (CHEESE,))], make_menu())
    assert result.problems[0].reason == "invalid_options"


def test_sold_out_item_and_option():
    menu = make_menu(items={100: MenuItem(100, "Chicken Tender", 1000, True, True, (10, 20))})
    assert price_cart([CartLine(100, 1, (REGULAR,))], menu).problems[0].reason == "sold_out"

    menu = make_menu(options={CHEESE: MenuOption(CHEESE, 20, "Cheese", 200, False)})
    problem = price_cart([CartLine(100, 1, (REGULAR, CHEESE))], menu).problems[0]
    assert (problem.reason, problem.option_id) == ("option_sold_out", CHEESE)


def test_required_group_with_nothing_left_makes_item_sold_out():
    menu = make_menu(options={REGULAR: MenuOption(REGULAR, 10, "Regular", 0, False),
                              LARGE: MenuOption(LARGE, 10, "Large", 400, False)})
    assert price_cart([CartLine(100, 1, ())], menu).problems[0].reason == "sold_out"


def test_inactive_or_missing_item_is_unavailable():
    menu = make_menu(items={200: MenuItem(200, "Iced Milo", 450, False, False, ())})
    assert price_cart([CartLine(200, 1)], menu).problems[0].reason == "unavailable"
    assert price_cart([CartLine(404, 1)], make_menu()).problems[0].reason == "unavailable"


def test_problems_reported_per_line_and_good_lines_still_priced():
    menu = make_menu(items={200: MenuItem(200, "Iced Milo", 450, True, True, ())})
    result = price_cart([CartLine(100, 1, (REGULAR,)), CartLine(200, 1)], menu)
    assert [p.line for p in result.problems] == [1]
    assert len(result.lines) == 1


def test_zero_quantity_rejected():
    with pytest.raises(ValueError):
        price_cart([CartLine(200, 0)], make_menu())
