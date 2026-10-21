import { Badge, Box, Group, Text, UnstyledButton } from "@mantine/core";
import { IconReceipt, IconShoppingBag, IconToolsKitchen2 } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";

import { tokens } from "../../../ui/tokens";

/** Menu, Cart and Orders. The Cart tab goes away while the shop only takes orders at the counter. */
export function TabBar({ cartCount, showCart }: { cartCount: number; showCart: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const tabs = [
    { to: "/", label: t("customer.tab.menu"), Icon: IconToolsKitchen2 },
    ...(showCart ? [{ to: "/cart", label: t("customer.tab.cart"), Icon: IconShoppingBag }] : []),
    { to: "/orders", label: t("customer.tab.orders"), Icon: IconReceipt },
  ];
  return (
    <Box component="nav" pos="fixed" bottom={0} left={0} right={0} bg={tokens.card} style={{
      borderTop: `1px solid ${tokens.border}`, zIndex: 100, paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <Group maw={480} mx="auto" grow gap={0}>
        {tabs.map(({ to, label, Icon }) => {
          const active = pathname === to;
          const color = active ? "var(--mantine-color-orange-7)" : tokens.muted;
          return (
            <UnstyledButton key={to} component={Link} to={to} py={8} aria-current={active ? "page" : undefined}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color }}>
              <Box pos="relative">
                <Icon size={24} stroke={1.75} />
                {to === "/cart" && cartCount > 0 && (
                  <Badge size="xs" circle color="orange.7" pos="absolute" top={-4} right={-12}>{cartCount}</Badge>
                )}
              </Box>
              <Text fz={11} fw={active ? 600 : 500}>{label}</Text>
            </UnstyledButton>
          );
        })}
      </Group>
    </Box>
  );
}
