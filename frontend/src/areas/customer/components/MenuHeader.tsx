import { Box, Group, ScrollArea, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { useShop } from "../../../api/menu";
import { LanguageSwitch } from "../../../components/LanguageSwitch";
import { clockLabel, hoursLine } from "../../../lib/hours";
import { tokens } from "../../../ui/tokens";

/** Shop name, today's hours, search and category chips. Sticks to the top while the menu scrolls. */
export function MenuHeader({ query, onQuery, categories, activeId, onPick }: {
  query: string;
  onQuery: (q: string) => void;
  categories: { id: number; name: string }[];
  activeId: number | null;
  onPick: (id: number) => void;
}) {
  const { t } = useTranslation();
  const { data: shop } = useShop();

  let status = "";
  if (shop) {
    // The server decides open or closed; the hours only add when.
    const hours = hoursLine(shop);
    if (shop.is_open && hours && "allDay" in hours) {
      status = `${t("shop.open")} · ${t("shop.prepTime", { minutes: shop.prep_minutes })}`;
    } else if (shop.is_open && hours && "openUntil" in hours) {
      status = t("shop.openUntil", { time: clockLabel(hours.openUntil), minutes: shop.prep_minutes });
    } else if (!shop.is_open && hours && "opensAt" in hours) {
      const time = clockLabel(hours.opensAt);
      status = t("shop.closedOpensAt", { when: hours.dayOffset === 0 ? time : `${t(`days.${hours.day}`)} ${time}` });
    } else {
      status = shop.is_open ? t("shop.open") : t("shop.closed");
    }
  }

  return (
    <Box pos="sticky" top={0} mx={-16} px={16} pt={8} pb={12} style={{
      zIndex: 50, background: "rgba(255,255,255,.92)", backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)", borderBottom: `1px solid ${tokens.border}`,
    }}>
      <Group justify="space-between" wrap="nowrap" align="center" mb={10}>
        <Box miw={0}>
          <Text fz={20} lh="30px" fw={600} c={tokens.text} truncate style={{ letterSpacing: "-.02em" }}>
            {shop?.name ?? " "}
          </Text>
          <Text fz={12} c={tokens.muted}>{status || " "}</Text>
        </Box>
        <LanguageSwitch />
      </Group>
      <TextInput value={query} onChange={(e) => onQuery(e.currentTarget.value)} placeholder={t("customer.search")}
        aria-label={t("customer.search")} leftSection={<IconSearch size={16} />} radius={10} type="search"
        styles={{ input: { background: tokens.secondaryBg, border: "none" } }} />
      {!query.trim() && categories.length > 1 && (
        <ScrollArea type="never" mt={10}>
          <Group gap={8} wrap="nowrap">
            {categories.map((c) => {
              const on = c.id === activeId;
              return (
                <UnstyledButton key={c.id} onClick={() => onPick(c.id)} aria-pressed={on} px={14} py={6}
                  style={{
                    borderRadius: 999, whiteSpace: "nowrap", fontSize: 14, fontWeight: 500,
                    background: on ? "var(--mantine-color-orange-7)" : tokens.secondaryBg,
                    color: on ? "white" : tokens.secondaryText,
                  }}>
                  {c.name}
                </UnstyledButton>
              );
            })}
          </Group>
        </ScrollArea>
      )}
    </Box>
  );
}
