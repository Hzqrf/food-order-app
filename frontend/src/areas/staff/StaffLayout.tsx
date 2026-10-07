import {
  ActionIcon,
  AppShell,
  Badge,
  Button,
  Center,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useIdle } from "@mantine/hooks";
import { IconClipboardList, IconLock, IconPlus, IconSearch, IconSettings, IconToolsKitchen2 } from "@tabler/icons-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { useLogout, useSession } from "../../api/auth";
import { useSetOnlineOrders, useShop } from "../../api/menu";
import { notifyError } from "../../components/errors";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { PinPad } from "./components/PinPad";

const IDLE_LOCK_MS = 5 * 60_000;

type StaffCtx = {
  /** True when nobody is signed in on a shared tablet: the board is visible but read-only. */
  locked: boolean;
  /** Call before an action. Returns false and asks for a PIN when the tablet is locked. */
  ensureUnlocked: () => boolean;
};

const Ctx = createContext<StaffCtx>({ locked: false, ensureUnlocked: () => true });
export const useStaff = () => useContext(Ctx);

const TABS = [
  { to: "/staff", label: "staff.tabs.board", icon: IconClipboardList, end: true },
  { to: "/staff/take", label: "staff.tabs.takeOrder", icon: IconPlus },
  { to: "/staff/search", label: "staff.tabs.search", icon: IconSearch },
  { to: "/staff/sold-out", label: "staff.tabs.soldOut", icon: IconToolsKitchen2 },
];

export default function StaffLayout() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const { data: shop } = useShop();
  const logout = useLogout();
  const setOnline = useSetOnlineOrders();
  const navigate = useNavigate();
  const location = useLocation();
  const [pinOpen, setPinOpen] = useState(false);
  const idle = useIdle(IDLE_LOCK_MS, { initialState: false });

  const user = session?.user ?? null;
  const onTablet = !!session?.device_registered;
  const locked = !user;

  // A PIN unlock lasts until 5 minutes without a touch, then the tablet locks itself.
  useEffect(() => {
    if (idle && session?.via_pin && !logout.isPending) logout.mutate();
  }, [idle, session?.via_pin, logout]);

  const ensureUnlocked = useCallback(() => {
    if (!locked) return true;
    setPinOpen(true);
    return false;
  }, [locked]);

  // Only the board is useful while locked.
  const onBoard = location.pathname === "/staff" || location.pathname === "/staff/";
  const blockPage = locked && !onBoard;

  const lock = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        if (!onTablet) navigate("/login");
        else navigate("/staff");
      },
    });
  };

  return (
    <Ctx.Provider value={{ locked, ensureUnlocked }}>
      <AppShell header={{ height: 56 }} footer={{ height: 64 }} padding="md">
        <AppShell.Header px="md">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" miw={0}>
              <Text fw={700} truncate>
                {session?.branch_name}
              </Text>
              {shop && (
                <Tooltip label={t("staff.onlineOrdersHint")}>
                  <Switch
                    size="sm"
                    color="green"
                    label={shop.is_accepting_online_orders ? t("staff.onlineOn") : t("staff.onlinePaused")}
                    checked={shop.is_accepting_online_orders}
                    onChange={(e) => {
                      if (!ensureUnlocked()) return;
                      setOnline.mutate(e.currentTarget.checked, { onError: (err) => notifyError(t, err) });
                    }}
                  />
                </Tooltip>
              )}
            </Group>
            <Group gap="xs" wrap="nowrap">
              <LanguageSwitch />
              {user?.role === "admin" && (
                <ActionIcon component={Link} to="/admin" variant="subtle" aria-label={t("staff.adminLink")}>
                  <IconSettings size={20} />
                </ActionIcon>
              )}
              {user ? (
                <Button variant="light" size="xs" leftSection={<IconLock size={14} />} onClick={lock}>
                  {user.full_name} · {onTablet ? t("staff.lock") : t("staff.signOut")}
                </Button>
              ) : (
                <Button size="xs" onClick={() => setPinOpen(true)}>
                  {t("staff.tapToUnlock")}
                </Button>
              )}
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Main>
          {locked && onBoard && (
            <Badge color="gray" variant="light" mb="sm" leftSection={<IconLock size={12} />}>
              {t("staff.lockedBanner")}
            </Badge>
          )}
          {blockPage ? (
            <Center h="60vh">
              <Stack maw={420} w="100%">
                <PinPad />
              </Stack>
            </Center>
          ) : (
            <Outlet />
          )}
        </AppShell.Main>

        <AppShell.Footer>
          <Group h="100%" grow gap={0}>
            {TABS.map(({ to, label, icon: Icon, end }) => (
              <UnstyledButton
                key={to}
                component={NavLink}
                to={to}
                end={end}
                h="100%"
                style={({ isActive }: { isActive: boolean }) => ({
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isActive ? "var(--mantine-color-orange-7)" : "var(--mantine-color-gray-7)",
                  fontWeight: isActive ? 700 : 500,
                })}
              >
                <Icon size={22} />
                <Text size="xs" inherit>
                  {t(label)}
                </Text>
              </UnstyledButton>
            ))}
          </Group>
        </AppShell.Footer>
      </AppShell>

      <Modal opened={pinOpen && locked} onClose={() => setPinOpen(false)} centered size="md" title={t("pin.title")}>
        <PinPad onUnlocked={() => setPinOpen(false)} />
      </Modal>
    </Ctx.Provider>
  );
}
