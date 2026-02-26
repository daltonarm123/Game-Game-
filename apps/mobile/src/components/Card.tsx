import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { cardStyle } from "../theme";

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({ card: { ...cardStyle, marginBottom: 0 } });
