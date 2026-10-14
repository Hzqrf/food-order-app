import "@fontsource-variable/inter";
import "./console.css";

import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
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
import { useDisclosure, useIdle, useMediaQuery } from "@mantine/hooks";
import { IconDownload, IconLock, IconLogout } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { useLogout, useSession } from "../../../api/auth";
import { useSetOnlineOrders, useShop } from "../../../api/menu";
import { useBoard } from "../../../api/orders";
import { notifyError } from "../../../components/errors";
import { LanguageSwitch } from "../../../components/LanguageSwitch";
import { PoweredBy } from "../../../components/PoweredBy";
import { useStaffApp, useWakeLock } from "../../../hooks/useStaffApp";
import { PinPad } from "../components/PinPad";
import { ConfirmLogoutModal } from "./ConfirmLogoutModal";
import { LockContext } from "./lock";
import { NAV, type NavItem } from "./nav";
import { radius, tokens } from "./tokens";

const IDLE_LOCK_MS = 5 * 60_000;

function NavRow({ item, label, badge, showLabel, onNavigate }: {
  item: NavItem;
  label: string;
  badge?: number;
  showLabel: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const row = (
    <UnstyledButton
      component={NavLink}
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-label={showLabel ? undefined : label}
      className="console-nav-row"
      data-rail={!showLabel || undefined}
    >
      <Box pos="relative" display="flex">
        <Icon size={20} />
        {!showLabel && badge ? <span className="console-nav-badge console-nav-badge--float">{badge}</span> : null}
      </Box>
      {showLabel && (
        <Text component="span" inherit flex={1} truncate>
          {label}
        </Text>
      )}
      {showLabel && badge ? <span className="console-nav-badge">{badge}</span> : null}
    </UnstyledButton>
  );
  return showLabel ? row : <Tooltip label={label} position="right">{row}</Tooltip>;
}

/** The one staff console: Operations for everyone, Management for owners on their own device. */
export default function ConsoleLayout() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const { data: shop } = useShop();
  const { data: board } = useBoard();
  const logout = useLogout();
  const setOnline = useSetOnlineOrders();
  const navigate = useNavigate();
  const location = useLocation();
  const [opened, { toggle, close }] = useDisclosure();
  const [pinOpen, setPinOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const idle = useIdle(IDLE_LOCK_MS, { initialState: false });
  const { install } = useStaffApp();
  const wide = useMediaQuery("(min-width: 75em)");
  const phone = useMediaQuery("(max-width: 47.99em)");

  const user = session?.user ?? null;
  const onTablet = !!session?.device_registered;
  const locked = !user;
  const isOwner = user?.role === "admin" && !onTablet;
  const showLabels = !!wide || !!phone;
  // The shop tablet's screen stays on, so the board is always visible in the kitchen.
  useWakeLock(onTablet);

  // A PIN unlock lasts until 5 minutes without a touch, then the tablet locks itself.
  useEffect(() => {
    if (idle && session?.via_pin && !logout.isPending) logout.mutate();
  }, [idle, session?.via_pin, logout]);

  const ensureUnlocked = useCallback(() => {
    if (!locked) return true;
    setPinOpen(true);
    return false;
  }, [locked]);

  // Only the queue is useful while locked.
  const onQueue = location.pathname === "/staff" || location.pathname === "/staff/";
  const blockPage = locked && !onQueue;

  const signOut = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false);
        navigate(onTablet ? "/staff" : "/login");
      },
    });
  };
  // Locking the shared tablet is instant and harmless; signing out elsewhere asks first.
  const onLogOut = () => (onTablet ? signOut() : setConfirmOpen(true));

  const openOrders = board?.length ?? 0;
  const sections = (["operations", "management"] as const).filter((s) => s === "operations" || isOwner);

  return (
    <LockContext.Provider value={{ locked, ensureUnlocked }}>
      <AppShell
        header={{ height: 64 }}
        navbar={{ width: { sm: 88, lg: 264 }, breakpoint: "sm", collapsed: { mobile: !opened } }}
        padding={0}
      >
        <AppShell.Header px="md" style={{ borderBottom: `1px solid ${tokens.border}` }}>
          <Group h="100%" justify="space-between" wrap="nowrap" gap="sm">
            <Group gap="sm" wrap="nowrap" miw={0}>
              <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label={t("console.menuToggle")} />
              <Text fw={700} fz={18} c={tokens.text} truncate>
                {session?.branch_name}
              </Text>
            </Group>
            <Group gap="xs" wrap="nowrap">
              {install && (
                <Tooltip label={t("staff.install")}>
                  <ActionIcon variant="subtle" color="gray" onClick={install} aria-label={t("staff.install")}>
                    <IconDownload size={20} />
                  </ActionIcon>
                </Tooltip>
              )}
              <LanguageSwitch />
              {user ? (
                <Group gap={8} wrap="nowrap" visibleFrom="xs">
                  <Text fz={14} fw={500} c={tokens.text} truncate maw={160}>
                    {user.full_name}
                  </Text>
                  <Badge variant="light" color={user.role === "admin" ? "orange" : "gray"}>
                    {t(`role.${user.role}`)}
                  </Badge>
                </Group>
              ) : (
                <Button size="xs" leftSection={<IconLock size={14} />} onClick={() => setPinOpen(true)}>
                  {t("staff.tapToUnlock")}
                </Button>
              )}
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p={showLabels ? "md" : "xs"} style={{ borderRight: `1px solid ${tokens.border}` }}>
          <AppShell.Section grow>
            <Stack gap="lg">
              {sections.map((section) => (
                <Stack key={section} gap={2}>
                  {showLabels ? (
                    <Text className="console-nav-section">{t(`console.nav.${section}`)}</Text>
                  ) : (
                    section === "management" && <Box h={1} bg={tokens.border} my={6} />
                  )}
                  {NAV.filter((n) => n.section === section).map((item) => (
                    <NavRow key={item.to} item={item} label={t(item.label)} showLabel={showLabels}
                      badge={item.badge === "openOrders" ? openOrders : undefined} onNavigate={close} />
                  ))}
                </Stack>
              ))}
              {user && !isOwner && showLabels && (
                <Box p={14} style={{ background: tokens.tileBg, boxShadow: tokens.tileBorder, borderRadius: radius.tile }}>
                  <Text fz={13} fw={600} c={tokens.text}>
                    {t("console.ownerToolsHidden.title")}
                  </Text>
                  <Text fz={12} c={tokens.muted} mt={4}>
                    {t(onTablet && user.role === "admin" ? "console.ownerOnTablet.body" : "console.ownerToolsHidden.body")}
                  </Text>
                </Box>
              )}
            </Stack>
          </AppShell.Section>

          <AppShell.Section pt="md" style={{ borderTop: `1px solid ${tokens.border}` }}>
            <Stack gap="xs" align={showLabels ? "stretch" : "center"}>
              {shop?.online_payments_enabled && (
                <Tooltip label={t("staff.onlineOrdersHint")} position="right">
                  <Switch
                    size="sm"
                    color="green"
                    label={showLabels ? (shop.is_accepting_online_orders ? t("staff.onlineOn") : t("staff.onlinePaused")) : undefined}
                    aria-label={t("staff.onlineOrdersHint")}
                    checked={shop.is_accepting_online_orders}
                    onChange={(e) => {
                      if (!ensureUnlocked()) return;
                      setOnline.mutate(e.currentTarget.checked, { onError: (err) => notifyError(t, err) });
                    }}
                  />
                </Tooltip>
              )}
              {user && (
                <Tooltip label={onTablet ? t("staff.lock") : t("console.logout.button")} disabled={showLabels} position="right">
                  <Button variant="subtle" color="red" fullWidth={showLabels} px={showLabels ? undefined : 8}
                    leftSection={showLabels ? <IconLogout size={18} /> : undefined}
                    onClick={onLogOut} loading={logout.isPending}
                    aria-label={onTablet ? t("staff.lock") : t("console.logout.button")}>
                    {showLabels ? (onTablet ? t("staff.lock") : t("console.logout.button")) : <IconLogout size={18} />}
                  </Button>
                </Tooltip>
              )}
              {showLabels && <PoweredBy ta="center" />}
            </Stack>
          </AppShell.Section>
        </AppShell.Navbar>

        <AppShell.Main bg={tokens.pageBg}>
          <Box px={{ base: 16, sm: 32 }} pt={{ base: 20, sm: 28 }} pb={56} maw={1440}>
            {locked && onQueue && (
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
          </Box>
        </AppShell.Main>
      </AppShell>

      <Modal opened={pinOpen && locked} onClose={() => setPinOpen(false)} centered size="md" title={t("pin.title")}>
        <PinPad onUnlocked={() => setPinOpen(false)} />
      </Modal>
      <ConfirmLogoutModal opened={confirmOpen} busy={logout.isPending} onClose={() => setConfirmOpen(false)}
        onConfirm={signOut} />
    </LockContext.Provider>
  );
}
