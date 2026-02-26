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

export function RegisterScreen({ navigation }: any) {
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [kingdomName, setKingdomName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRegister() {
    if (!email || !username || !kingdomName || !password || !confirm) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const j = await authApi.register(email.trim(), username.trim(), password, kingdomName.trim());
      setAuth({ token: j.token, user: j.user, kingdom: j.kingdom, expiresAt: j.expiresAt });
    } catch (e: any) {
      setError(String(e?.message || "Registration failed."));
    } finally {
      setLoading(false);
    }
  }

  const Field = ({ label, value, onChangeText, placeholder, secure, keyboardType }: any) => (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        secureTextEntry={secure}
        autoCapitalize="none"
        keyboardType={keyboardType || "default"}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.crown}>👑</Text>
            <Text style={styles.title}>Crownforge</Text>
            <Text style={styles.subtitle}>Forge your legacy</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create Account</Text>

            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            <Field label="Username" value={username} onChangeText={setUsername} placeholder="Your username (3–32 chars)" />
            <Field label="Kingdom Name" value={kingdomName} onChangeText={setKingdomName} placeholder="Name your kingdom" />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="Min 8 characters" secure />
            <Field label="Confirm Password" value={confirm} onChangeText={setConfirm} placeholder="Repeat password" secure />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={Colors.textMain} />
              ) : (
                <Text style={styles.btnLabel}>Create Kingdom</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.link}>
              <Text style={styles.linkText}>Already have an account? Sign in</Text>
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
  hero: { alignItems: "center", marginBottom: Spacing.lg },
  crown: { fontSize: 48 },
  title: { fontSize: 34, fontWeight: "800", color: Colors.accent, marginTop: 6, letterSpacing: 1 },
  subtitle: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
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
  error: { color: Colors.error, fontSize: 13, marginBottom: 10 },
  btn: {
    backgroundColor: "rgba(216,176,117,0.25)",
    borderWidth: 1,
    borderColor: "rgba(216,176,117,0.5)",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  btnLabel: { color: Colors.textMain, fontWeight: "700", fontSize: 16 },
  link: { alignItems: "center", marginTop: Spacing.md },
  linkText: { color: Colors.accent, fontSize: 14 },
});
