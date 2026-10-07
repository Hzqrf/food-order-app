import { Alert, Button, Checkbox, Code, Group, NumberInput, Paper, PasswordInput, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettings, useUpdateSettings } from "../../../api/admin";
import { useChangePassword, useRegisterDevice, useSession, useTotpEnable, useTotpSetup, useUnregisterDevice } from "../../../api/auth";
import { useSetOnlineOrders } from "../../../api/menu";
import type { TotpSetupOut } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Hours = Record<string, [string, string] | null>;

export default function SettingsPage() {
  const { t } = useTranslation();
  const { data: shop, isPending, isError, refetch } = useSettings();
  const update = useUpdateSettings();
  const setOnline = useSetOnlineOrders();
  const [name, setName] = useState("");
  const [prep, setPrep] = useState<number | string>(15);
  const [hours, setHours] = useState<Hours>({});

  useEffect(() => {
    if (!shop) return;
    setName(shop.name);
    setPrep(shop.prep_minutes);
    setHours(Object.fromEntries(DAYS.map((d) => {
      const first = shop.opening_hours[d]?.[0];
      return [d, first ? [first[0], first[1]] : null];
    })));
  }, [shop]);

  if (isPending) return <Text c="dimmed">{t("common.loading")}</Text>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const hoursValid = Object.values(hours).every((r) => !r || (/^\d\d:\d\d$/.test(r[0]) && /^\d\d:\d\d$/.test(r[1])));
  const save = () => update.mutate({
    name: name.trim(),
    prep_minutes: Number(prep),
    opening_hours: Object.fromEntries(DAYS.map((d) => [d, hours[d] ? [hours[d]!] : []])),
  }, {
    onSuccess: () => notifications.show({ color: "green", message: t("admin.saved") }),
    onError: (e) => notifyError(t, e),
  });

  return (
    <Stack maw={720}>
      <Title order={2}>{t("admin.nav.settings")}</Title>

      <Paper withBorder p="md">
        <Group justify="space-between">
          <div>
            <Text fw={600}>{t("admin.settings.onlineOrders")}</Text>
            <Text size="sm" c="dimmed">{t("admin.settings.onlineOrdersHint")}</Text>
          </div>
          <Switch size="lg" color="green" checked={shop.is_accepting_online_orders}
            onChange={(e) => setOnline.mutate(e.currentTarget.checked, {
              onSuccess: () => refetch(), onError: (err) => notifyError(t, err),
            })} />
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Stack>
          <Title order={4}>{t("admin.settings.shop")}</Title>
          <TextInput label={t("admin.settings.shopName")} value={name} onChange={(e) => setName(e.currentTarget.value)} maxLength={100} />
          <NumberInput label={t("admin.settings.prepMinutes")} description={t("admin.settings.prepHint")} min={1} max={240}
            value={prep} onChange={setPrep} w={200} />
          <Text fw={500} size="sm">{t("admin.settings.openingHours")}</Text>
          {DAYS.map((d) => {
            const range = hours[d];
            return (
              <Group key={d} wrap="nowrap">
                <Text w={90} size="sm">{t(`days.${d}`)}</Text>
                <Checkbox label={t("shop.open")} checked={!!range}
                  onChange={(e) => setHours({ ...hours, [d]: e.currentTarget.checked ? ["10:00", "22:00"] : null })} />
                {range && (
                  <>
                    <TextInput type="time" size="xs" value={range[0]} aria-label={t("admin.settings.opens")}
                      onChange={(e) => setHours({ ...hours, [d]: [e.currentTarget.value, range[1]] })} />
                    <Text size="sm">–</Text>
                    <TextInput type="time" size="xs" value={range[1]} aria-label={t("admin.settings.closes")}
                      onChange={(e) => setHours({ ...hours, [d]: [range[0], e.currentTarget.value] })} />
                  </>
                )}
              </Group>
            );
          })}
          <Text size="xs" c="dimmed">{t("admin.settings.hoursHint")}</Text>
          <Group justify="flex-end">
            <Button onClick={save} loading={update.isPending} disabled={!name.trim() || !hoursValid}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Paper>

      <DeviceSection />
      <SecuritySection />
    </Stack>
  );
}

function DeviceSection() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const register = useRegisterDevice();
  const unregister = useUnregisterDevice();
  const registered = !!session?.device_registered;
  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Title order={4}>{t("admin.settings.tablet")}</Title>
        <Text size="sm" c="dimmed">{t("admin.settings.tabletHint")}</Text>
        {registered ? (
          <Group>
            <Text size="sm" c="green.8" fw={600}>{t("admin.settings.tabletRegistered")}</Text>
            <Button variant="default" size="xs" loading={unregister.isPending}
              onClick={() => unregister.mutate(undefined, { onError: (e) => notifyError(t, e) })}>
              {t("admin.settings.unregister")}
            </Button>
          </Group>
        ) : (
          <Button w="fit-content" loading={register.isPending}
            onClick={() => register.mutate(undefined, { onError: (e) => notifyError(t, e) })}>
            {t("admin.settings.register")}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

function SecuritySection() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const setup = useTotpSetup();
  const enable = useTotpEnable();
  const change = useChangePassword();
  const [secret, setSecret] = useState<TotpSetupOut | null>(null);
  const [code, setCode] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  return (
    <Paper withBorder p="md">
      <Stack>
        <Title order={4}>{t("admin.settings.security")}</Title>
        {session?.user?.totp_enabled ? (
          <Text size="sm" c="green.8" fw={600}>{t("admin.settings.totpOn")}</Text>
        ) : secret ? (
          <Stack gap="xs">
            <Text size="sm">{t("admin.settings.totpStep1")}</Text>
            <Code block>{secret.secret}</Code>
            <Text size="sm">{t("admin.settings.totpStep2")}</Text>
            <Group>
              <TextInput inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.currentTarget.value)}
                aria-label={t("login.totp")} />
              <Button disabled={code.length !== 6} loading={enable.isPending}
                onClick={() => enable.mutate(code, {
                  onSuccess: () => { setSecret(null); notifications.show({ color: "green", message: t("admin.settings.totpOn") }); },
                  onError: (e) => notifyError(t, e),
                })}>
                {t("admin.settings.totpConfirm")}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Alert color="yellow" title={t("admin.settings.totpOffTitle")}>
            <Stack gap="xs" align="flex-start">
              <Text size="sm">{t("admin.settings.totpOffBody")}</Text>
              <Button size="xs" loading={setup.isPending}
                onClick={() => setup.mutate(undefined, { onSuccess: setSecret, onError: (e) => notifyError(t, e) })}>
                {t("admin.settings.totpStart")}
              </Button>
            </Stack>
          </Alert>
        )}

        <Text fw={500} size="sm" mt="sm">{t("admin.settings.changePassword")}</Text>
        <Group align="flex-end">
          <PasswordInput label={t("admin.settings.currentPassword")} value={current}
            onChange={(e) => setCurrent(e.currentTarget.value)} />
          <PasswordInput label={t("admin.staff.newPassword")} value={next} onChange={(e) => setNext(e.currentTarget.value)} />
          <Button variant="default" disabled={!current || next.length < 10} loading={change.isPending}
            onClick={() => change.mutate({ current_password: current, new_password: next }, {
              onSuccess: () => { setCurrent(""); setNext(""); notifications.show({ color: "green", message: t("admin.saved") }); },
              onError: (e) => notifyError(t, e),
            })}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
