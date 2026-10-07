import { Alert, Button, Center, Group, Loader, Paper, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";

import { isApiError, newIdempotencyKey } from "../../../api/client";
import { menuKey, useMenu, useShop } from "../../../api/menu";
import { usePlaceOrder, useQuote } from "../../../api/public";
import { indexMenu } from "../../../lib/cart";
import { formatSen } from "../../../lib/money";
import { formatMyPhone, normalizeMyPhone } from "../../../lib/phone";
import { loadDetails, rememberOrder, saveDetails } from "../../../lib/storage";
import { useCart } from "../cart";
import { CartLines } from "../components/CartLines";

/** One screen: who you are, a note, the summary, and one button. */
export default function CheckoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cart = useCart();
  const { data: menu } = useMenu();
  const { data: shop } = useShop();
  const items = useMemo(() => indexMenu(menu), [menu]);
  const quote = useQuote(cart.requestLines);
  const place = usePlaceOrder();

  const saved = loadDetails();
  const [name, setName] = useState(saved.name);
  const [phone, setPhone] = useState(saved.phone);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  // One key per checkout attempt: a retry after a dropped connection returns the same order.
  const [key] = useState(newIdempotencyKey);

  if (leaving) {
    return (
      <Center mt={80}>
        <Stack align="center">
          <Loader />
          <Text>{t("customer.toPayment")}</Text>
        </Stack>
      </Center>
    );
  }
  if (cart.count === 0) return <Navigate to="/cart" replace />;

  const normalized = normalizeMyPhone(phone);
  const total = quote.data?.total_sen;
  const problems = quote.data?.problems.length ?? 0;
  const canSubmit = name.trim() && normalized && total !== undefined && problems === 0 && shop?.can_order_online;

  const submit = () => {
    setTouched(true);
    setError(null);
    if (!canSubmit || total === undefined) return;
    place.mutate(
      {
        key,
        body: { customer_name: name.trim(), customer_phone: normalized!, note: note.trim() || null,
          items: cart.requestLines, expected_total_sen: total },
      },
      {
        onSuccess: (order) => {
          saveDetails({ name: name.trim(), phone });
          rememberOrder({ token: order.token, number: order.order_number, placedAt: new Date().toISOString(),
            totalSen: order.total_sen });
          setLeaving(true);
          cart.clear();
          if (order.payment_url) window.location.assign(order.payment_url);
          else navigate(`/t/${order.token}`, { replace: true });
        },
        onError: (e) => {
          if (isApiError(e, "cart_changed")) {
            qc.invalidateQueries({ queryKey: menuKey });
            quote.refetch();
            setError(t("customer.cartChanged"));
          } else if (isApiError(e, "shop_closed")) {
            qc.invalidateQueries({ queryKey: ["shop"] });
            setError(t("shop.pausedBody"));
          } else if (isApiError(e, "invalid_phone")) {
            setError(t("customer.phoneInvalid"));
          } else if (isApiError(e, "too_many_unpaid")) {
            setError(t("customer.tooManyUnpaid"));
          } else {
            setError(isApiError(e, "network_error") ? t("apiError.network_error") : t("error.body"));
          }
        },
      },
    );
  };

  return (
    <Stack mt="md">
      <Title order={3}>{t("customer.checkout")}</Title>
      {error && <Alert color="red">{error}</Alert>}
      <Paper withBorder p="md">
        <Stack>
          <TextInput label={t("customer.yourName")} description={t("customer.yourNameHint")} required maxLength={50}
            autoComplete="given-name" value={name} onChange={(e) => setName(e.currentTarget.value)}
            error={touched && !name.trim() ? t("customer.nameRequired") : undefined} />
          <TextInput label={t("customer.phone")} required type="tel" inputMode="tel" autoComplete="tel" maxLength={20}
            placeholder="012-345 6789" value={phone} onChange={(e) => setPhone(e.currentTarget.value)}
            onBlur={() => setTouched(true)}
            description={normalized ? t("customer.phoneReadBack", { phone: formatMyPhone(normalized) }) : t("customer.phoneHint")}
            error={touched && phone && !normalized ? t("customer.phoneInvalid") : undefined} />
          <Textarea label={t("customer.orderNote")} placeholder={t("common.optional")} maxLength={200} autosize
            minRows={1} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <CartLines items={items} quote={quote.data} editable={false} />
        <Group justify="space-between" mt="sm">
          <Text fw={700}>{t("common.total")}</Text>
          <Text fw={700}>{total !== undefined ? formatSen(total) : "…"}</Text>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">{t("customer.pickupOnly")}</Text>
      </Paper>

      <Button size="xl" radius="xl" loading={place.isPending} disabled={total === undefined || problems > 0} onClick={submit}>
        {total !== undefined ? t("customer.pay", { total: formatSen(total) }) : t("common.loading")}
      </Button>
      <Text size="xs" c="dimmed" ta="center">{t("customer.privacy")}</Text>
    </Stack>
  );
}
