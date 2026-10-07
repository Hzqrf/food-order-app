import { Alert, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useMenu, useShop } from "../../../api/menu";
import { useQuote } from "../../../api/public";
import { indexMenu } from "../../../lib/cart";
import { formatSen } from "../../../lib/money";
import { useCart } from "../cart";
import { CartLines } from "../components/CartLines";

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
      <Stack align="center" mt="xl" gap="sm">
        <Text c="dimmed">{t("customer.cartEmpty")}</Text>
        <Button component={Link} to="/" variant="light">{t("customer.browseMenu")}</Button>
      </Stack>
    );
  }

  const problems = quote.data?.problems.length ?? 0;
  const ready = quote.isSuccess && problems === 0 && !!shop?.can_order_online;

  return (
    <Stack mt="md">
      <Group justify="space-between">
        <Title order={3}>{t("customer.yourOrder")}</Title>
        <Button component={Link} to="/" variant="subtle" size="compact-sm">{t("customer.addMore")}</Button>
      </Group>
      {shop && !shop.can_order_online && <Alert color="gray">{t("shop.pausedBody")}</Alert>}
      {problems > 0 && <Alert color="red">{t("customer.someUnavailable")}</Alert>}
      <Paper withBorder p="sm">
        <CartLines items={items} quote={quote.data} />
      </Paper>
      <Group justify="space-between" px="xs">
        <Text fw={700} size="lg">{t("common.total")}</Text>
        <Text fw={700} size="lg">{quote.data ? formatSen(quote.data.total_sen) : "…"}</Text>
      </Group>
      <Button size="xl" radius="xl" disabled={!ready} loading={quote.isFetching && !quote.data}
        onClick={() => navigate("/checkout")}>
        {t("customer.checkout")}
      </Button>
    </Stack>
  );
}
