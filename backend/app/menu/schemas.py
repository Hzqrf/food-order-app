from typing import Literal

from pydantic import BaseModel, Field, model_validator

Name = Field(min_length=1, max_length=100)
OptName = Field(default=None, max_length=100)


# --- Public menu ---------------------------------------------------------------------------------


class MenuOptionOut(BaseModel):
    id: int
    name: str
    name_ms: str | None
    price_delta_sen: int
    is_sold_out: bool


class MenuGroupOut(BaseModel):
    id: int
    name: str
    name_ms: str | None
    min_select: int
    max_select: int
    options: list[MenuOptionOut]


class MenuItemOut(BaseModel):
    id: int
    category_id: int
    name: str
    name_ms: str | None
    description: str | None
    description_ms: str | None
    price_sen: int
    image_url: str | None
    image_url_large: str | None
    # True when the item is sold out, or a required option group has nothing left to choose.
    is_sold_out: bool
    # The item's own sold-out switch, without the option-group effect. Drives the staff switch.
    item_sold_out: bool
    groups: list[MenuGroupOut]


class MenuCategoryOut(BaseModel):
    id: int
    name: str
    name_ms: str | None
    items: list[MenuItemOut]


class MenuOut(BaseModel):
    categories: list[MenuCategoryOut]


class SoldOutIn(BaseModel):
    is_sold_out: bool


# --- Admin ---------------------------------------------------------------------------------------


class CategoryIn(BaseModel):
    name: str = Name
    name_ms: str | None = OptName
    is_active: bool = True


class CategoryPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    name_ms: str | None = OptName
    is_active: bool | None = None


class ItemIn(BaseModel):
    category_id: int
    name: str = Name
    name_ms: str | None = OptName
    description: str | None = Field(default=None, max_length=500)
    description_ms: str | None = Field(default=None, max_length=500)
    price_sen: int = Field(ge=0, le=10_000_00)
    is_active: bool = True


class ItemPatch(BaseModel):
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=100)
    name_ms: str | None = OptName
    description: str | None = Field(default=None, max_length=500)
    description_ms: str | None = Field(default=None, max_length=500)
    price_sen: int | None = Field(default=None, ge=0, le=10_000_00)
    is_active: bool | None = None
    is_sold_out: bool | None = None


class OptionGroupIn(BaseModel):
    name: str = Name
    name_ms: str | None = OptName
    min_select: int = Field(default=0, ge=0, le=20)
    max_select: int = Field(default=1, ge=1, le=20)
    is_active: bool = True

    @model_validator(mode="after")
    def _range(self):
        if self.min_select > self.max_select:
            raise ValueError("min_select cannot be more than max_select")
        return self


class OptionGroupPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    name_ms: str | None = OptName
    min_select: int | None = Field(default=None, ge=0, le=20)
    max_select: int | None = Field(default=None, ge=1, le=20)
    is_active: bool | None = None


class OptionIn(BaseModel):
    option_group_id: int
    name: str = Name
    name_ms: str | None = OptName
    price_delta_sen: int = Field(default=0, ge=0, le=1_000_00)
    is_active: bool = True


class OptionPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    name_ms: str | None = OptName
    price_delta_sen: int | None = Field(default=None, ge=0, le=1_000_00)
    is_active: bool | None = None
    is_sold_out: bool | None = None


class ItemGroupsIn(BaseModel):
    """The option groups attached to an item, in display order."""

    option_group_ids: list[int] = Field(max_length=20)


class SortIn(BaseModel):
    entity: Literal["categories", "items", "options"]
    ids: list[int] = Field(min_length=1, max_length=500)


class AdminCategory(BaseModel):
    id: int
    name: str
    name_ms: str | None
    sort_order: int
    is_active: bool


class AdminItem(BaseModel):
    id: int
    category_id: int
    name: str
    name_ms: str | None
    description: str | None
    description_ms: str | None
    price_sen: int
    image_url: str | None
    sort_order: int
    is_active: bool
    is_sold_out: bool
    option_group_ids: list[int]


class AdminOption(BaseModel):
    id: int
    option_group_id: int
    name: str
    name_ms: str | None
    price_delta_sen: int
    sort_order: int
    is_active: bool
    is_sold_out: bool


class AdminOptionGroup(BaseModel):
    id: int
    name: str
    name_ms: str | None
    min_select: int
    max_select: int
    is_active: bool
    options: list[AdminOption]


class AdminMenuOut(BaseModel):
    categories: list[AdminCategory]
    items: list[AdminItem]
    option_groups: list[AdminOptionGroup]
