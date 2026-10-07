import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAdjustments, IconMinus, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { isApiError } from "../../../api/client";
import { useMenu } from "../../../api/menu";
import { useCreateCounterOrder } from "../../../api/orders";
import type { CounterOrderOut, MenuItem, PaymentMethod } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";
import {
  type CartLine,
  cartTotal,
  indexMenu,
  lineKey,
  needsOptionsSheet,
  optionNames,
  toRequestLines,
  unitPrice,
} from "../../../lib/cart";
import { useLocalized } from "../../../lib/i18n";
import { formatSen } from "../../../lib/money";
import { OptionsModal } from "../components/OptionsModal";
import { PaymentModal } from "../components/PaymentModal";

export default function TakeOrderPage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { data: menu, isPending, isError, refetch } = useMenu();
  const create = useCreateCounterOrder();
  const wide = useMediaQuery("(min-width: 62em)", true);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [phoneOrder, setPhoneOrder] = useState(false);
  const [optionsFor, setOptionsFor] = useState<MenuItem | null>(null);
  const [paying, setPaying] = useState(false);
  const [problemLines, setProblemLines] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<CounterOrderOut | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const items = useMemo(() => indexMenu(menu), [menu]);
  const total = cartTotal(lines, items);
  const count = lines.reduce((n, l) => n + l.quantity, 0);

  const add = (item: MenuItem, optionIds: number[]) => {
    const key = lineKey(item.id, optionIds);
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + 1) } : l));
      return [...prev, { key, itemId: item.id, optionIds, quantity: 1 }];
    });
    setProblemLines(new Set());
    setOptionsFor(null);
  };

  const setQty = (key: string, quantity: number) =>
    setLines((prev) => (quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, quantity) } : l))));

  const reset = () => {
    setLines([]);
    setCustomerName("");
    setNote("");
    setPhoneOrder(false);
    setProblemLines(new Set());
  };

  const charge = ({ method, tenderedSen, key }: { method: PaymentMethod; tenderedSen: number | null; key: string }) => {
    create.mutate(
      {
        key,
        body: {
          channel: phoneOrder ? "phone" : "counter",
          customer_name: customerName || null,
          note: note || null,
          items: toRequestLines(lines),
          payment: { method, tendered_sen: tenderedSen },
          expected_total_sen: total,
        },
      },
      {
        onSuccess: (order) => {
          setPaying(false);
          setDone(order);
          reset();
        },
        onError: (e) => {
          if (isApiError(e, "cart_changed")) {
            setPaying(false);
            setProblemLines(new Set((e.details ?? []).map((d) => d.line as number).filter((n) => n !== undefined)));
            refetch();
          }
          notifyError(t, e);
        },
      },
    );
  };

  if (isPending) return <Text c="dimmed">{t("common.loading")}</Text>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const activeCategory = category ?? String(menu.categories[0]?.id ?? "");
  const shown = menu.categories.find((c) => String(c.id) === activeCategory);

  const grid = (
    <Stack gap="sm">
      <ScrollArea type="never">
        <Tabs value={activeCategory} onChange={setCategory} variant="pills">
          <Tabs.List style={{ flexWrap: "nowrap" }}>
            {menu.categories.map((c) => (
              <Tabs.Tab key={c.id} value={String(c.id)} fz="md">
                {loc.name(c)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      </ScrollArea>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm">
        {shown?.items.map((item) => (
          <Paper key={item.id} withBorder pos="relative" style={{ opacity: item.is_sold_out ? 0.45 : 1 }}>
            <UnstyledButton w="100%" p="md" mih={92} disabled={item.is_sold_out}
              onClick={() => (needsOptionsSheet(item) ? setOptionsFor(item) : add(item, []))}>
              <Text fw={700} lineClamp={2}>
                {loc.name(item)}
              </Text>
              <Text size="sm" c="dimmed">
                {item.is_sold_out ? t("menu.soldOut") : formatSen(item.price_sen)}
              </Text>
            </UnstyledButton>
            {!item.is_sold_out && item.groups.length > 0 && !needsOptionsSheet(item) && (
              <ActionIcon pos="absolute" top={6} right={6} variant="light" aria-label={t("takeOrder.withOptions")}
                onClick={() => setOptionsFor(item)}>
                <IconAdjustments size={16} />
              </ActionIcon>
            )}
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );

  const panel = (
    <Paper withBorder p="md" pos={wide ? "sticky" : undefined} top={72}>
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>{t("takeOrder.order")}</Title>
          {lines.length > 0 && (
            <Button size="compact-sm" variant="subtle" color="gray" onClick={reset}>
              {t("takeOrder.clear")}
            </Button>
          )}
        </Group>
        {lines.length === 0 && <Text c="dimmed">{t("takeOrder.empty")}</Text>}
        {lines.map((l, i) => {
          const item = items.get(l.itemId);
          if (!item) return null;
          return (
            <Box key={l.key} p={4} style={{ borderRadius: 8, background: problemLines.has(i) ? "var(--mantine-color-red-0)" : undefined }}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Box miw={0}>
                  <Text fw={600} truncate>
                    {loc.name(item)}
                  </Text>
                  {l.optionIds.length > 0 && (
                    <Text size="xs" c="dimmed">
                      {optionNames(item, l.optionIds, loc.name)}
                    </Text>
                  )}
                  {problemLines.has(i) && (
                    <Badge color="red" size="xs">
                      {t("takeOrder.unavailable")}
                    </Badge>
                  )}
                </Box>
                <Text size="sm">{formatSen(unitPrice(item, l.optionIds) * l.quantity)}</Text>
              </Group>
              <Group gap={6} mt={4}>
                <ActionIcon variant="default" size="lg" onClick={() => setQty(l.key, l.quantity - 1)}
                  aria-label={t("takeOrder.less")}>
                  {l.quantity === 1 ? <IconTrash size={16} /> : <IconMinus size={16} />}
                </ActionIcon>
                <Text w={24} ta="center" fw={700}>
                  {l.quantity}
                </Text>
                <ActionIcon variant="default" size="lg" onClick={() => setQty(l.key, l.quantity + 1)}
                  aria-label={t("takeOrder.more")}>
                  <IconPlus size={16} />
                </ActionIcon>
              </Group>
            </Box>
          );
        })}
        <Divider />
        <TextInput label={t("takeOrder.customerName")} placeholder={t("common.optional")} maxLength={50}
          value={customerName} onChange={(e) => setCustomerName(e.currentTarget.value)} />
        <TextInput label={t("takeOrder.note")} placeholder={t("common.optional")} maxLength={200}
          value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Checkbox label={t("takeOrder.phoneOrder")} checked={phoneOrder}
          onChange={(e) => setPhoneOrder(e.currentTarget.checked)} />
        <Button size="xl" disabled={lines.length === 0} onClick={() => setPaying(true)}>
          {t("takeOrder.charge", { total: formatSen(total) })}
        </Button>
      </Stack>
    </Paper>
  );

  return (
    <>
      {wide ? (
        <Group align="flex-start" wrap="nowrap" gap="md">
          <Box style={{ flex: 1 }}>{grid}</Box>
          <Box w={360}>{panel}</Box>
        </Group>
      ) : (
        <Stack>
          {grid}
          {panel}
          {count > 0 && (
            <Text size="sm" c="dimmed" ta="center">
              {t("takeOrder.itemCount", { count })}
            </Text>
          )}
        </Stack>
      )}

      <OptionsModal item={optionsFor} onAdd={add} onClose={() => setOptionsFor(null)} />
      <PaymentModal opened={paying} totalSen={total} busy={create.isPending} onClose={() => setPaying(false)}
        onConfirm={charge} />
      <Modal opened={done !== null} onClose={() => setDone(null)} centered withCloseButton={false}>
        {done && (
          <Stack align="center" gap="xs" py="md">
            <Text c="dimmed">{t("takeOrder.orderNumber")}</Text>
            <Title order={1} fz={72}>
              {done.order_number}
            </Title>
            <Text size="sm" c="dimmed" ff="monospace">{t("order.idLabel", { code: done.order_code })}</Text>
            <Text>{formatSen(done.total_sen)}</Text>
            {done.change_sen !== null && done.change_sen > 0 && (
              <Text size="xl" fw={800} c="green.8">
                {t("payment.giveChange", { amount: formatSen(done.change_sen) })}
              </Text>
            )}
            <Button size="lg" mt="md" onClick={() => setDone(null)}>
              {t("takeOrder.nextOrder")}
            </Button>
          </Stack>
        )}
      </Modal>
    </>
  );
}
