import { Button, Modal, Stack } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MenuItem } from "../../../api/types";
import { type Chosen, OptionPicker, choicesValid, chosenIds } from "../../../components/OptionPicker";
import { unitPrice } from "../../../lib/cart";
import { useLocalized } from "../../../lib/i18n";
import { formatSen } from "../../../lib/money";

export function OptionsModal({ item, onAdd, onClose }: {
  item: MenuItem | null;
  onAdd: (item: MenuItem, optionIds: number[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const [chosen, setChosen] = useState<Chosen>({});

  useEffect(() => setChosen({}), [item]);
  if (!item) return null;

  const ids = chosenIds(chosen);
  return (
    <Modal opened onClose={onClose} title={loc.name(item)} centered size="lg">
      <Stack gap="lg">
        <OptionPicker item={item} chosen={chosen} onChange={setChosen} />
        <Button size="lg" disabled={!choicesValid(item, chosen)} onClick={() => onAdd(item, ids)}>
          {t("takeOrder.addWithPrice", { price: formatSen(unitPrice(item, ids)) })}
        </Button>
      </Stack>
    </Modal>
  );
}
