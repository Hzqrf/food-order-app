import { Badge, Box, Container, Group, Text, Title, UnstyledButton } from "@mantine/core";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router";

import { useShop } from "../../api/menu";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { CartProvider } from "./cart";
import { CartBar } from "./components/CartBar";

/** Customers only ever see the shop's own name. The product brand stays out of their way. */
export default function CustomerLayout() {
  const { t } = useTranslation();
  const { data: shop } = useShop();
  const { pathname } = useLocation();
  const showCartBar = pathname === "/";

  useEffect(() => {
    if (shop && !pathname.startsWith("/t/")) document.title = shop.name;
  }, [shop, pathname]);

  return (
    <CartProvider>
      <Box mih="100vh" bg="gray.0">
        <Box component="header" bg="white" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}>
          <Container size="sm" py="sm" px="md">
            <Group justify="space-between" wrap="nowrap">
              <UnstyledButton component={Link} to="/" miw={0}>
                <Title order={3} lineClamp={1}>
                  {shop?.name ?? " "}
                </Title>
                {shop && (
                  <Group gap={6}>
                    <Badge size="sm" variant="dot" color={shop.is_open ? "green" : "gray"}>
                      {shop.is_open ? t("shop.open") : t("shop.closed")}
                    </Badge>
                    {shop.is_open && (
                      <Text size="xs" c="dimmed">
                        {t("shop.prepTime", { minutes: shop.prep_minutes })}
                      </Text>
                    )}
                  </Group>
                )}
              </UnstyledButton>
              <LanguageSwitch />
            </Group>
          </Container>
        </Box>
        <Container size="sm" px="md" pb={showCartBar ? 110 : "xl"}>
          <Outlet />
        </Container>
        {showCartBar && <CartBar />}
      </Box>
    </CartProvider>
  );
}
