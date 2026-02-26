import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { Colors } from "../theme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "danger" | "ghost";
  style?: ViewStyle;
  small?: boolean;
};

export function Btn({ label, onPress, disabled, loading, variant = "primary", style, small }: Props) {
  const isDanger = variant === "danger";
  const isGhost = variant === "ghost";
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[
        styles.btn,
        small && styles.small,
        isDanger && styles.danger,
        isGhost && styles.ghost,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={Colors.textMain} />
      ) : (
        <Text style={[styles.label, small && styles.smallLabel]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(216,176,117,0.5)",
    backgroundColor: "rgba(216,176,117,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  small: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  danger: {
    borderColor: "rgba(220,80,80,0.5)",
    backgroundColor: "rgba(200,60,60,0.2)",
  },
  ghost: {
    borderColor: "rgba(216,176,117,0.2)",
    backgroundColor: "transparent",
  },
  disabled: { opacity: 0.45 },
  label: { color: Colors.textMain, fontWeight: "700", fontSize: 14 },
  smallLabel: { fontSize: 12 },
});
