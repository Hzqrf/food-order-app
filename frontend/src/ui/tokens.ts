// Design tokens shared by the Staff Console and the customer app. The only hex values either may use.
export const tokens = {
  pageBg: "#F4F5F7",
  card: "#FFFFFF",
  cardShadow: "0 1px 2px rgba(16, 24, 40, 0.05)",
  tileBg: "#FBFBFB",
  tileBorder: "inset 0 0 0 1px #EAECF0",
  border: "#EAECF0",
  secondaryBg: "#F1F1F1",
  secondaryText: "#48484A",
  dark: "#1D1D1F",
  text: "#1D1D1F",
  body: "#48484A",
  muted: "#6B6B6B",
  subtitle: "#667085",
  success: "#027A48",
  successBg: "#ECFDF3",
  danger: "#F04438",
  dangerBg: "#FEF3F2",
  warning: "#F79009",
  // Customer app
  placeholderBg: "#fff7ed",
  placeholderText: "#c2410c",
  busyBg: "#FEF6E7",
  choiceBorder: "#D0D5DD",
} as const;

export const radius = { button: 6, tile: 12, card: 16 } as const;
