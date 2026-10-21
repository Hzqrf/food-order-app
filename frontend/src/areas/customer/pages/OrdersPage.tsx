import { Box, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { tokens } from "../../../ui/tokens";
import { RecentOrders } from "../components/RecentOrders";

/** The orders placed on this phone. No account needed. */
export default function OrdersPage() {
  const { t } = useTranslation();
  return (
    <Box pt={16}>
      <Text fz={20} fw={600} c={tokens.text} mb={12} style={{ letterSpacing: "-.02em" }}>
        {t("customer.tab.orders")}
      </Text>
      <RecentOrders />
    </Box>
  );
}
