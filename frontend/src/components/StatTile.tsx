import { Paper, Text } from "@mantine/core";

/** A label and one number. The number is the loud part; the label is sentence case, no colon. */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text fz={28} fw={700} lh={1.2} mt={4}>{value}</Text>
      {hint && <Text size="xs" c="dimmed" mt={2}>{hint}</Text>}
    </Paper>
  );
}
