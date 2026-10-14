import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAdjustments, IconMinus, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

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
import { formatSen } from "../../../lib/money";
import { OptionsModal } from "../components/OptionsModal";
import { PaymentModal } from "../components/PaymentModal";
import { PageHeader } from "../console/PageHeader";
import { SectionCard, tileStyle } from "../console/SectionCard";
import { tokens } from "../console/tokens";
import type { SentNotice } from "./BoardPage";

const METHODS: PaymentMethod[] = ["cash", "qr_counter", "card_terminal"];
const ALL = "all";

export default function TakeOrderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: menu, isPending, isError, refetch } = useMenu();
  const create = useCreateCounterOrder();
  const wide = useMediaQuery("(min-width: 62em)", true);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [phoneOrder, setPhoneOrder] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [optionsFor, setOptionsFor] = useState<MenuItem | null>(null);
  const [paying, setPaying] = useState(false);
  const [problemLines, setProblemLines] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<{ order: CounterOrderOut; method: PaymentMethod } | null>(null);
  const [category, setCategory] = useState<string>(ALL);
  const [search, setSearch] = useState("");

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

  const charge = ({ method: paidWith, tenderedSen, key }: { method: PaymentMethod; tenderedSen: number | null; key: string }) => {
    create.mutate(
      {
        key,
        body: {
          channel: phoneOrder ? "phone" : "counter",
          customer_name: customerName || null,
          note: note || null,
          items: toRequestLines(lines),
          payment: { method: paidWith, tendered_sen: tenderedSen },
          expected_total_sen: total,
        },
      },
      {
        onSuccess: (order) => {
          setPaying(false);
          setDone({ order, method: paidWith });
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

  const backToQueue = () => {
    const sent: SentNotice | undefined = done ? { number: done.order.order_number, method: done.method } : undefined;
    setDone(null);
    navigate("/staff", { state: sent ? { sent } : null });
  };

  const header = <PageHeader title={t("console.take.title")} subtitle={t("console.take.subtitle")} />;
  if (isPending) return <>{header}<Text c="dimmed">{t("common.loading")}</Text></>;
  if (isError) return <>{header}<ErrorState onRetry={() => refetch()} /></>;

  const q = search.trim().toLowerCase();
  const catName = new Map(menu.categories.map((c) => [c.id, c.name]));
  const shown = menu.categories
    .filter((c) => q || category === ALL || String(c.id) === category)
    .flatMap((c) => c.items)
    .filter((i) => !q || i.name.toLowerCase().includes(q));

  const picker = (
    <SectionCard title={t("console.take.pick")}
      actions={
        <TextInput w={{ base: "100%", xs: 220 }} leftSection={<IconSearch size={16} />} placeholder={t("console.take.search")}
          value={search} onChange={(e) => setSearch(e.currentTarget.value)} aria-label={t("console.take.search")} />
      }>
      <Stack gap={12}>
        <ScrollArea type="never">
          <Chip.Group multiple={false} value={category} onChange={(v) => setCategory(v)}>
            <Group gap={8} wrap="nowrap">
              <Chip value={ALL} variant="light">{t("console.take.all")}</Chip>
              {menu.categories.map((c) => (
                <Chip key={c.id} value={String(c.id)} variant="light">{c.name}</Chip>
              ))}
            </Group>
          </Chip.Group>
        </ScrollArea>
        {shown.length === 0 && <Text c="dimmed" size="sm">{t("console.take.noMatch")}</Text>}
        {shown.map((item) => (
          <Group key={item.id} gap={8} wrap="nowrap" style={{ ...tileStyle, opacity: item.is_sold_out ? 0.5 : 1 }}>
            <UnstyledButton flex={1} p={14} miw={0} disabled={item.is_sold_out}
              onClick={() => (needsOptionsSheet(item) ? setOptionsFor(item) : add(item, []))}>
              <Group justify="space-between" wrap="nowrap" gap={16}>
                <Stack gap={2} miw={0}>
                  <Text fz={14} lh="20px" fw={500} c={tokens.text} truncate>{item.name}</Text>
                  <Text fz={13} c={tokens.muted}>{catName.get(item.category_id)}</Text>
                </Stack>
                <Group gap={12} wrap="nowrap">
                  <Text fz={14} fw={600} c={item.is_sold_out ? tokens.muted : tokens.text}>
                    {item.is_sold_out ? t("menu.soldOut") : formatSen(item.price_sen)}
                  </Text>
                  {!item.is_sold_out && (
                    <ActionIcon component="span" radius="xl" size={28} aria-hidden>
                      <IconPlus size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Group>
            </UnstyledButton>
            {!item.is_sold_out && item.groups.length > 0 && !needsOptionsSheet(item) && (
              <ActionIcon variant="subtle" color="gray" mr={10} aria-label={t("takeOrder.withOptions")}
                onClick={() => setOptionsFor(item)}>
                <IconAdjustments size={18} />
              </ActionIcon>
            )}
          </Group>
        ))}
      </Stack>
    </SectionCard>
  );

  const ticket = (
    <SectionCard title={t("console.take.ticket")} pos={wide ? "sticky" : undefined} top={88}
      actions={lines.length > 0 && (
        <Button size="compact-sm" variant="subtle" color="gray" onClick={reset}>{t("takeOrder.clear")}</Button>
      )}>
      <Stack gap={16}>
        <TextInput label={t("takeOrder.customerName")} placeholder={t("console.take.walkIn")} maxLength={50}
          value={customerName} onChange={(e) => setCustomerName(e.currentTarget.value)} />
        {lines.length === 0 && (
          <Text p={24} ta="center" fz={14} c={tokens.muted} style={tileStyle}>{t("console.take.empty")}</Text>
        )}
        <Stack gap={10}>
          {lines.map((l, i) => {
            const item = items.get(l.itemId);
            if (!item) return null;
            const problem = problemLines.has(i);
            return (
              <Group key={l.key} justify="space-between" wrap="nowrap" gap={12} p={problem ? 6 : 0}
                style={problem ? { borderRadius: 8, background: tokens.dangerBg } : undefined}>
                <Box miw={0}>
                  <Text fz={14} c={tokens.text} truncate>{item.name}</Text>
                  {l.optionIds.length > 0 && <Text fz={12} c={tokens.muted}>{optionNames(item, l.optionIds)}</Text>}
                  {problem && <Badge color="red" size="xs">{t("takeOrder.unavailable")}</Badge>}
                </Box>
                <Group gap={10} wrap="nowrap">
                  <Group gap={4} p={2} bg={tokens.secondaryBg} style={{ borderRadius: 999 }} wrap="nowrap">
                    <ActionIcon radius="xl" size={28} variant="white" color="dark" onClick={() => setQty(l.key, l.quantity - 1)}
                      aria-label={t("takeOrder.less")}>
                      {l.quantity === 1 ? <IconTrash size={14} /> : <IconMinus size={14} />}
                    </ActionIcon>
                    <Text miw={20} ta="center" fz={13} fw={600}>{l.quantity}</Text>
                    <ActionIcon radius="xl" size={28} variant="white" color="dark" onClick={() => setQty(l.key, l.quantity + 1)}
                      aria-label={t("takeOrder.more")}>
                      <IconPlus size={14} />
                    </ActionIcon>
                  </Group>
                  <Text miw={72} ta="right" fz={14} fw={600} c={tokens.text}>
                    {formatSen(unitPrice(item, l.optionIds) * l.quantity)}
                  </Text>
                </Group>
              </Group>
            );
          })}
        </Stack>
        <Box h={1} bg={tokens.border} />
        <Group justify="space-between">
          <Text fz={16} fw={600} c={tokens.text}>
            {t("common.total")}{count > 0 ? ` · ${t("takeOrder.itemCount", { count })}` : ""}
          </Text>
          <Text fz={16} fw={600} c={tokens.text}>{formatSen(total)}</Text>
        </Group>
        <TextInput label={t("takeOrder.note")} placeholder={t("common.optional")} maxLength={200}
          value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Checkbox label={t("takeOrder.phoneOrder")} checked={phoneOrder} onChange={(e) => setPhoneOrder(e.currentTarget.checked)} />
        <Stack gap={8}>
          <Text fz={14} fw={600} c={tokens.text}>{t("console.take.paymentTaken")}</Text>
          <SegmentedControl fullWidth value={method} onChange={(v) => setMethod(v as PaymentMethod)}
            data={METHODS.map((m) => ({ value: m, label: t(`paymentMethod.${m}`) }))} />
        </Stack>
        <Group gap={8} grow>
          <Button variant="light" color="gray" onClick={() => { reset(); navigate("/staff"); }}>
            {t("common.cancel")}
          </Button>
          <Button disabled={lines.length === 0} onClick={() => setPaying(true)}>
            {t("console.take.send")}
          </Button>
        </Group>
      </Stack>
    </SectionCard>
  );

  return (
    <>
      {header}
      {wide ? (
        <Group align="flex-start" wrap="nowrap" gap={20}>
          <Box flex={1} miw={0}>{picker}</Box>
          <Box w={400}>{ticket}</Box>
        </Group>
      ) : (
        <Stack gap={20}>
          {picker}
          {ticket}
        </Stack>
      )}

      <OptionsModal item={optionsFor} onAdd={add} onClose={() => setOptionsFor(null)} />
      <PaymentModal opened={paying} totalSen={total} busy={create.isPending} initialMethod={method}
        onClose={() => setPaying(false)} onConfirm={charge} />
      <Modal opened={done !== null} onClose={() => setDone(null)} centered withCloseButton={false} radius={16}>
        {done && (
          <Stack align="center" gap="xs" py="md">
            <Text c="dimmed">{t("takeOrder.orderNumber")}</Text>
            <Title order={1} fz={72}>{done.order.order_number}</Title>
            <Text size="sm" c="dimmed" ff="monospace">{t("order.idLabel", { code: done.order.order_code })}</Text>
            <Text>{formatSen(done.order.total_sen)}</Text>
            {done.order.change_sen !== null && done.order.change_sen > 0 && (
              <Text size="xl" fw={800} c="green.8">
                {t("payment.giveChange", { amount: formatSen(done.order.change_sen) })}
              </Text>
            )}
            <Group mt="md" gap="xs">
              <Button size="md" variant="light" color="gray" onClick={() => setDone(null)}>
                {t("takeOrder.nextOrder")}
              </Button>
              <Button size="md" onClick={backToQueue}>{t("console.take.backToQueue")}</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
