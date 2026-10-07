import { AppShell, Burger, Button, Group, NavLink, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconClipboardList, IconSettings, IconToolsKitchen2, IconUsers } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router";

import { useLogout, useSession } from "../../api/auth";
import { LanguageSwitch } from "../../components/LanguageSwitch";
import { PoweredBy } from "../../components/PoweredBy";

const LINKS = [
  { to: "/admin/menu", label: "admin.nav.menu", icon: IconToolsKitchen2 },
  { to: "/admin/staff", label: "admin.nav.staff", icon: IconUsers },
  { to: "/admin/settings", label: "admin.nav.settings", icon: IconSettings },
];

export default function AdminLayout() {
  const { t } = useTranslation();
  const [opened, { toggle, close }] = useDisclosure();
  const { data: session } = useSession();
  const logout = useLogout();
  const { pathname } = useLocation();

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 220, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="lg">
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700}>{session?.branch_name}</Text>
          </Group>
          <Group gap="xs">
            <LanguageSwitch />
            <Text size="sm" visibleFrom="sm">
              {session?.user?.full_name}
            </Text>
            <Button size="xs" variant="default"
              // The route guard then shows the login page, or the locked board on the shop tablet.
              onClick={() => logout.mutate()}>
              {t("staff.signOut")}
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="sm">
        <Stack gap={4}>
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} component={Link} to={to} label={t(label)} leftSection={<Icon size={18} />}
              active={pathname.startsWith(to)} onClick={close} />
          ))}
          <NavLink component={Link} to="/staff" label={t("admin.nav.board")}
            leftSection={<IconClipboardList size={18} />} />
        </Stack>
        <PoweredBy mt="auto" />
      </AppShell.Navbar>
      <AppShell.Main bg="gray.0">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
