import { SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { LANGUAGES, setLanguage, type Lang } from "../lib/i18n";

export function LanguageSwitch({ size = "xs" }: { size?: "xs" | "sm" }) {
  const { i18n, t } = useTranslation();
  return (
    <SegmentedControl
      size={size}
      aria-label={t("common.language")}
      value={i18n.language}
      onChange={(v) => setLanguage(v as Lang)}
      data={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
    />
  );
}
