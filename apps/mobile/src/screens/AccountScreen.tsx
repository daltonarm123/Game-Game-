import React, { useCallback, useEffect, useState } from "react";
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { authApi, kingdomApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { Colors, Spacing } from "../theme";

export function AccountScreen({ navigation }: any) {
  const { auth, setAuth } = useAuth();
  const [kData, setKData] = useState<any>(null);
  const [taxInput, setTaxInput] = useState("");
  const [taxBusy, setTaxBusy] = useState(false);
  const [shieldBusy, setShieldBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const kName = auth?.kingdom?.name || "";

  const load = useCallback(async () => {
    if (!kName) return;
    try {
      const j = await kingdomApi.get(kName, auth!.token);
      setKData(j.kingdom);
      setTaxInput(String(j.kingdom?.tax_rate ?? 25));
    } catch { /* silent */ }
  }, [kName, auth]);

  useEffect(() => { void load(); }, [load]);

  async function activateShield() {
    setShieldBusy(true); setMsg("");
    try {
      await kingdomApi.activateShield(kName, auth!.token);
      setMsg("Shield activated!");
      void load();
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setShieldBusy(false); }
  }

  async function saveTax() {
    const rate = parseInt(taxInput, 10);
    if (isNaN(rate) || rate < 0 || rate > 40) { Alert.alert("Invalid", "Tax rate must be 0–40."); return; }
    setTaxBusy(true); setMsg("");
    try {
      await kingdomApi.setTax(kName, rate, auth!.token);
      setMsg("Tax rate updated.");
      void load();
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setTaxBusy(false); }
  }

  async function claimBonus() {
    setMsg("");
    try {
      const j = await kingdomApi.claimDailyBonus(kName, auth!.token);
      setMsg(`Daily bonus claimed! +${j.goldBonus || 0} gold`);
    } catch (e: any) { setMsg(String(e?.message || e)); }
  }

  async function logout() {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: async () => {
        try { await authApi.logout(auth!.token); } catch { /* silent */ }
        setAuth(null);
      }},
    ]);
  }

  const shield = kData?.shield;
  const shieldStatus = shield?.status || "none";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* User info */}
        <Card>
          <Text style={styles.title}>👤 Account</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Username</Text>
            <Text style={styles.infoValue}>{auth?.user?.username}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{auth?.user?.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email Verified</Text>
            <Text style={[styles.infoValue, { color: auth?.user?.emailVerified ? Colors.success : Colors.error }]}>
              {auth?.user?.emailVerified ? "✓ Verified" : "✗ Not Verified"}
            </Text>
          </View>
          {auth?.user?.isAdmin && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>⭐ Admin</Text>
            </View>
          )}
        </Card>

        {/* Kingdom info */}
        {kData && (
          <Card>
            <Text style={styles.sectionLabel}>Kingdom</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{kData.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Land</Text>
              <Text style={styles.infoValue}>{Number(kData.land || 0).toLocaleString()} acres</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Networth</Text>
              <Text style={[styles.infoValue, { color: Colors.accent }]}>{Number(kData.networth || 0).toLocaleString()}</Text>
            </View>
          </Card>
        )}

        {/* Shield */}
        <Card>
          <Text style={styles.sectionLabel}>Shield Protection</Text>
          <Text style={[styles.shieldStatus, {
            color: shieldStatus === "active" ? Colors.success : shieldStatus === "cooldown" ? Colors.textMuted : Colors.error
          }]}>
            {shieldStatus === "active" ? "🛡️ Shield Active" : shieldStatus === "cooldown" ? "⏳ Shield Cooldown" : "❌ No Shield"}
          </Text>
          {shieldStatus === "none" && (
            <Btn label="Activate Shield" onPress={activateShield} loading={shieldBusy} style={{ marginTop: 10 }} />
          )}
        </Card>

        {/* Tax */}
        <Card>
          <Text style={styles.sectionLabel}>Tax Rate</Text>
          <Text style={styles.muted}>25–27% maintains population. Below grows, above shrinks.</Text>
          <View style={[styles.row, { marginTop: 10 }]}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={taxInput}
              onChangeText={setTaxInput}
              keyboardType="number-pad"
              placeholder="0–40"
              placeholderTextColor={Colors.textMuted}
            />
            <Btn label="Save" onPress={saveTax} loading={taxBusy} small />
          </View>
        </Card>

        {/* Daily bonus */}
        <Card>
          <Btn label="🎁 Claim Daily Bonus" onPress={claimBonus} />
        </Card>

        {msg ? <Text style={[styles.msg, { color: msg.startsWith("Tax") || msg.startsWith("Shield") || msg.startsWith("Daily") ? Colors.success : Colors.error }]}>{msg}</Text> : null}

        {/* Admin */}
        {auth?.user?.isAdmin && (
          <Btn label="⭐ Admin Panel" onPress={() => navigation.navigate("Admin")} />
        )}

        {/* Logout */}
        <Btn label="Logout" onPress={logout} variant="danger" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: Colors.textMain, marginBottom: 12 },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  infoLabel: { fontSize: 13, color: Colors.textMuted },
  infoValue: { fontSize: 13, fontWeight: "700", color: Colors.textMain },
  adminBadge: { marginTop: 10, alignSelf: "flex-start", backgroundColor: "rgba(245,200,66,0.15)", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(245,200,66,0.4)" },
  adminBadgeText: { color: "#f5c842", fontWeight: "800", fontSize: 13 },
  shieldStatus: { fontSize: 16, fontWeight: "700" },
  muted: { fontSize: 13, color: Colors.textMuted },
  row: { flexDirection: "row", gap: 8 },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 10, color: Colors.textMain, fontSize: 14 },
  msg: { fontSize: 13, paddingHorizontal: 4 },
});
