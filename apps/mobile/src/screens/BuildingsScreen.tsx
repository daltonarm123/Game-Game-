import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { kingdomApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { ErrorView, LoadingView } from "../components/LoadingView";
import { Colors, Spacing } from "../theme";

const BUILDINGS: Record<string, { icon: string; name: string; desc: string }> = {
  farm:          { icon: "🌾", name: "Farm",          desc: "Produces food each tick" },
  lumberyard:    { icon: "🪵", name: "Lumberyard",    desc: "Produces wood each tick" },
  quarry:        { icon: "🪨", name: "Quarry",         desc: "Produces stone each tick" },
  horse_farms:   { icon: "🐴", name: "Horse Farms",   desc: "Produces horses each tick" },
  barracks:      { icon: "⚔️", name: "Barracks",      desc: "Required to train soldiers" },
  stables:       { icon: "🏇", name: "Stables",       desc: "Required to train cavalry" },
  archery_range: { icon: "🏹", name: "Archery Range", desc: "Required to train archers & spies" },
  temples:       { icon: "🔮", name: "Temples",       desc: "Enables priests and mana generation" },
  castle:        { icon: "🏰", name: "Castle",        desc: "Increases defense and unlocks elites" },
  market:        { icon: "🏪", name: "Market",        desc: "Required to use the marketplace" },
  walls:         { icon: "🧱", name: "Walls",         desc: "Reduces land captured in attacks" },
  university:    { icon: "📚", name: "University",    desc: "Speeds up research" },
};

function countdown(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Done";
  const m = Math.floor(ms / 60000);
  if (m > 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function BuildingsScreen() {
  const { auth } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
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

  async function build(code: string) {
    setBusy(code);
    try {
      const j = await kingdomApi.build(kName, code, auth!.token);
      Alert.alert("Queued", j.message || `${BUILDINGS[code]?.name || code} queued.`);
      void load();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingView message="Loading buildings…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  const buildings: any[] = data?.kingdom?.buildings || [];
  const buildQueue: any[] = data?.buildQueue || [];

  const levelMap: Record<string, number> = {};
  for (const b of buildings) levelMap[b.building_code] = Number(b.level || 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
      >
        {/* Queue */}
        {buildQueue.length > 0 && (
          <Card>
            <Text style={styles.sectionLabel}>Active Build Queue</Text>
            {buildQueue.map((q: any, i: number) => (
              <View key={i} style={styles.queueRow}>
                <Text style={styles.queueIcon}>{BUILDINGS[q.building_code]?.icon || "🏗️"}</Text>
                <Text style={styles.queueName}>{BUILDINGS[q.building_code]?.name || q.building_code}</Text>
                <Text style={styles.queueTime}>{countdown(q.ends_at)}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Buildings list */}
        {Object.entries(BUILDINGS).map(([code, meta]) => {
          const level = levelMap[code] || 0;
          return (
            <Card key={code} style={styles.buildingCard}>
              <View style={styles.buildingHeader}>
                <Text style={styles.buildingIcon}>{meta.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.buildingName}>{meta.name}</Text>
                  <Text style={styles.buildingDesc}>{meta.desc}</Text>
                </View>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>Lv {level}</Text>
                </View>
              </View>
              <Btn
                label={`Build (Lv ${level} → ${level + 1})`}
                onPress={() => build(code)}
                loading={busy === code}
                small
                style={{ marginTop: 8 }}
              />
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
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  queueRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.08)" },
  queueIcon: { fontSize: 18, width: 28 },
  queueName: { flex: 1, fontSize: 13, color: Colors.textMain },
  queueTime: { fontSize: 13, color: Colors.accent, fontWeight: "700" },
  buildingCard: { gap: 0 },
  buildingHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  buildingIcon: { fontSize: 28 },
  buildingName: { fontSize: 16, fontWeight: "700", color: Colors.textMain },
  buildingDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  levelBadge: { backgroundColor: "rgba(216,176,117,0.15)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(216,176,117,0.3)" },
  levelText: { fontSize: 13, fontWeight: "800", color: Colors.accent },
});
