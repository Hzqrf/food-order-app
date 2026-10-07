import { Text, type TextProps } from "@mantine/core";

/** The product brand. Shown to shop staff and owners only; customers see just the shop's name. */
export const PRODUCT_NAME = "Kaunter";

export function PoweredBy(props: TextProps) {
  return (
    <Text size="xs" c="dimmed" ta="center" mt="md" {...props}>
      Powered by <b>{PRODUCT_NAME}</b>
    </Text>
  );
}
