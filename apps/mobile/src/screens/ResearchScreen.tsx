import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { researchApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { ErrorView, LoadingView } from "../components/LoadingView";
import { Colors, Spacing } from "../theme";

function countdown(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Done";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ResearchScreen() {
  const { auth } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string|null>(null);
  const [expandedCat, setExpandedCat] = useState<string|null>(null);

  const kName = auth?.kingdom?.name || "";

  const load = useCallback(async () => {
    setError("");
    try {
      const j = await researchApi.get(kName, auth!.token);
      setData(j);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kName, auth]);

  useEffect(() => { void load(); }, [load]);

  async function startResearch(techCode: string) {
    setBusy(techCode);
    try {
      const j = await researchApi.start(kName, techCode, auth!.token);
      Alert.alert("Research Started", j.message || `Researching ${techCode.replace(/_/g," ")}.`);
      void load();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingView message="Loading research…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  const queue = data?.queue || [];
  const techs: any[] = data?.techs || [];
  const levels: Record<string,number> = {};
  for (const t of techs) levels[t.tech_code] = Number(t.level || 0);

  // Group by category
  const byCategory: Record<string, any[]> = {};
  for (const t of techs) {
    const cat = t.category || "General";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(t);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
      >
        {/* Queue */}
        {queue.length > 0 && (
          <Card>
            <Text style={styles.sectionLabel}>Research Queue</Text>
            {queue.map((q: any, i: number) => (
              <View key={i} style={styles.queueRow}>
                <Text style={styles.queueName}>📚 {q.tech_code?.replace(/_/g," ")}</Text>
                <Text style={styles.queueTime}>{countdown(q.ends_at)}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Tech tree by category */}
        {Object.entries(byCategory).map(([cat, catTechs]) => (
          <Card key={cat}>
            <TouchableOpacity onPress={() => setExpandedCat(expandedCat === cat ? null : cat)} style={styles.catHeader}>
              <Text style={styles.catName}>{cat}</Text>
              <Text style={styles.chevron}>{expandedCat === cat ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {expandedCat === cat && catTechs.map((t: any) => {
              const level = Number(t.level || 0);
              const locked = t.locked;
              const goldCost = Number(t.next_cost_gold || 0);
              const timeSec = Number(t.next_time_seconds || 0);
              const timeStr = timeSec > 3600 ? `${Math.floor(timeSec/3600)}h ${Math.floor((timeSec%3600)/60)}m` : `${Math.floor(timeSec/60)}m`;
              return (
                <View key={t.tech_code} style={[styles.techRow, locked && styles.techLocked]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.techName, locked && { color: Colors.textMuted }]}>{t.name || t.tech_code?.replace(/_/g," ")}</Text>
                    {t.effect && <Text style={styles.techEffect}>{t.effect}</Text>}
                    {locked && t.requires && <Text style={styles.techReq}>Requires: {t.requires?.replace(/_/g," ")}</Text>}
                    {!locked && <Text style={styles.techCost}>🪙 {goldCost.toLocaleString()} · ⏱ {timeStr}</Text>}
                  </View>
                  <View style={styles.techRight}>
                    <Text style={styles.techLevel}>Lv {level}</Text>
                    {!locked && (
                      <Btn label="Research" onPress={() => startResearch(t.tech_code)} loading={busy === t.tech_code} small style={{ marginTop: 4 }} />
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
        ))}

        {Object.keys(byCategory).length === 0 && (
          <Card><Text style={styles.muted}>No research available.</Text></Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  queueRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  queueName: { fontSize: 14, color: Colors.textMain, textTransform: "capitalize" },
  queueTime: { fontSize: 14, color: Colors.accent, fontWeight: "700" },
  catHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  catName: { fontSize: 16, fontWeight: "800", color: Colors.accent },
  chevron: { color: Colors.textMuted },
  techRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)", flexDirection: "row", alignItems: "flex-start", gap: 8 },
  techLocked: { opacity: 0.45 },
  techName: { fontSize: 14, fontWeight: "700", color: Colors.textMain, textTransform: "capitalize" },
  techEffect: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  techReq: { fontSize: 12, color: Colors.error, marginTop: 2 },
  techCost: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  techRight: { alignItems: "center", minWidth: 70 },
  techLevel: { fontSize: 12, fontWeight: "800", color: Colors.accent },
  muted: { fontSize: 13, color: Colors.textMuted },
});
