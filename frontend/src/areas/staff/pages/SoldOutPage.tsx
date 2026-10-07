import { Group, Paper, Stack, Switch, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { useMenu, useSetSoldOut } from "../../../api/menu";
import type { MenuOption } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";
import { useLocalized } from "../../../lib/i18n";

/** The person at the fryer knows first. Everything resets at day close. */
export default function SoldOutPage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { data: menu, isPending, isError, refetch } = useMenu();
  const setSoldOut = useSetSoldOut();

  if (isPending) return <Text c="dimmed">{t("common.loading")}</Text>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  // Option groups are shared between items; list each option once.
  const options = new Map<number, MenuOption & { group: string }>();
  menu.categories.forEach((c) =>
    c.items.forEach((i) => i.groups.forEach((g) => g.options.forEach((o) => options.set(o.id, { ...o, group: loc.name(g) })))),
  );

  const toggle = (kind: "items" | "options", id: number, available: boolean) =>
    setSoldOut.mutate({ kind, id, soldOut: !available }, { onError: (e) => notifyError(t, e) });

  return (
    <Stack maw={720} mx="auto">
      <Text size="sm" c="dimmed">
        {t("soldOut.hint")}
      </Text>
      {menu.categories.map((c) => (
        <Paper key={c.id} withBorder p="md">
          <Title order={5} mb="xs">
            {loc.name(c)}
          </Title>
          <Stack gap="xs">
            {c.items.map((i) => (
              <Group key={i.id} justify="space-between">
                <div>
                  <Text c={i.is_sold_out ? "dimmed" : undefined}>{loc.name(i)}</Text>
                  {i.is_sold_out && !i.item_sold_out && (
                    <Text size="xs" c="orange.8">
                      {t("soldOut.blockedByOption")}
                    </Text>
                  )}
                </div>
                <Switch size="lg" onLabel={t("soldOut.on")} offLabel={t("soldOut.off")} checked={!i.item_sold_out}
                  onChange={(e) => toggle("items", i.id, e.currentTarget.checked)} />
              </Group>
            ))}
          </Stack>
        </Paper>
      ))}
      {options.size > 0 && (
        <Paper withBorder p="md">
          <Title order={5} mb="xs">
            {t("soldOut.options")}
          </Title>
          <Stack gap="xs">
            {[...options.values()].map((o) => (
              <Group key={o.id} justify="space-between">
                <Text c={o.is_sold_out ? "dimmed" : undefined}>
                  {loc.name(o)}{" "}
                  <Text span size="xs" c="dimmed">
                    ({o.group})
                  </Text>
                </Text>
                <Switch size="lg" onLabel={t("soldOut.on")} offLabel={t("soldOut.off")} checked={!o.is_sold_out}
                  onChange={(e) => toggle("options", o.id, e.currentTarget.checked)} />
              </Group>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
