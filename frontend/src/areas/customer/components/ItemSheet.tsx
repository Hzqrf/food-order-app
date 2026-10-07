import { ActionIcon, Button, Drawer, Group, Image, Stack, Text, TextInput } from "@mantine/core";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MenuItem } from "../../../api/types";
import { type Chosen, OptionPicker, choicesValid, chosenIds } from "../../../components/OptionPicker";
import { unitPrice } from "../../../lib/cart";
import { useLocalized } from "../../../lib/i18n";
import { formatSen } from "../../../lib/money";
import { useCart } from "../cart";

/** A bottom sheet, not a new page: options, quantity, a note, and the live price on the button. */
export function ItemSheet({ item, canOrder, onClose }: { item: MenuItem | null; canOrder: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const cart = useCart();
  const [chosen, setChosen] = useState<Chosen>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    setChosen({});
    setQuantity(1);
    setNote("");
  }, [item]);

  const ids = chosenIds(chosen);
  const valid = item ? choicesValid(item, chosen) : false;

  return (
    <Drawer opened={item !== null} onClose={onClose} position="bottom" size="auto" radius="lg"
      title={item ? loc.name(item) : ""} styles={{ content: { maxHeight: "92vh" } }}>
      {item && (
        <Stack gap="md" pb="md">
          {item.image_url_large && <Image src={item.image_url_large} alt="" radius="md" mah={240} fit="cover" />}
          {loc.description(item) && <Text c="dimmed">{loc.description(item)}</Text>}
          <OptionPicker item={item} chosen={chosen} onChange={setChosen} />
          <TextInput label={t("customer.itemNote")} placeholder={t("customer.itemNotePlaceholder")} maxLength={200}
            value={note} onChange={(e) => setNote(e.currentTarget.value)} />
          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <ActionIcon size="xl" variant="default" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)}
                aria-label={t("takeOrder.less")}>
                <IconMinus size={18} />
              </ActionIcon>
              <Text fw={700} w={28} ta="center">{quantity}</Text>
              <ActionIcon size="xl" variant="default" disabled={quantity >= 20} onClick={() => setQuantity(quantity + 1)}
                aria-label={t("takeOrder.more")}>
                <IconPlus size={18} />
              </ActionIcon>
            </Group>
            <Button size="lg" style={{ flex: 1 }} disabled={!canOrder || item.is_sold_out || !valid}
              onClick={() => {
                cart.add(item.id, ids, quantity, note.trim() || undefined);
                onClose();
              }}>
              {item.is_sold_out ? t("menu.soldOut")
                : !canOrder ? t("customer.orderingClosed")
                  : t("takeOrder.addWithPrice", { price: formatSen(unitPrice(item, ids) * quantity) })}
            </Button>
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}
