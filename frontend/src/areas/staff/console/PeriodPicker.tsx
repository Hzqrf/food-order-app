import { Group, SegmentedControl, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { addDays, businessToday, monthStart } from "../../../lib/dates";

export type Period = { mode: "daily" | "monthly" | "range"; date_from: string; date_to: string };

/** Last day of the month that `month` (YYYY-MM) names, capped at today for the current month. */
function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const today = businessToday();
  return last > today ? today : last;
}

export function defaultPeriod(mode: Period["mode"] = "daily"): Period {
  const today = businessToday();
  if (mode === "monthly") return { mode, date_from: monthStart(today), date_to: today };
  if (mode === "range") return { mode, date_from: addDays(today, -6), date_to: today };
  return { mode, date_from: today, date_to: today };
}

/** Daily / Monthly / Date range, with the date inputs each mode needs. */
export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useTranslation();
  return (
    <Group gap="sm" wrap="wrap">
      <SegmentedControl value={value.mode} onChange={(m) => onChange(defaultPeriod(m as Period["mode"]))}
        data={[
          { value: "daily", label: t("console.period.daily") },
          { value: "monthly", label: t("console.period.monthly") },
          { value: "range", label: t("console.period.range") },
        ]} />
      {value.mode === "daily" && (
        <TextInput type="date" aria-label={t("console.period.day")} value={value.date_from} max={businessToday()}
          onChange={(e) => e.currentTarget.value && onChange({ ...value, date_from: e.currentTarget.value, date_to: e.currentTarget.value })} />
      )}
      {value.mode === "monthly" && (
        <TextInput type="month" aria-label={t("console.period.month")} value={value.date_from.slice(0, 7)}
          max={businessToday().slice(0, 7)}
          onChange={(e) => {
            const month = e.currentTarget.value;
            if (month) onChange({ ...value, date_from: `${month}-01`, date_to: monthEnd(month) });
          }} />
      )}
      {value.mode === "range" && (
        <Group gap={8} wrap="nowrap">
          <TextInput type="date" aria-label={t("admin.filters.from")} value={value.date_from} max={value.date_to}
            onChange={(e) => e.currentTarget.value && onChange({ ...value, date_from: e.currentTarget.value })} />
          <Text fz={14} c="dimmed">{t("console.period.to")}</Text>
          <TextInput type="date" aria-label={t("admin.filters.to")} value={value.date_to} min={value.date_from}
            max={businessToday()}
            onChange={(e) => e.currentTarget.value && onChange({ ...value, date_to: e.currentTarget.value })} />
        </Group>
      )}
    </Group>
  );
}
