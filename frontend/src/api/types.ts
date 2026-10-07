import type { components } from "./schema";

type S = components["schemas"];

export type SessionOut = S["SessionOut"];
export type ShopOut = S["ShopOut"];
export type MenuOut = S["MenuOut"];
export type MenuCategory = S["MenuCategoryOut"];
export type MenuItem = S["MenuItemOut"];
export type MenuGroup = S["MenuGroupOut"];
export type MenuOption = S["MenuOptionOut"];
export type CartLineIn = S["CartLineIn"];
export type QuoteOut = S["QuoteOut"];
export type OnlineOrderIn = S["OnlineOrderIn"];
export type OnlineOrderOut = S["OnlineOrderOut"];
export type TrackingOut = S["TrackingOut"];
export type CounterOrderIn = S["CounterOrderIn"];
export type CounterOrderOut = S["CounterOrderOut"];
export type OrderSummary = S["OrderSummary"];
export type OrderDetail = S["OrderDetail"];
export type CancelIn = S["CancelIn"];
export type DeviceStaff = S["DeviceStaff"];
export type AdminMenu = S["AdminMenuOut"];
export type AdminItem = S["AdminItem"];
export type AdminCategory = S["AdminCategory"];
export type AdminOptionGroup = S["AdminOptionGroup"];
export type AdminOption = S["AdminOption"];
export type ItemIn = S["ItemIn"];
export type ItemPatch = S["ItemPatch"];
export type OptionGroupIn = S["OptionGroupIn"];
export type OptionIn = S["OptionIn"];
export type StaffOut = S["StaffOut"];
export type StaffIn = S["StaffIn"];
export type SettingsPatch = S["SettingsPatch"];
export type TotpSetupOut = S["TotpSetupOut"];

export type OrderStatus = "pending_payment" | "placed" | "preparing" | "ready" | "completed" | "cancelled";
export type PaymentMethod = CounterOrderIn["payment"]["method"];
