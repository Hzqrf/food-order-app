import { Checkbox, Group, Radio, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { MenuGroup, MenuItem } from "../api/types";
import { useLocalized } from "../lib/i18n";
import { formatSen } from "../lib/money";

export type Chosen = Record<number, number[]>;

export function ruleLabel(t: (k: string, o?: Record<string, unknown>) => string, g: Pick<MenuGroup, "min_select" | "max_select">) {
  if (g.min_select === 1 && g.max_select === 1) return t("options.chooseOne");
  if (g.min_select > 0) return t("options.chooseRange", { min: g.min_select, max: g.max_select });
  return t("options.upTo", { max: g.max_select });
}

export function chosenIds(chosen: Chosen): number[] {
  return Object.values(chosen).flat();
}

export function choicesValid(item: MenuItem, chosen: Chosen): boolean {
  return item.groups.every((g) => {
    const n = (chosen[g.id] ?? []).length;
    return n >= g.min_select && n <= g.max_select;
  });
}

/** Option groups for one item. min 1 / max 1 renders radios, anything else checkboxes. */
export function OptionPicker({ item, chosen, onChange }: {
  item: MenuItem;
  chosen: Chosen;
  onChange: (next: Chosen) => void;
}) {
  const { t } = useTranslation();
  const loc = useLocalized();

  const price = (o: { is_sold_out: boolean; price_delta_sen: number }) =>
    o.is_sold_out ? t("menu.soldOut") : o.price_delta_sen ? `+${formatSen(o.price_delta_sen)}` : " ";

  return (
    <Stack gap="lg">
      {item.groups.map((g) => {
        const single = g.min_select === 1 && g.max_select === 1;
        const picked = chosen[g.id] ?? [];
        return (
          <Stack key={g.id} gap="xs">
            <Group gap="xs">
              <Title order={5}>{loc.name(g)}</Title>
              <Text size="sm" c={g.min_select > 0 ? "orange.8" : "dimmed"}>
                {ruleLabel(t, g)}
              </Text>
            </Group>
            {single ? (
              <Radio.Group value={picked[0] ? String(picked[0]) : null}
                onChange={(v) => onChange({ ...chosen, [g.id]: [Number(v)] })}>
                <Group gap="xs">
                  {g.options.map((o) => (
                    <Radio.Card key={o.id} value={String(o.id)} disabled={o.is_sold_out} p="sm" w="auto" miw={110}
                      style={{ opacity: o.is_sold_out ? 0.5 : 1 }}>
                      <Text fw={600}>{loc.name(o)}</Text>
                      <Text size="sm" c="dimmed">{price(o)}</Text>
                    </Radio.Card>
                  ))}
                </Group>
              </Radio.Group>
            ) : (
              <Group gap="xs">
                {g.options.map((o) => {
                  const on = picked.includes(o.id);
                  const full = !on && picked.length >= g.max_select;
                  const disabled = o.is_sold_out || full;
                  return (
                    <Checkbox.Card key={o.id} checked={on} disabled={disabled} p="sm" w="auto" miw={110}
                      style={{ opacity: disabled ? 0.5 : 1 }}
                      onClick={() => {
                        if (disabled) return;
                        onChange({ ...chosen, [g.id]: on ? picked.filter((x) => x !== o.id) : [...picked, o.id] });
                      }}>
                      <Text fw={600}>{loc.name(o)}</Text>
                      <Text size="sm" c="dimmed">{price(o)}</Text>
                    </Checkbox.Card>
                  );
                })}
              </Group>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
