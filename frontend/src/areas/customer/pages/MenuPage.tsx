import { Alert, Box, ScrollArea, Skeleton, Stack, Tabs, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useMenu, useShop } from "../../../api/menu";
import type { MenuItem } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { useLocalized } from "../../../lib/i18n";
import { ItemCard } from "../components/ItemCard";
import { ItemSheet } from "../components/ItemSheet";
import { RecentOrders } from "../components/RecentOrders";

export default function MenuPage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { data: menu, isPending, isError, refetch } = useMenu();
  const { data: shop } = useShop();
  const [open, setOpen] = useState<MenuItem | null>(null);
  const [active, setActive] = useState<string | null>(null);

  if (isPending) {
    return (
      <Stack mt="md">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={96} radius="md" />
        ))}
      </Stack>
    );
  }
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const scrollTo = (id: string | null) => {
    setActive(id);
    if (id) document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {shop && !shop.can_order_online && (
        <Alert mt="md" color="gray" title={shop.is_open ? t("shop.pausedTitle") : t("shop.closedTitle")}>
          {shop.is_open ? t("shop.pausedBody") : t("shop.closedBody")}
        </Alert>
      )}

      <RecentOrders />

      {menu.categories.length === 0 ? (
        <Text c="dimmed" ta="center" mt="xl">
          {t("menu.empty")}
        </Text>
      ) : (
        <>
          <Box pos="sticky" top={0} bg="gray.0" style={{ zIndex: 2 }} py="xs">
            <ScrollArea type="never">
              <Tabs value={active ?? String(menu.categories[0].id)} onChange={scrollTo} variant="pills">
                <Tabs.List style={{ flexWrap: "nowrap" }}>
                  {menu.categories.map((c) => (
                    <Tabs.Tab key={c.id} value={String(c.id)}>
                      {loc.name(c)}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            </ScrollArea>
          </Box>

          <Stack gap="lg">
            {menu.categories.map((c) => {
              // Sold-out items sit at the bottom of their category.
              const items = [...c.items].sort((a, b) => Number(a.is_sold_out) - Number(b.is_sold_out));
              return (
                <Box key={c.id} id={`cat-${c.id}`} style={{ scrollMarginTop: 56 }}>
                  <Title order={4} mb="xs">
                    {loc.name(c)}
                  </Title>
                  <Stack gap="xs">
                    {items.map((item) => (
                      <ItemCard key={item.id} item={item} onOpen={() => setOpen(item)} />
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </>
      )}

      <ItemSheet item={open} canOrder={!!shop?.can_order_online} onClose={() => setOpen(null)} />
    </>
  );
}
