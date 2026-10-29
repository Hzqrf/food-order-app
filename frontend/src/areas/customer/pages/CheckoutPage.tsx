import { ActionIcon, Alert, Box, Button, Center, Chip, Group, Loader, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";

import { isApiError, newIdempotencyKey } from "../../../api/client";
import { menuKey, useMenu, usePickupSlots, useShop } from "../../../api/menu";
import { usePlaceOrder, useQuote } from "../../../api/public";
import { indexMenu } from "../../../lib/cart";
import { formatTime } from "../../../lib/dates";
import { clockLabel } from "../../../lib/hours";
import { formatSen } from "../../../lib/money";
import { formatMyPhone, normalizeMyPhone } from "../../../lib/phone";
import { loadDetails, rememberOrder, saveDetails } from "../../../lib/storage";
import { radius, tokens } from "../../../ui/tokens";
import { useCart } from "../cart";
import { CartLines } from "../components/CartLines";
import { BottomBar } from "../ui/BottomBar";
import { ChoiceRow } from "../ui/ChoiceRow";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box p={16} bg={tokens.card} style={{ borderRadius: radius.card, boxShadow: tokens.cardShadow }}>
      <Text fz={14} fw={600} c={tokens.text} mb={10}>{title}</Text>
      {children}
    </Box>
  );
}

/** When the order should be ready if placed now: the usual prep time plus any kitchen delay. */
function useReadyAround(minutes: number | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return minutes === undefined ? "" : formatTime(new Date(now + minutes * 60_000).toISOString());
}

/** One screen: pickup time, who is collecting, a note, the summary, and one button. */
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
  const readyAround = useReadyAround(shop ? shop.prep_minutes + shop.extra_wait_minutes : undefined);

  const saved = loadDetails();
  const [name, setName] = useState(saved.name);
  const [phone, setPhone] = useState(saved.phone);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  // The ways this shop takes payment for an online order, in the order they are offered.
  const options = [shop?.pay_online_available && "online", shop?.pay_at_counter && "counter"]
    .filter((o): o is "online" | "counter" => Boolean(o));
  const [picked, setPicked] = useState<"online" | "counter" | null>(null);
  const choice = picked && options.includes(picked) ? picked : options[0];
  const atCounter = choice === "counter";
  // As soon as possible, or a pickup time later today (a pre-order).
  const [when, setWhen] = useState<"asap" | "later">("asap");
  const [slot, setSlot] = useState<string | null>(null);
  const pickup = usePickupSlots(Boolean(shop?.preorders_enabled));
  const slots = pickup.data ?? [];
  const canPreorder = Boolean(shop?.preorders_enabled) && slots.length > 0;
  const later = canPreorder && when === "later";
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  // One key per checkout attempt: a retry after a dropped connection returns the same order.
  const [key] = useState(newIdempotencyKey);

  if (leaving) {
    return (
      <Center mt={80}>
        <Stack align="center">
          <Loader color="orange.7" />
          <Text>{t("customer.toPayment")}</Text>
        </Stack>
      </Center>
    );
  }
  if (cart.count === 0) return <Navigate to="/cart" replace />;

  // Phone is optional when paying online; paying at the counter needs it, so the shop can call.
  const normalized = normalizeMyPhone(phone);
  const phoneOk = atCounter ? normalized !== null : phone.trim() === "" || normalized !== null;
  const total = quote.data?.total_sen;
  const problems = quote.data?.problems.length ?? 0;
  const canSubmit = phoneOk && total !== undefined && problems === 0 && shop?.can_order_online && (!later || slot !== null);

  const submit = () => {
    setTouched(true);
    setError(null);
    if (!canSubmit || total === undefined) return;
    place.mutate(
      {
        key,
        body: { customer_name: name.trim() || null, customer_phone: normalized, note: note.trim() || null,
          items: cart.requestLines, expected_total_sen: total, pay_at_counter: atCounter,
          pickup_time: later ? slot : null },
      },
      {
        onSuccess: (order) => {
          saveDetails({ name: name.trim(), phone });
          rememberOrder({ token: order.token, number: order.order_number, code: order.order_code,
            placedAt: new Date().toISOString(),
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
          } else if (isApiError(e, "slot_full") || isApiError(e, "slot_unavailable")) {
            pickup.refetch();
            setSlot(null);
            setError(t(`apiError.${isApiError(e, "slot_full") ? "slot_full" : "slot_unavailable"}`));
          } else if (isApiError(e, "preorders_off")) {
            qc.invalidateQueries({ queryKey: ["shop"] });
            setWhen("asap");
            setError(t("apiError.preorders_off"));
          } else if (isApiError(e, "unpaid_at_counter")) {
            setError(t("customer.unpaidAtCounter"));
          } else if (isApiError(e, "payment_option_off")) {
            qc.invalidateQueries({ queryKey: ["shop"] });
            setError(t("customer.paymentOptionOff"));
          } else {
            setError(isApiError(e, "network_error") ? t("apiError.network_error") : t("error.body"));
          }
        },
      },
    );
  };

  return (
    <Box pb={150}>
      <Group gap={8} pt={12} pb={12}>
        <ActionIcon variant="subtle" color="dark" size="lg" radius="xl" onClick={() => navigate("/cart")}
          aria-label={t("common.back")}>
          <IconArrowLeft size={22} />
        </ActionIcon>
        <Text fz={20} fw={600} c={tokens.text} style={{ letterSpacing: "-.02em" }}>{t("customer.checkout")}</Text>
      </Group>

      <Stack gap={12}>
        {error && <Alert color="red" radius={radius.tile}>{error}</Alert>}

        <Card title={t("customer.pickup")}>
          {canPreorder ? (
            <Stack gap={8}>
              <ChoiceRow type="radio" label={t("customer.pickupAsap", { time: readyAround })} priceDeltaSen={0}
                checked={!later} disabled={false} onChange={() => setWhen("asap")} />
              <ChoiceRow type="radio" label={t("customer.chooseTime")} priceDeltaSen={0}
                checked={later} disabled={false} onChange={() => setWhen("later")} />
              {later && (
                <Chip.Group value={slot ?? ""} onChange={(v) => setSlot(typeof v === "string" && v ? v : null)}>
                  <Group gap={8} mt={4}>
                    {slots.map((s) => (
                      <Chip key={s.time} value={s.time} disabled={!s.available} color="orange.7" radius="md">
                        {s.available ? clockLabel(s.time) : `${clockLabel(s.time)} · ${t("customer.slotFull")}`}
                      </Chip>
                    ))}
                  </Group>
                </Chip.Group>
              )}
            </Stack>
          ) : (
            <Text fz={14} c={tokens.body}>{t("customer.pickupAsap", { time: readyAround })}</Text>
          )}
        </Card>

        <Card title={t("customer.whoCollecting")}>
          <Stack gap={12}>
            <TextInput label={t("customer.name")} placeholder={t("common.optional")} maxLength={50} autoComplete="name"
              value={name} onChange={(e) => setName(e.currentTarget.value)} radius={radius.tile} />
            <TextInput label={t("customer.phone")} type="tel" inputMode="tel" autoComplete="tel" maxLength={20}
              placeholder={atCounter ? undefined : t("common.optional")} required={atCounter} value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)} onBlur={() => setTouched(true)} radius={radius.tile}
              description={normalized ? t("customer.phoneReadBack", { phone: formatMyPhone(normalized) })
                : atCounter ? undefined : t("customer.phoneHint")}
              error={touched && !phoneOk
                ? t(atCounter && phone.trim() === "" ? "customer.phoneNeeded" : "customer.phoneInvalid") : undefined} />
          </Stack>
        </Card>

        <Card title={t("customer.orderNote")}>
          <Textarea placeholder={t("common.optional")} maxLength={200} autosize minRows={1} radius={radius.tile}
            aria-label={t("customer.orderNote")} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        </Card>

        <Card title={t("customer.payment")}>
          {options.length > 1 ? (
            <Stack gap={8} mb={14}>
              {options.map((o) => (
                <ChoiceRow key={o} type="radio" label={t(o === "online" ? "customer.payNowOnline" : "customer.payAtCounter")}
                  priceDeltaSen={0} checked={choice === o} disabled={false} onChange={() => setPicked(o)} />
              ))}
            </Stack>
          ) : choice && (
            <Text fz={14} fw={500} mb={12}>
              {t(choice === "online" ? "customer.payNowOnline" : "customer.payAtCounter")}
            </Text>
          )}
          <CartLines items={items} quote={quote.data} editable={false} />
          <Group justify="space-between" mt={14} pt={12} style={{ borderTop: `1px solid ${tokens.border}` }}>
            <Text fz={15} fw={600}>{t("common.total")}</Text>
            <Text fz={17} fw={600}>{total !== undefined ? formatSen(total) : "…"}</Text>
          </Group>
          <Text fz={12} c={tokens.muted} mt={8}>{t(atCounter ? "customer.payAtCounterNote" : "customer.pickupOnly")}</Text>
        </Card>
      </Stack>

      <BottomBar>
        <Button fullWidth size="md" radius="xl" color="orange.7" loading={place.isPending}
          disabled={total === undefined || problems > 0 || (later && slot === null)} onClick={submit}>
          {total === undefined ? t("common.loading")
            : t(atCounter ? "customer.placeOrder" : "customer.pay", { total: formatSen(total) })}
        </Button>
        {later && slot === null && <Text fz={12} c="orange.8" ta="center" mt={6}>{t("customer.pickTime")}</Text>}
        <Text fz={11} c={tokens.muted} ta="center" mt={8}>{t("customer.privacy")}</Text>
      </BottomBar>
    </Box>
  );
}
