import {
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  PasswordInput,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDots, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCreateStaff, useResetStaffPassword, useSetStaffActive, useSetStaffPin, useStaffList } from "../../../api/admin";
import type { StaffOut } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";

export default function StaffPage() {
  const { t } = useTranslation();
  const { data: staff, isPending, isError, refetch } = useStaffList();
  const setActive = useSetStaffActive();
  const [creating, setCreating] = useState(false);
  const [pinFor, setPinFor] = useState<StaffOut | null>(null);
  const [passwordFor, setPasswordFor] = useState<StaffOut | null>(null);
  const [deactivating, setDeactivating] = useState<StaffOut | null>(null);

  if (isPending) return <Text c="dimmed">{t("common.loading")}</Text>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("admin.staff.title")}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
          {t("admin.staff.add")}
        </Button>
      </Group>
      <Paper withBorder>
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("admin.staff.name")}</Table.Th>
              <Table.Th>{t("login.username")}</Table.Th>
              <Table.Th visibleFrom="sm">{t("admin.staff.position")}</Table.Th>
              <Table.Th>{t("admin.staff.access")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {staff.map((s) => (
              <Table.Tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                <Table.Td>
                  <Text fw={600}>{s.full_name}</Text>
                  {s.phone && <Text size="xs" c="dimmed">{s.phone}</Text>}
                </Table.Td>
                <Table.Td>{s.username}</Table.Td>
                <Table.Td visibleFrom="sm">{s.position}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Badge variant="light" color={s.role === "admin" ? "grape" : "blue"}>
                      {t(`role.${s.role}`)}
                    </Badge>
                    {s.has_pin && <Badge variant="outline" color="gray">PIN</Badge>}
                    {s.totp_enabled && <Badge variant="outline" color="green">2FA</Badge>}
                    {!s.is_active && <Badge color="gray">{t("admin.staff.inactive")}</Badge>}
                  </Group>
                </Table.Td>
                <Table.Td w={48}>
                  <Menu position="bottom-end">
                    <Menu.Target>
                      <Button variant="subtle" size="compact-sm" aria-label={t("common.more")}>
                        <IconDots size={16} />
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={() => setPinFor(s)}>{t("admin.staff.setPin")}</Menu.Item>
                      <Menu.Item onClick={() => setPasswordFor(s)}>{t("admin.staff.resetPassword")}</Menu.Item>
                      {s.is_active ? (
                        <Menu.Item color="red" onClick={() => setDeactivating(s)}>
                          {t("admin.staff.deactivate")}
                        </Menu.Item>
                      ) : (
                        <Menu.Item onClick={() => setActive.mutate({ id: s.id, active: true }, { onError: (e) => notifyError(t, e) })}>
                          {t("admin.staff.reactivate")}
                        </Menu.Item>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <CreateStaffModal opened={creating} onClose={() => setCreating(false)} />
      <PinModal staff={pinFor} onClose={() => setPinFor(null)} />
      <PasswordModal staff={passwordFor} onClose={() => setPasswordFor(null)} />
      <Modal opened={deactivating !== null} onClose={() => setDeactivating(null)} centered
        title={t("admin.staff.deactivateTitle", { name: deactivating?.full_name })}>
        <Stack>
          <Text size="sm">{t("admin.staff.deactivateBody")}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeactivating(null)}>{t("common.cancel")}</Button>
            <Button color="red" loading={setActive.isPending}
              onClick={() => setActive.mutate({ id: deactivating!.id, active: false }, {
                onSuccess: () => setDeactivating(null), onError: (e) => notifyError(t, e),
              })}>
              {t("admin.staff.deactivate")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

const EMPTY = { role: "staff" as "staff" | "admin", full_name: "", username: "", email: "", phone: "", position: "", password: "", pin: "" };

function CreateStaffModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateStaff();
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.currentTarget.value });
  const valid = f.full_name.trim() && /^[a-z0-9._-]{3,50}$/.test(f.username) && f.password.length >= 10
    && (!f.pin || /^\d{4,6}$/.test(f.pin)) && (f.role === "staff" || f.email.trim());

  const close = () => { setF(EMPTY); onClose(); };
  const save = () => create.mutate({
    role: f.role, full_name: f.full_name.trim(), username: f.username, email: f.email.trim() || null,
    phone: f.phone.trim() || null, position: f.position.trim() || null, password: f.password, pin: f.pin || null,
  }, {
    onSuccess: () => { notifications.show({ color: "green", message: t("admin.saved") }); close(); },
    onError: (e) => notifyError(t, e),
  });

  return (
    <Modal opened={opened} onClose={close} title={t("admin.staff.add")} centered>
      <Stack>
        <SegmentedControl value={f.role} onChange={(v) => setF({ ...f, role: v as "staff" | "admin" })}
          data={[{ value: "staff", label: t("role.staff") }, { value: "admin", label: t("role.admin") }]} />
        <TextInput label={t("admin.staff.name")} required value={f.full_name} onChange={set("full_name")} maxLength={100} />
        <TextInput label={t("login.username")} description={t("admin.staff.usernameHint")} required value={f.username}
          onChange={(e) => setF({ ...f, username: e.currentTarget.value.toLowerCase() })} maxLength={50} />
        {f.role === "admin" && (
          <TextInput label={t("admin.staff.email")} type="email" required value={f.email} onChange={set("email")} />
        )}
        <TextInput label={t("admin.staff.phone")} value={f.phone} onChange={set("phone")} maxLength={20} />
        <TextInput label={t("admin.staff.position")} value={f.position} onChange={set("position")} maxLength={50} />
        <PasswordInput label={t("login.password")} description={t("admin.staff.passwordHint")} required
          value={f.password} onChange={set("password")} />
        <TextInput label={t("admin.staff.pin")} description={t("admin.staff.pinHint")} inputMode="numeric"
          value={f.pin} onChange={set("pin")} maxLength={6} />
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>{t("common.cancel")}</Button>
          <Button disabled={!valid} loading={create.isPending} onClick={save}>{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function PinModal({ staff, onClose }: { staff: StaffOut | null; onClose: () => void }) {
  const { t } = useTranslation();
  const setPin = useSetStaffPin();
  const [pin, setPinValue] = useState("");
  const close = () => { setPinValue(""); onClose(); };
  return (
    <Modal opened={staff !== null} onClose={close} centered title={t("admin.staff.setPinFor", { name: staff?.full_name })}>
      <Stack>
        <TextInput label={t("admin.staff.pin")} description={t("admin.staff.pinHint")} inputMode="numeric" maxLength={6}
          value={pin} onChange={(e) => setPinValue(e.currentTarget.value.replace(/\D/g, ""))} />
        <Button disabled={!/^\d{4,6}$/.test(pin)} loading={setPin.isPending}
          onClick={() => setPin.mutate({ id: staff!.id, pin }, {
            onSuccess: () => { notifications.show({ color: "green", message: t("admin.saved") }); close(); },
            onError: (e) => notifyError(t, e),
          })}>
          {t("common.save")}
        </Button>
      </Stack>
    </Modal>
  );
}

function PasswordModal({ staff, onClose }: { staff: StaffOut | null; onClose: () => void }) {
  const { t } = useTranslation();
  const reset = useResetStaffPassword();
  const [password, setPassword] = useState("");
  const close = () => { setPassword(""); onClose(); };
  return (
    <Modal opened={staff !== null} onClose={close} centered
      title={t("admin.staff.resetPasswordFor", { name: staff?.full_name })}>
      <Stack>
        <PasswordInput label={t("admin.staff.newPassword")} description={t("admin.staff.passwordHint")}
          value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
        <Text size="xs" c="dimmed">{t("admin.staff.resetSignsOut")}</Text>
        <Button disabled={password.length < 10} loading={reset.isPending}
          onClick={() => reset.mutate({ id: staff!.id, password }, {
            onSuccess: () => { notifications.show({ color: "green", message: t("admin.saved") }); close(); },
            onError: (e) => notifyError(t, e),
          })}>
          {t("common.save")}
        </Button>
      </Stack>
    </Modal>
  );
}
