import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "../theme";

type Props = {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
};

export function StatBadge({ label, value, sub, color }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, color ? { color } : null]}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flex: 1,
    backgroundColor: "rgba(216,176,117,0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(216,176,117,0.2)",
    padding: 10,
    alignItems: "center",
    minWidth: 80,
  },
  label: { fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  value: { fontSize: 18, fontWeight: "800", color: Colors.accent },
  sub: { fontSize: 11, color: Colors.textMuted, marginTop: 2, textAlign: "center" },
});
