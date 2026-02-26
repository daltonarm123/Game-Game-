import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Colors } from "../theme";

export function LoadingView({ message }: { message?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.accent} />
      {message ? <Text style={styles.msg}>{message}</Text> : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.error}>{message}</Text>
      {onRetry && (
        <Text style={styles.retry} onPress={onRetry}>
          Tap to retry
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  msg: { color: Colors.textMuted, marginTop: 12, fontSize: 14 },
  error: { color: Colors.error, fontSize: 14, textAlign: "center" },
  retry: { color: Colors.accent, marginTop: 12, fontSize: 14, fontWeight: "700" },
});
