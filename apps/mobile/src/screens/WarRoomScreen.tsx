import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { warApi } from "../api";
import { useAuth } from "../auth";
import { ActionResultModal } from "../components/ActionResultModal";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { ErrorView, LoadingView } from "../components/LoadingView";
import { StatBadge } from "../components/StatBadge";
import { Colors, Spacing } from "../theme";

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const REPORT_TYPES = ["attack", "explore", "spy"] as const;

export function WarRoomScreen({ navigation }: any) {
  const { auth } = useAuth();
  const [data, setData] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [reportType, setReportType] = useState<"attack" | "explore" | "spy">("attack");
  const [loading, setLoading] = useState(true);
  const [exploring, setExploring] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [resultLines, setResultLines] = useState<string[]>([]);

  const kName = auth?.kingdom?.name || "";

  const load = useCallback(async () => {
    setError("");
    try {
      const [warJ, repJ] = await Promise.all([
        warApi.getWarRoom(kName, auth!.token),
        warApi.getReports(kName, reportType, 1, auth!.token),
      ]);
      setData(warJ);
      setReports(repJ.reports || []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kName, auth, reportType]);

  useEffect(() => { void load(); }, [load]);

  async function explore() {
    setExploring(true);
    try {
      const j = await warApi.explore(kName, auth!.token);
      const lines = [
        `Land gained: ${Number(j.landFound || 0).toLocaleString()} acres`,
        `New land total: ${Number(j.newLand || 0).toLocaleString()} acres`,
        `Troops return in: ${formatDuration(Number(j.returnSeconds || 0))}`,
      ];
      setResultLines(lines);
      setResultVisible(true);
      void load();
    } catch (e: any) {
      Alert.alert("Explore Failed", String(e?.message || e));
    } finally {
      setExploring(false);
    }
  }

  function viewPigeons() {
    setResultVisible(false);
    navigation?.getParent?.()?.navigate("SocialTab", { screen: "Pigeons" });
  }

  if (loading) return <LoadingView message="Loading war room…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  const troops = data?.troops || {};
  const shield = data?.shield;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
      >
        {/* Troop status */}
        <Card>
          <Text style={styles.sectionLabel}>Troop Status</Text>
          <View style={styles.statRow}>
            <StatBadge label="🏠 Home" value={(troops.home?.total || 0).toLocaleString()} />
            <StatBadge label="🔨 Training" value={(troops.training?.total || 0).toLocaleString()} />
            <StatBadge label="⚔️ Away" value={(troops.away?.total || 0).toLocaleString()} />
          </View>
        </Card>

        {/* Shield */}
        <Card>
          <Text style={styles.sectionLabel}>Shield Protection</Text>
          <Text style={[styles.shieldStatus, { color: shield?.status === "active" ? Colors.success : Colors.textMuted }]}>
            {shield?.status === "active" ? "🛡️ Shield Active" : shield?.status === "cooldown" ? "⏳ Shield Cooldown" : "❌ No Shield"}
          </Text>
          {shield?.status === "none" && (
            <Btn label="Activate Shield" onPress={() => navigation.navigate("Account")} style={{ marginTop: 10 }} small />
          )}
        </Card>

        {/* Action buttons */}
        <Card>
          <Text style={styles.sectionLabel}>Actions</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate("TrainTroops")}>
              <Text style={styles.actionIcon}>🔨</Text>
              <Text style={styles.actionLabel}>Train Troops</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate("Attack")}>
              <Text style={styles.actionIcon}>⚔️</Text>
              <Text style={styles.actionLabel}>Attack Kingdom</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate("Guildhall")}>
              <Text style={styles.actionIcon}>🕵️</Text>
              <Text style={styles.actionLabel}>Spy Operation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={explore} disabled={exploring}>
              <Text style={styles.actionIcon}>🗺️</Text>
              <Text style={styles.actionLabel}>{exploring ? "Sending…" : "Explore Land"}</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Reports */}
        <Card>
          <Text style={styles.sectionLabel}>War Reports</Text>
          <View style={styles.tabRow}>
            {REPORT_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, reportType === t && styles.tabActive]}
                onPress={() => setReportType(t)}
              >
                <Text style={[styles.tabLabel, reportType === t && styles.tabLabelActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {reports.length === 0 ? (
            <Text style={styles.muted}>No {reportType} reports yet.</Text>
          ) : (
            reports.slice(0, 10).map((r: any) => (
              <View key={r.id} style={styles.reportRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportTitle}>
                    {reportType === "attack" ? `vs ${r.defender_name || r.target_name}` :
                     reportType === "spy" ? `→ ${r.target_name}` :
                     `+${Number(r.land_gained || 0).toLocaleString()} acres`}
                  </Text>
                  <Text style={styles.reportSub}>{new Date(r.created_at).toLocaleString()}</Text>
                </View>
                <Text style={[styles.reportOutcome, { color: r.success ? Colors.success : Colors.error }]}>
                  {r.success ? "Victory" : "Defeat"}
                </Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
      <ActionResultModal
        visible={resultVisible}
        title="Explore Report"
        lines={resultLines}
        tone="success"
        onClose={() => setResultVisible(false)}
        onViewPigeons={viewPigeons}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  statRow: { flexDirection: "row", gap: 8 },
  shieldStatus: { fontSize: 16, fontWeight: "700" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard: { width: "47%", backgroundColor: "rgba(216,176,117,0.08)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(216,176,117,0.2)", padding: 16, alignItems: "center" },
  actionIcon: { fontSize: 30 },
  actionLabel: { fontSize: 13, fontWeight: "700", color: Colors.textMain, marginTop: 6, textAlign: "center" },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tab: { flex: 1, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: "rgba(216,176,117,0.2)", alignItems: "center" },
  tabActive: { backgroundColor: "rgba(216,176,117,0.2)", borderColor: "rgba(216,176,117,0.6)" },
  tabLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },
  tabLabelActive: { color: Colors.accent },
  reportRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  reportTitle: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  reportSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  reportOutcome: { fontSize: 13, fontWeight: "700" },
  muted: { fontSize: 13, color: Colors.textMuted },
});
