import { Badge, Box, Button, Container, Group, Text } from "@mantine/core";
import { IconShoppingBag } from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useMenu } from "../../../api/menu";
import { cartTotal, indexMenu } from "../../../lib/cart";
import { formatSen } from "../../../lib/money";
import { useCart } from "../cart";

/** Always in reach of a thumb: item count and an estimated total. */
export function CartBar() {
  const { t } = useTranslation();
  const { lines, count } = useCart();
  const { data: menu } = useMenu();
  const items = useMemo(() => indexMenu(menu), [menu]);
  if (count === 0) return null;

  return (
    <Box pos="fixed" bottom={0} left={0} right={0} p="sm" style={{ zIndex: 10, pointerEvents: "none" }}>
      <Container size="sm" px={0}>
        <Button component={Link} to="/cart" size="xl" fullWidth radius="xl" style={{ pointerEvents: "auto" }}
          leftSection={<IconShoppingBag size={22} />}
          rightSection={<Text fw={700}>{formatSen(cartTotal(lines, items))}</Text>}>
          <Group gap="xs">
            {t("customer.viewCart")}
            <Badge color="white" c="orange.8" circle>{count}</Badge>
          </Group>
        </Button>
      </Container>
    </Box>
  );
}
