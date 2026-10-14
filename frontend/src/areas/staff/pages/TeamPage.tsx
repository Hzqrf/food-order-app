import {
  Avatar,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  PasswordInput,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDots, IconPlus } from "@tabler/icons-react";
import { type ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCreateStaff,
  useResetStaffPassword,
  useSetStaffActive,
  useSetStaffPin,
  useStaffList,
  useUpdateStaff,
} from "../../../api/admin";
import type { StaffOut } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";
import { PageHeader } from "../console/PageHeader";
import { SectionCard } from "../console/SectionCard";
import { StatusLabel } from "../console/StatusLabel";
import { tokens } from "../console/tokens";

type Role = "staff" | "admin";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

/** Who can open the console, what each role may do, and their PINs and passwords. */
export default function TeamPage() {
  const { t } = useTranslation();
  const { data: staff, isPending, isError, refetch } = useStaffList();
  const setActive = useSetStaffActive();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffOut | null>(null);
  const [pinFor, setPinFor] = useState<StaffOut | null>(null);
  const [passwordFor, setPasswordFor] = useState<StaffOut | null>(null);
  const [deactivating, setDeactivating] = useState<StaffOut | null>(null);

  const header = (
    <PageHeader title={t("console.team.title")} subtitle={t("console.team.subtitle")}
      actions={
        <Button leftSection={<IconPlus size={18} />} onClick={() => setCreating(true)}>
          {t("admin.staff.add")}
        </Button>
      } />
  );
  if (isPending) return <>{header}<Text c="dimmed">{t("common.loading")}</Text></>;
  if (isError) return <>{header}<ErrorState onRetry={() => refetch()} /></>;

  const roles = new Set(staff.map((s) => s.role)).size;

  return (
    <>
      {header}
      <SectionCard padded={false} title={t("console.team.summary", { count: staff.length, roles })}>
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("admin.staff.name")}</Table.Th>
                <Table.Th>{t("console.team.role")}</Table.Th>
                <Table.Th>{t("admin.staff.position")}</Table.Th>
                <Table.Th>{t("admin.staff.access")}</Table.Th>
                <Table.Th>{t("console.team.status")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {staff.map((s) => (
                <Table.Tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.55 }}>
                  <Table.Td>
                    <Group gap={12} wrap="nowrap">
                      <Avatar radius="xl" color={s.role === "admin" ? "orange" : "gray"}>{initials(s.full_name)}</Avatar>
                      <div>
                        <Text fz={14} fw={500} c={tokens.text}>{s.full_name}</Text>
                        <Text fz={13} c={tokens.muted}>{s.email ?? s.username}{s.phone ? ` · ${s.phone}` : ""}</Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td><StatusLabel kind="role" value={s.role} /></Table.Td>
                  <Table.Td>{s.position ?? "—"}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {s.has_pin && <Badge variant="outline" color="gray">PIN</Badge>}
                      {s.totp_enabled && <Badge variant="outline" color="green">2FA</Badge>}
                      {!s.has_pin && !s.totp_enabled && <Text fz={13} c={tokens.muted}>{t("console.team.passwordOnly")}</Text>}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={s.is_active ? "green" : "gray"}>
                      {s.is_active ? t("console.team.active") : t("admin.staff.inactive")}
                    </Badge>
                  </Table.Td>
                  <Table.Td w={130}>
                    <Group gap={6} wrap="nowrap" justify="flex-end">
                      <Button size="xs" variant="light" color="gray" onClick={() => setEditing(s)}>{t("common.edit")}</Button>
                      <Menu position="bottom-end">
                        <Menu.Target>
                          <Button variant="subtle" color="gray" size="compact-sm" aria-label={t("common.more")}>
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
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </SectionCard>

      <CreateStaffModal opened={creating} onClose={() => setCreating(false)} />
      <EditStaffModal staff={editing} onClose={() => setEditing(null)} />
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
    </>
  );
}

const EMPTY = { role: "staff" as Role, full_name: "", username: "", email: "", phone: "", position: "", password: "", pin: "" };

function CreateStaffModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateStaff();
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.currentTarget.value });
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
        <SegmentedControl value={f.role} onChange={(v) => setF({ ...f, role: v as Role })}
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
        <Text fz={13} c={tokens.muted}>{t("console.team.rolesHint")}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>{t("common.cancel")}</Button>
          <Button disabled={!valid} loading={create.isPending} onClick={save}>{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function EditStaffModal({ staff, onClose }: { staff: StaffOut | null; onClose: () => void }) {
  const { t } = useTranslation();
  const update = useUpdateStaff();
  const [f, setF] = useState({ role: "staff" as Role, full_name: "", email: "", phone: "", position: "" });
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  // Fill the form once per person opened.
  if (staff && loadedFor !== staff.id) {
    setLoadedFor(staff.id);
    setF({ role: staff.role as Role, full_name: staff.full_name, email: staff.email ?? "",
      phone: staff.phone ?? "", position: staff.position ?? "" });
  }
  const close = () => { setLoadedFor(null); onClose(); };
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.currentTarget.value });
  const valid = f.full_name.trim() && (f.role === "staff" || f.email.trim());
  const save = () => update.mutate({
    id: staff!.id, role: f.role, full_name: f.full_name.trim(), email: f.email.trim() || null,
    phone: f.phone.trim() || null, position: f.position.trim() || null,
  }, {
    onSuccess: () => { notifications.show({ color: "green", message: t("admin.saved") }); close(); },
    onError: (e) => notifyError(t, e),
  });

  return (
    <Modal opened={staff !== null} onClose={close} centered title={t("console.team.editTitle", { name: staff?.full_name })}>
      <Stack>
        <SegmentedControl value={f.role} onChange={(v) => setF({ ...f, role: v as Role })}
          data={[{ value: "staff", label: t("role.staff") }, { value: "admin", label: t("role.admin") }]} />
        <TextInput label={t("admin.staff.name")} required value={f.full_name} onChange={set("full_name")} maxLength={100} />
        <TextInput label={t("admin.staff.email")} type="email" required={f.role === "admin"} value={f.email} onChange={set("email")} />
        <TextInput label={t("admin.staff.phone")} value={f.phone} onChange={set("phone")} maxLength={20} />
        <TextInput label={t("admin.staff.position")} value={f.position} onChange={set("position")} maxLength={50} />
        <Text fz={13} c={tokens.muted}>{t("console.team.rolesHint")}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>{t("common.cancel")}</Button>
          <Button disabled={!valid} loading={update.isPending} onClick={save}>{t("common.save")}</Button>
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
