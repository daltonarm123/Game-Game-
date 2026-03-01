import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { kingdomApi, warApi } from "../api";
import { useAuth } from "../auth";
import { ActionResultModal } from "../components/ActionResultModal";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { Colors, Spacing } from "../theme";

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function GuildhallScreen({ navigation }: any) {
  const { auth } = useAuth();
  const [tab, setTab] = useState<"spy"|"reports">("spy");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [target, setTarget] = useState<any>(null);
  const [spyCount, setSpyCount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [resultTitle, setResultTitle] = useState("");
  const [resultTone, setResultTone] = useState<"success" | "danger" | "info">("info");
  const [resultLines, setResultLines] = useState<string[]>([]);

  const kName = auth?.kingdom?.name || "";

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const j = await warApi.getReports(kName, "spy", 1, auth!.token);
      setReports(j.reports || []);
    } catch { /* silent */ }
    finally { setLoadingReports(false); setRefreshing(false); }
  }, [kName, auth]);

  useEffect(() => { if (tab === "reports") void loadReports(); }, [tab, loadReports]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const j = await kingdomApi.search(query.trim(), auth!.token);
        setResults(j.kingdoms || []);
      } catch { /* silent */ }
    }, 400);
    return () => clearTimeout(t);
  }, [query, auth]);

  async function sendSpy() {
    if (!target) { Alert.alert("Error", "Select a target first."); return; }
    const count = parseInt(spyCount, 10);
    if (!count || count < 1) { Alert.alert("Error", "Enter valid spy count."); return; }
    setBusy(true);
    try {
      const j = await warApi.spy(kName, target.name, count, auth!.token);
      const succeeded = Boolean(j.success);
      const lines = [
        `Target: ${target.name}`,
        `Outcome: ${succeeded ? "Success" : "Failed"}${j.resultLevel ? ` (${String(j.resultLevel)})` : ""}`,
        `Power ratio: ${Number(j.ratio || 0).toFixed(2)}`,
        `Spies sent: ${Number(j.spiesSent || count).toLocaleString()}`,
        `Spies lost: ${Number(j.spyLosses || 0).toLocaleString()}`,
        `Spies returning: ${Number(j.survivorsReturning || 0).toLocaleString()}`,
        `Return time: ${formatDuration(Number(j.returnSeconds || 0))}`,
      ];
      setResultTitle("Spy Report");
      setResultTone(succeeded ? "success" : "danger");
      setResultLines(lines);
      setResultVisible(true);
      setTarget(null); setQuery("");
    } catch (e: any) {
      Alert.alert("Spy Failed", String(e?.message || e));
    } finally { setBusy(false); }
  }

  function viewPigeons() {
    setResultVisible(false);
    navigation?.getParent?.()?.navigate("SocialTab", { screen: "Pigeons" });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.tabs}>
        {(["spy","reports"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>{t === "spy" ? "🕵️ Spy" : "📋 Reports"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={tab === "reports" ? <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadReports(); }} tintColor={Colors.accent} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "spy" && (
          <>
            <Card>
              <Text style={styles.sectionLabel}>Search Target</Text>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={(v) => { setQuery(v); setTarget(null); }}
                placeholder="Kingdom name…"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
              />
              {results.map((k: any) => (
                <TouchableOpacity key={k.name} style={[styles.resultRow, target?.name === k.name && styles.resultSelected]} onPress={() => { setTarget(k); setResults([]); setQuery(k.name); }}>
                  <Text style={styles.resultName}>{k.name}</Text>
                  <Text style={styles.muted}>{Number(k.land||0).toLocaleString()} acres</Text>
                </TouchableOpacity>
              ))}
            </Card>

            <Card>
              <Text style={styles.sectionLabel}>Spy Count</Text>
              <TextInput
                style={styles.input}
                value={spyCount}
                onChangeText={setSpyCount}
                keyboardType="number-pad"
                placeholder="Number of spies"
                placeholderTextColor={Colors.textMuted}
              />
              {target && <Text style={styles.targetInfo}>Target: {target.name}</Text>}
              <Btn label={busy ? "Sending…" : "🕵️ Send Spies"} onPress={sendSpy} loading={busy} style={{ marginTop: 12 }} />
            </Card>
          </>
        )}

        {tab === "reports" && (
          <Card>
            <Text style={styles.sectionLabel}>Spy Reports</Text>
            {loadingReports ? <Text style={styles.muted}>Loading…</Text> :
             reports.length === 0 ? <Text style={styles.muted}>No spy reports yet.</Text> :
             reports.map((r: any) => (
               <View key={r.id} style={styles.reportRow}>
                 <View style={{ flex: 1 }}>
                   <Text style={styles.reportTitle}>→ {r.target_name}</Text>
                   <Text style={styles.muted}>{new Date(r.created_at).toLocaleString()}</Text>
                 </View>
                 <Text style={{ color: r.caught ? Colors.error : Colors.success, fontWeight: "700" }}>
                   {r.caught ? "Caught" : "Success"}
                 </Text>
               </View>
             ))
            }
          </Card>
        )}
      </ScrollView>
      <ActionResultModal
        visible={resultVisible}
        title={resultTitle}
        lines={resultLines}
        tone={resultTone}
        onClose={() => setResultVisible(false)}
        onViewPigeons={viewPigeons}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  tabs: { flexDirection: "row", backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabLabel: { fontSize: 14, color: Colors.textMuted, fontWeight: "600" },
  tabLabelActive: { color: Colors.accent },
  content: { padding: Spacing.md, gap: Spacing.md },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 12, color: Colors.textMain, fontSize: 15 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", padding: 10, borderRadius: 6, marginTop: 6, backgroundColor: "rgba(216,176,117,0.05)" },
  resultSelected: { backgroundColor: "rgba(216,176,117,0.15)", borderWidth: 1, borderColor: Colors.accent },
  resultName: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  targetInfo: { fontSize: 14, color: Colors.accent, fontWeight: "700", marginTop: 8 },
  muted: { fontSize: 13, color: Colors.textMuted },
  reportRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  reportTitle: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
});
