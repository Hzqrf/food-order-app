import { Box, Table, Text } from "@mantine/core";

import { tokens } from "../../../ui/tokens";

/** The design's ranked bar table: label, a bar for its share, the value and the share in percent. */
export function RankedBars({ rows, headers, format }: {
  rows: { label: string; value: number }[];
  headers: [string, string, string, string];
  format: (v: number) => string;
}) {
  const total = rows.reduce((sum, r) => sum + Math.max(r.value, 0), 0);
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (rows.length === 0) return <Text c="dimmed" fz={14}>—</Text>;
  return (
    <Table verticalSpacing={10} horizontalSpacing={0} withRowBorders={false}>
      <Table.Thead>
        <Table.Tr>
          {headers.map((h, i) => (
            <Table.Th key={h} ta={i >= 2 ? "right" : undefined} fz={12} fw={600} c={tokens.muted} pl={i ? 12 : 0}>{h}</Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => {
          const share = total ? Math.round((Math.max(r.value, 0) / total) * 100) : 0;
          return (
            <Table.Tr key={r.label}>
              <Table.Td fz={14} c={tokens.text} pr={12} style={{ whiteSpace: "nowrap" }}>{r.label}</Table.Td>
              <Table.Td w="45%" pl={12}>
                <Box h={8} bg={tokens.secondaryBg} style={{ borderRadius: 999 }}>
                  <Box h={8} w={`${max > 0 ? (Math.max(r.value, 0) / max) * 100 : 0}%`} bg="orange.6" style={{ borderRadius: 999 }} />
                </Box>
              </Table.Td>
              <Table.Td ta="right" fz={14} fw={600} c={tokens.text} pl={12} style={{ fontVariantNumeric: "tabular-nums" }}>
                {format(r.value)}
              </Table.Td>
              <Table.Td ta="right" fz={13} c={tokens.muted} pl={12} style={{ fontVariantNumeric: "tabular-nums" }}>{share}%</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
