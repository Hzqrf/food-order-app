import { createTheme, type MantineColorsTuple } from "@mantine/core";

// The brand orange. Registered under Mantine's own "orange" key so every orange.N in the app uses it.
// Shade 7 (#c2410c) fills buttons: white text on it passes WCAG AA (5.2:1). Shade 6 (#ea580c) is the accent.
const orange: MantineColorsTuple = [
  "#fff7ed", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c",
  "#f97316", "#ea580c", "#c2410c", "#9a3412", "#7c2d12",
];

const CARD_SHADOW = "0 1px 2px rgba(16, 24, 40, 0.05)";

// Inter is only loaded by the staff console bundle; customer pages fall back to the system font.
export const theme = createTheme({
  colors: { orange },
  primaryColor: "orange",
  primaryShade: 7,
  defaultRadius: "md",
  fontFamily: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  headings: { fontWeight: "600" },
  components: {
    Button: { defaultProps: { radius: 6, fw: 600 } },
    Card: { defaultProps: { radius: 16 }, styles: { root: { boxShadow: CARD_SHADOW } } },
    Badge: { defaultProps: { radius: "xl", tt: "none" } },
  },
});
