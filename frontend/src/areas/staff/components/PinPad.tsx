import { Button, Group, SimpleGrid, Stack, Text, UnstyledButton } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useDeviceStaff, usePinUnlock } from "../../../api/auth";
import { isApiError } from "../../../api/client";
import type { DeviceStaff } from "../../../api/types";

/** Tap your name, enter your PIN. Used on the shared shop tablet instead of typing a password. */
export function PinPad({ onUnlocked }: { onUnlocked?: () => void }) {
  const { t } = useTranslation();
  const { data: people = [], isPending } = useDeviceStaff(true);
  const unlock = usePinUnlock();
  const [who, setWho] = useState<DeviceStaff | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (value: string) => {
    if (!who || value.length < 4) return;
    unlock.mutate(
      { user_id: who.id, pin: value },
      {
        onSuccess: () => onUnlocked?.(),
        onError: (e) => {
          setPin("");
          setError(isApiError(e, "account_locked") || isApiError(e, "too_many_requests")
            ? t("pin.locked")
            : t("pin.wrong"));
        },
      },
    );
  };

  const press = (d: string) => {
    setError(null);
    setPin((p) => (p.length < 6 ? p + d : p));
  };

  // Physical keyboards work too.
  useEffect(() => {
    if (!who) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") submit(pin);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!who) {
    return (
      <Stack>
        <Text fw={600} ta="center">
          {t("pin.whoAreYou")}
        </Text>
        {!isPending && people.length === 0 && (
          <Text c="dimmed" ta="center" size="sm">
            {t("pin.noStaff")}
          </Text>
        )}
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          {people.map((p) => (
            <Button key={p.id} size="xl" variant="light" onClick={() => setWho(p)}>
              {p.full_name}
            </Button>
          ))}
        </SimpleGrid>
      </Stack>
    );
  }

  return (
    <Stack align="center" gap="sm">
      <Text fw={600}>{t("pin.enterPin", { name: who.full_name })}</Text>
      <Group gap="xs" h={24} aria-live="polite">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <Text key={i} size="xl" c={i < pin.length ? "dark" : "gray.4"}>
            {"●"}
          </Text>
        ))}
      </Group>
      <Text c="red" size="sm" h={20}>
        {error}
      </Text>
      <SimpleGrid cols={3} spacing="sm" w={260}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} label={d} onClick={() => press(d)} />
        ))}
        <Key label={t("common.back")} small onClick={() => { setWho(null); setPin(""); setError(null); }} />
        <Key label="0" onClick={() => press("0")} />
        <Key label={t("pin.ok")} small primary disabled={pin.length < 4 || unlock.isPending}
          onClick={() => submit(pin)} />
      </SimpleGrid>
    </Stack>
  );
}

function Key({ label, onClick, small, primary, disabled }: {
  label: string; onClick: () => void; small?: boolean; primary?: boolean; disabled?: boolean;
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      disabled={disabled}
      h={64}
      style={{
        borderRadius: 12,
        textAlign: "center",
        fontSize: small ? 16 : 26,
        fontWeight: 600,
        background: primary ? "var(--mantine-color-orange-6)" : "var(--mantine-color-gray-1)",
        color: primary ? "white" : undefined,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </UnstyledButton>
  );
}
