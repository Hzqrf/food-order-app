import { ActionIcon, Anchor, Box, Button, Center, Group, Loader, Stack, Text, TextInput } from "@mantine/core";
import { IconArrowLeft, IconMinus, IconPlus } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { useMenu, useShop } from "../../../api/menu";
import { ErrorState } from "../../../components/ErrorState";
import { type Chosen, choicesValid, chosenIds, ruleLabel } from "../../../components/OptionPicker";
import { indexMenu, unitPrice } from "../../../lib/cart";
import { formatSen } from "../../../lib/money";
import { radius, tokens } from "../../../ui/tokens";
import { useCart } from "../cart";
import { BottomBar } from "../ui/BottomBar";
import { ChoiceRow } from "../ui/ChoiceRow";
import { PhotoTile } from "../ui/PhotoTile";

const MAX_QTY = 20;

/** One menu item on its own page, so the back button works and the link can be shared. */
export default function ItemPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: menu, isPending, isError, refetch } = useMenu();
  const { data: shop } = useShop();
  const cart = useCart();
  const items = useMemo(() => indexMenu(menu), [menu]);
  const [chosen, setChosen] = useState<Chosen>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  // Back to the menu where the customer left it; a shared link opened cold goes to the menu.
  const back = () => {
    if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
    else navigate("/", { replace: true });
  };

  if (isPending) return <Center mt={80}><Loader /></Center>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const item = items.get(Number(id));
  if (!item) {
    return (
      <Stack align="center" mt={80} gap="sm">
        <Text fw={600} ta="center">{t("customer.itemGone")}</Text>
        <Anchor component={Link} to="/" replace c="orange.7">{t("customer.browseMenu")}</Anchor>
      </Stack>
    );
  }

  const ids = chosenIds(chosen);
  const canOrder = Boolean(shop?.can_order_online) && !item.is_sold_out;
  const total = unitPrice(item, ids) * quantity;

  return (
    <Box pb={120}>
      <Group py={12}>
        <ActionIcon variant="subtle" color="dark" size="lg" radius="xl" onClick={back} aria-label={t("common.back")}>
          <IconArrowLeft size={22} />
        </ActionIcon>
      </Group>
      <PhotoTile name={item.name} src={item.image_url_large ?? item.image_url} size="full" />

      <Stack gap={4} mt={16}>
        <Text fz={22} fw={600} c={tokens.text} style={{ letterSpacing: "-.02em" }}>{item.name}</Text>
        {item.description && <Text fz={14} c={tokens.muted}>{item.description}</Text>}
        <Text fz={17} fw={600} c={tokens.text} mt={4}>{formatSen(item.price_sen)}</Text>
      </Stack>

      <Stack gap={24} mt={24}>
        {item.groups.map((g) => {
          const single = g.min_select === 1 && g.max_select === 1;
          const picked = chosen[g.id] ?? [];
          return (
            <Stack key={g.id} gap={8}>
              <Group gap={8} justify="space-between">
                <Text fz={15} fw={600} c={tokens.text}>{g.name}</Text>
                <Text fz={13} c={g.min_select > 0 ? "orange.8" : tokens.muted}>{ruleLabel(t, g)}</Text>
              </Group>
              {g.options.map((o) => {
                const on = picked.includes(o.id);
                const full = !single && !on && picked.length >= g.max_select;
                return (
                  <ChoiceRow key={o.id} type={single ? "radio" : "checkbox"} label={o.name}
                    priceDeltaSen={o.price_delta_sen} checked={on} soldOut={o.is_sold_out}
                    disabled={o.is_sold_out || full}
                    onChange={() => setChosen({
                      ...chosen,
                      [g.id]: single ? [o.id] : on ? picked.filter((x) => x !== o.id) : [...picked, o.id],
                    })} />
                );
              })}
            </Stack>
          );
        })}

        {canOrder && (
          <TextInput label={t("customer.itemNote")} placeholder={t("customer.itemNotePlaceholder")} maxLength={200}
            value={note} onChange={(e) => setNote(e.currentTarget.value)} radius={radius.tile} />
        )}
      </Stack>

      <BottomBar>
        {canOrder ? (
          <Group gap={12} wrap="nowrap">
            <Group gap={4} wrap="nowrap" px={4} py={4} bg={tokens.secondaryBg} style={{ borderRadius: 999 }}>
              <ActionIcon variant="subtle" color="dark" radius="xl" disabled={quantity <= 1}
                onClick={() => setQuantity(quantity - 1)} aria-label={t("takeOrder.less")}>
                <IconMinus size={16} />
              </ActionIcon>
              <Text fw={600} w={24} ta="center">{quantity}</Text>
              <ActionIcon variant="subtle" color="dark" radius="xl" disabled={quantity >= MAX_QTY}
                onClick={() => setQuantity(quantity + 1)} aria-label={t("takeOrder.more")}>
                <IconPlus size={16} />
              </ActionIcon>
            </Group>
            <Button size="md" radius="xl" color="orange.7" style={{ flex: 1 }} disabled={!choicesValid(item, chosen)}
              onClick={() => {
                cart.add(item.id, ids, quantity, note.trim() || undefined);
                back();
              }}>
              {t("customer.addToCart", { total: formatSen(total) })}
            </Button>
          </Group>
        ) : (
          <Text ta="center" fw={500} c={tokens.muted} py={8}>
            {item.is_sold_out ? t("menu.soldOut")
              : shop && !shop.online_ordering_available ? t("customer.orderAtCounter") : t("customer.orderingClosed")}
          </Text>
        )}
      </BottomBar>
    </Box>
  );
}
