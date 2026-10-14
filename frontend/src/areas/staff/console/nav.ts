import {
  IconChartBar,
  IconClipboardList,
  IconGauge,
  IconHistory,
  IconPlus,
  IconReceipt,
  IconSearch,
  IconSettings,
  IconToolsKitchen2,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";

export type NavItem = {
  to: string;
  label: string;
  icon: Icon;
  section: "operations" | "management";
  end?: boolean;
  badge?: "openOrders";
};

// One list feeds the full sidebar, the icon rail and the phone drawer.
export const NAV: NavItem[] = [
  { to: "/staff", label: "console.nav.queue", icon: IconClipboardList, section: "operations", end: true, badge: "openOrders" },
  { to: "/staff/take", label: "console.nav.addOrder", icon: IconPlus, section: "operations" },
  { to: "/staff/search", label: "console.nav.search", icon: IconSearch, section: "operations" },
  { to: "/staff/menu", label: "console.nav.menu", icon: IconToolsKitchen2, section: "operations" },
  { to: "/staff/dashboard", label: "console.nav.dashboard", icon: IconGauge, section: "management" },
  { to: "/staff/sales", label: "console.nav.sales", icon: IconReceipt, section: "management" },
  { to: "/staff/reports", label: "console.nav.reports", icon: IconChartBar, section: "management" },
  { to: "/staff/team", label: "console.nav.team", icon: IconUsers, section: "management" },
  { to: "/staff/audit", label: "console.nav.audit", icon: IconHistory, section: "management" },
  { to: "/staff/settings", label: "console.nav.settings", icon: IconSettings, section: "management" },
];
