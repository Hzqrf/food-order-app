import "@fontsource-variable/inter";

import { Box } from "@mantine/core";
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";

import { useShop } from "../../api/menu";
import { tokens } from "../../ui/tokens";
import { CartProvider, useCart } from "./cart";
import { TabBar } from "./ui/TabBar";

const TAB_PAGES = new Set(["/", "/cart", "/orders"]);

/** Customers only ever see the shop's own name. The product brand stays out of their way. */
export default function CustomerLayout() {
  return (
    <CartProvider>
      <Shell />
    </CartProvider>
  );
}

function Shell() {
  const { data: shop } = useShop();
  const cart = useCart();
  const { pathname } = useLocation();
  const tabs = TAB_PAGES.has(pathname);

  useEffect(() => {
    if (shop && !pathname.startsWith("/t/")) document.title = shop.name;
  }, [shop, pathname]);

  return (
    <Box mih="100vh" bg={tokens.pageBg} c={tokens.text} style={{ fontFamily: "'Inter Variable', sans-serif" }}>
      <Box maw={480} mx="auto" px={16} pb={tabs ? 96 : 24}>
        <Outlet />
      </Box>
      {/* Keep the Cart tab while something is in it, so a paused shop never hides a customer's cart. */}
      {tabs && <TabBar cartCount={cart.count} showCart={Boolean(shop?.can_order_online) || cart.count > 0} />}
    </Box>
  );
}
