import { Alert, Anchor, Box, Button, Group, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useMenu, useShop } from "../../../api/menu";
import { useQuote } from "../../../api/public";
import { indexMenu } from "../../../lib/cart";
import { formatSen } from "../../../lib/money";
import { radius, tokens } from "../../../ui/tokens";
import { useCart } from "../cart";
import { CartLines } from "../components/CartLines";
import { BottomBar } from "../ui/BottomBar";

export default function CartPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cart = useCart();
  const { data: menu } = useMenu();
  const { data: shop } = useShop();
  const items = useMemo(() => indexMenu(menu), [menu]);
  const quote = useQuote(cart.requestLines);

  if (cart.count === 0) {
    return (
      <Stack align="center" mt={80} gap="sm">
        <Text c={tokens.muted}>{t("customer.cartEmpty")}</Text>
        <Button component={Link} to="/" variant="light" color="orange.7" radius="xl">{t("customer.browseMenu")}</Button>
      </Stack>
    );
  }

  const problems = quote.data?.problems.length ?? 0;
  const ready = quote.isSuccess && problems === 0 && !!shop?.can_order_online;

  return (
    <Box pb={80}>
      <Group justify="space-between" pt={16} pb={12}>
        <Text fz={20} fw={600} c={tokens.text} style={{ letterSpacing: "-.02em" }}>{t("customer.yourOrder")}</Text>
        <Anchor component={Link} to="/" fz={14} fw={500} c="orange.7">{t("customer.addMore")}</Anchor>
      </Group>
      <Stack gap={12}>
        {shop && !shop.can_order_online && (
          <Alert color="gray" radius={radius.tile}>
            {shop.online_payments_enabled ? t("shop.pausedBody") : t("shop.counterOnlyBody")}
          </Alert>
        )}
        {problems > 0 && <Alert color="red" radius={radius.tile}>{t("customer.someUnavailable")}</Alert>}
        <CartLines items={items} quote={quote.data} />
        <Group justify="space-between" p={16} bg={tokens.card} style={{ borderRadius: radius.card, boxShadow: tokens.cardShadow }}>
          <Text fz={15} fw={600}>{t("common.total")}</Text>
          <Text fz={17} fw={600}>{quote.data ? formatSen(quote.data.total_sen) : "…"}</Text>
        </Group>
      </Stack>
      <BottomBar aboveTabs>
        <Button fullWidth size="md" radius="xl" color="orange.7" disabled={!ready} loading={quote.isFetching && !quote.data}
          onClick={() => navigate("/checkout")}>
          {t("customer.checkout")}
        </Button>
      </BottomBar>
    </Box>
  );
}
