import { Alert, Box, Group, Skeleton, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";

import { useMenu, useShop } from "../../../api/menu";
import type { MenuItem } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { itemMatches } from "../../../lib/search";
import { radius, tokens } from "../../../ui/tokens";
import { MenuHeader } from "../components/MenuHeader";
import { ItemRow } from "../ui/ItemRow";

const SCROLL_KEY = "menu-scroll";

// Sold-out items sit at the bottom of their list.
const soldOutLast = (items: MenuItem[]) => [...items].sort((a, b) => Number(a.is_sold_out) - Number(b.is_sold_out));

function Section({ id, title, items, onOpen }: { id?: string; title?: string; items: MenuItem[]; onOpen: (i: MenuItem) => void }) {
  return (
    <Box id={id} style={{ scrollMarginTop: 170 }}>
      {title && <Text fz={14} fw={600} c={tokens.text} mb={10}>{title}</Text>}
      <Stack gap={10}>
        {items.map((item) => <ItemRow key={item.id} item={item} onOpen={() => onOpen(item)} />)}
      </Stack>
    </Box>
  );
}

export default function MenuPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: menu, isPending, isError, refetch } = useMenu();
  const { data: shop } = useShop();
  // The search lives in the URL, so coming back from an item brings the results back with it.
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const setQuery = (q: string) => setParams(q ? { q } : {}, { replace: true });
  const [activeId, setActiveId] = useState<number | null>(null);
  const restored = useRef(false);

  // Coming back from an item puts the customer where they were.
  useLayoutEffect(() => {
    if (!menu || restored.current) return;
    restored.current = true;
    try {
      const y = Number(sessionStorage.getItem(SCROLL_KEY));
      sessionStorage.removeItem(SCROLL_KEY);
      if (y > 0) window.scrollTo(0, y);
    } catch { /* storage blocked: start at the top */ }
  }, [menu]);

  // The chip of the category in view is highlighted.
  useEffect(() => {
    if (!menu || query.trim()) return;
    const observer = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (seen) setActiveId(Number(seen.target.id.slice(4)));
    }, { rootMargin: "-170px 0px -55% 0px" });
    menu.categories.forEach((c) => {
      const el = document.getElementById(`cat-${c.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [menu, query]);

  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const open = (item: MenuItem) => {
    try { sessionStorage.setItem(SCROLL_KEY, String(window.scrollY)); } catch { /* fine without it */ }
    navigate(`/item/${item.id}`);
  };
  const pick = (id: number) => {
    setActiveId(id);
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const categories = menu?.categories ?? [];
  const searching = query.trim() !== "";
  const popular = soldOutLast(categories.flatMap((c) => c.items).filter((i) => i.is_popular));
  const matches = searching ? categories.flatMap((c) => c.items).filter((i) => itemMatches(i, query)) : [];
  const busy = shop?.extra_wait_minutes ?? 0;

  return (
    <>
      <MenuHeader query={query} onQuery={setQuery} categories={categories}
        activeId={activeId ?? categories[0]?.id ?? null} onPick={pick} />

      <Stack gap={20} mt={16}>
        {shop && !shop.can_order_online && (
          <Alert color="gray" radius={radius.tile} title={!shop.online_ordering_available ? t("shop.counterOnlyTitle")
            : shop.is_open ? t("shop.pausedTitle") : t("shop.closedTitle")}>
            {!shop.online_ordering_available ? t("shop.counterOnlyBody")
              : shop.is_open ? t("shop.pausedBody") : t("shop.closedBody")}
          </Alert>
        )}

        {busy > 0 && shop?.is_open && (
          <Group gap={10} wrap="nowrap" align="flex-start" p={12} bg={tokens.busyBg} style={{ borderRadius: radius.tile }}>
            <IconAlertTriangle size={18} color={tokens.warning} style={{ flexShrink: 0, marginTop: 1 }} />
            <Text fz={13} c={tokens.body}>{t("customer.busy", { minutes: busy })}</Text>
          </Group>
        )}

        {isPending ? (
          <Stack gap={10}>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={108} radius={radius.card} />)}
          </Stack>
        ) : categories.length === 0 ? (
          <Text c={tokens.muted} ta="center" mt="xl">{t("menu.empty")}</Text>
        ) : searching ? (
          matches.length ? <Section items={soldOutLast(matches)} onOpen={open} />
            : <Text c={tokens.muted} ta="center" mt="xl">{t("customer.noMatch", { q: query.trim() })}</Text>
        ) : (
          <>
            {popular.length > 0 && <Section title={t("customer.popularSection")} items={popular} onOpen={open} />}
            {categories.map((c) => (
              <Section key={c.id} id={`cat-${c.id}`} title={c.name} items={soldOutLast(c.items)} onOpen={open} />
            ))}
          </>
        )}
      </Stack>
    </>
  );
}
