import { NumberInput, type NumberInputProps } from "@mantine/core";

import { ringgitToSen } from "../lib/money";

/** Edits an amount in sen while showing ringgit. */
export function MoneyInput({ valueSen, onChangeSen, ...props }: Omit<NumberInputProps, "value" | "onChange"> & {
  valueSen: number | null;
  onChangeSen: (sen: number | null) => void;
}) {
  return (
    <NumberInput
      prefix="RM "
      decimalScale={2}
      fixedDecimalScale
      min={0}
      hideControls
      {...props}
      value={valueSen === null ? "" : valueSen / 100}
      onChange={(v) => onChangeSen(v === "" ? null : ringgitToSen(v))}
    />
  );
}
