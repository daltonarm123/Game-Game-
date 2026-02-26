import { StyleSheet } from "react-native";

export const Colors = {
  bg: "#0f0f12",
  card: "#1c1c20",
  cardBorder: "rgba(216,176,117,0.28)",
  accent: "#d8b075",
  accentDim: "rgba(216,176,117,0.15)",
  textMain: "#f8efe2",
  textMuted: "#d5c4a9",
  error: "#ffb5a5",
  success: "#a8e6a3",
  mana: "#c8b8f8",
  dangerBg: "rgba(200,60,60,0.2)",
  dangerBorder: "rgba(220,80,80,0.4)",
  tabBar: "#121215",
  tabBarBorder: "rgba(216,176,117,0.2)",
};

export const Typography = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: "800", color: Colors.textMain },
  h2: { fontSize: 22, fontWeight: "800", color: Colors.textMain },
  h3: { fontSize: 17, fontWeight: "700", color: Colors.textMain },
  body: { fontSize: 14, color: Colors.textMain },
  muted: { fontSize: 13, color: Colors.textMuted },
  label: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  accent: { fontSize: 16, fontWeight: "700", color: Colors.accent },
  mono: { fontSize: 15, fontWeight: "800", color: Colors.accent, fontVariant: ["tabular-nums"] },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

export const Layout = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  grid2: {
    flexDirection: "row",
    gap: Spacing.md,
  },
});

export const cardStyle = {
  backgroundColor: Colors.card,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: Colors.cardBorder,
  padding: Spacing.md,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 8,
  elevation: 4,
};
