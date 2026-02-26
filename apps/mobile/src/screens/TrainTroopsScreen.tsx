import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { kingdomApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { ErrorView, LoadingView } from "../components/LoadingView";
import { Colors, Spacing } from "../theme";

const TROOPS: Array<{ code: string; icon: string; name: string; desc: string }> = [
  { code: "peasants",       icon: "👨‍🌾", name: "Peasants",       desc: "Free workers. Grow through tax policy." },
  { code: "soldiers",       icon: "⚔️",  name: "Soldiers",       desc: "Basic infantry. Cheap and reliable." },
  { code: "archers",        icon: "🏹",  name: "Archers",        desc: "Ranged units. Beat infantry." },
  { code: "cavalry",        icon: "🐴",  name: "Cavalry",        desc: "Mounted shock troops. Beat archers." },
  { code: "pikemen",        icon: "🗡️",  name: "Pikemen",        desc: "Anti-cavalry specialists." },
  { code: "spies",          icon: "🕵️",  name: "Spies",          desc: "Used for intelligence gathering." },
  { code: "priests",        icon: "🔮",  name: "Priests",        desc: "Generate mana for prayers. Need temples." },
  { code: "elite_soldiers", icon: "⭐",  name: "Elite Soldiers", desc: "Powerful veterans. Earned through battle." },
];

export function TrainTroopsScreen() {
  const { auth } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const kName = auth?.kingdom?.name || "";

  const load = useCallback(async () => {
    setError("");
    try {
      const j = await kingdomApi.get(kName, auth!.token);
      setData(j);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kName, auth]);

  useEffect(() => { void load(); }, [load]);

  async function train(code: string) {
    const qty = parseInt(qtys[code] || "0", 10);
    if (!qty || qty <= 0) { Alert.alert("Error", "Enter a valid quantity."); return; }
    setBusy(code);
    try {
      const j = await kingdomApi.train(kName, code, qty, auth!.token);
      Alert.alert("Training Started", j.message || `Training ${qty} ${code}.`);
      setQtys((q) => ({ ...q, [code]: "" }));
      void load();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingView message="Loading troops…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  const k = data?.kingdom;
  const homeTroops: Record<string, number> = {};
  for (const t of (k?.troops?.homeList || [])) {
    homeTroops[t.troop_code] = Number(t.amount || 0);
  }
  const trainQueue: any[] = data?.trainQueue || [];
  const gold = Number(k?.gold || 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
      >
        <Card>
          <Text style={styles.gold}>🪙 {gold.toLocaleString()} gold available</Text>
          {trainQueue.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 10 }]}>Training Queue</Text>
              {trainQueue.map((q: any, i: number) => (
                <Text key={i} style={styles.queueItem}>
                  {q.quantity}× {q.troop_code?.replace(/_/g, " ")}
                </Text>
              ))}
            </>
          )}
        </Card>

        {TROOPS.map((t) => {
          const current = homeTroops[t.code] || 0;
          return (
            <Card key={t.code}>
              <View style={styles.troopHeader}>
                <Text style={styles.troopIcon}>{t.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.troopName}>{t.name}</Text>
                  <Text style={styles.troopDesc}>{t.desc}</Text>
                </View>
                <View style={styles.currentBadge}>
                  <Text style={styles.currentLabel}>Home</Text>
                  <Text style={styles.currentVal}>{current.toLocaleString()}</Text>
                </View>
              </View>
              <View style={styles.trainRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={qtys[t.code] || ""}
                  onChangeText={(v) => setQtys((q) => ({ ...q, [t.code]: v }))}
                  placeholder="Qty"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                />
                <Btn label="Train" onPress={() => train(t.code)} loading={busy === t.code} small style={{ minWidth: 70 }} />
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  gold: { fontSize: 16, fontWeight: "700", color: Colors.accent },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  queueItem: { fontSize: 13, color: Colors.textMuted, paddingVertical: 2 },
  troopHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  troopIcon: { fontSize: 26 },
  troopName: { fontSize: 15, fontWeight: "700", color: Colors.textMain },
  troopDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  currentBadge: { alignItems: "center", backgroundColor: "rgba(216,176,117,0.1)", borderRadius: 8, padding: 6, minWidth: 52 },
  currentLabel: { fontSize: 10, color: Colors.textMuted },
  currentVal: { fontSize: 15, fontWeight: "800", color: Colors.accent },
  trainRow: { flexDirection: "row", gap: 8 },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 10, color: Colors.textMain, fontSize: 14 },
});
