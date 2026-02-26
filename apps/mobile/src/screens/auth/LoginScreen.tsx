import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { authApi } from "../../api";
import { useAuth } from "../../auth";
import { Colors, Spacing } from "../../theme";

export function LoginScreen({ navigation }: any) {
  const { setAuth } = useAuth();
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    if (!emailOrUsername.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const j = await authApi.login(emailOrUsername.trim(), password);
      setAuth({ token: j.token, user: j.user, kingdom: j.kingdom, expiresAt: j.expiresAt });
    } catch (e: any) {
      setError(String(e?.message || "Login failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.crown}>👑</Text>
            <Text style={styles.title}>Crownforge</Text>
            <Text style={styles.subtitle}>Build. Conquer. Reign.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>

            <Text style={styles.label}>Email or Username</Text>
            <TextInput
              style={styles.input}
              value={emailOrUsername}
              onChangeText={setEmailOrUsername}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Enter email or username"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={[styles.label, { marginTop: Spacing.md }]}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter password"
              placeholderTextColor={Colors.textMuted}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={Colors.textMain} />
              ) : (
                <Text style={styles.btnLabel}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate("Register")} style={styles.link}>
              <Text style={styles.linkText}>No account? Register here</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { flexGrow: 1, justifyContent: "center", padding: Spacing.lg },
  hero: { alignItems: "center", marginBottom: Spacing.xl },
  crown: { fontSize: 56 },
  title: { fontSize: 38, fontWeight: "800", color: Colors.accent, marginTop: 8, letterSpacing: 1 },
  subtitle: { fontSize: 15, color: Colors.textMuted, marginTop: 4 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
  },
  cardTitle: { fontSize: 20, fontWeight: "800", color: Colors.textMain, marginBottom: Spacing.md },
  label: { fontSize: 13, color: Colors.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(216,176,117,0.35)",
    borderRadius: 8,
    padding: 12,
    color: Colors.textMain,
    fontSize: 15,
  },
  error: { color: Colors.error, fontSize: 13, marginTop: 10 },
  btn: {
    backgroundColor: "rgba(216,176,117,0.25)",
    borderWidth: 1,
    borderColor: "rgba(216,176,117,0.5)",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  btnLabel: { color: Colors.textMain, fontWeight: "700", fontSize: 16 },
  link: { alignItems: "center", marginTop: Spacing.md },
  linkText: { color: Colors.accent, fontSize: 14 },
});
