import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { settlementApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { ErrorView, LoadingView } from "../components/LoadingView";
import { Colors, Spacing } from "../theme";

const SETTLEMENT_TYPES = [
  { code: "small_town", label: "Small Town", slots: 3 },
  { code: "medium_town", label: "Medium Town", slots: 5 },
  { code: "large_town", label: "Large Town", slots: 8 },
  { code: "small_city", label: "Small City", slots: 12 },
  { code: "medium_city", label: "Medium City", slots: 17 },
  { code: "large_city", label: "Large City", slots: 25 },
];

export function SettlementsScreen() {
  const { auth } = useAuth();
  const [data, setData] = useState<any>(null);
  const [buildingTypes, setBuildingTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [foundType, setFoundType] = useState("small_town");
  const [foundName, setFoundName] = useState("");
  const [foundBusy, setFoundBusy] = useState(false);
  const [buildBusy, setBuildBusy] = useState<string|null>(null);
  const [expandedId, setExpandedId] = useState<number|null>(null);

  const kName = auth?.kingdom?.name || "";

  const load = useCallback(async () => {
    setError("");
    try {
      const [sJ, bJ] = await Promise.all([
        settlementApi.get(kName, auth!.token),
        settlementApi.getBuildingTypes(kName, auth!.token),
      ]);
      setData(sJ);
      setBuildingTypes(bJ.buildingTypes || []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kName, auth]);

  useEffect(() => { void load(); }, [load]);

  async function foundSettlement() {
    if (!foundName.trim()) { Alert.alert("Error", "Enter a settlement name."); return; }
    setFoundBusy(true);
    try {
      await settlementApi.found(kName, foundType, foundName.trim(), auth!.token);
      setFoundName("");
      void load();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally { setFoundBusy(false); }
  }

  async function buildBuilding(settlementId: number, buildingCode: string) {
    const key = `${settlementId}-${buildingCode}`;
    setBuildBusy(key);
    try {
      await settlementApi.buildBuilding(kName, settlementId, buildingCode, auth!.token);
      void load();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally { setBuildBusy(null); }
  }

  if (loading) return <LoadingView message="Loading settlements…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  const settlements: any[] = data?.settlements || [];
  const canFound: boolean = data?.canFoundSettlement ?? false;
  const land: number = Number(data?.land || 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
      >
        <Card>
          <Text style={styles.title}>🏙️ Settlements</Text>
          <Text style={styles.muted}>{land.toLocaleString()} acres · {settlements.length} settlements</Text>
        </Card>

        {canFound && (
          <Card>
            <Text style={styles.sectionLabel}>Found New Settlement</Text>
            {SETTLEMENT_TYPES.map((t) => (
              <TouchableOpacity key={t.code} style={[styles.typeOpt, foundType === t.code && styles.typeOptSelected]} onPress={() => setFoundType(t.code)}>
                <Text style={[styles.muted, foundType === t.code && { color: Colors.accent, fontWeight: "700" }]}>{t.label} ({t.slots} slots)</Text>
              </TouchableOpacity>
            ))}
            <TextInput style={[styles.input, { marginTop: 10 }]} value={foundName} onChangeText={setFoundName} placeholder="Settlement name" placeholderTextColor={Colors.textMuted} />
            <Btn label={foundBusy ? "Founding…" : "Found Settlement"} onPress={foundSettlement} loading={foundBusy} style={{ marginTop: 10 }} />
          </Card>
        )}

        {settlements.length === 0 ? (
          <Card><Text style={styles.muted}>No settlements yet. You need {3000..toLocaleString()} acres to found your first settlement.</Text></Card>
        ) : (
          settlements.map((s: any) => {
            const expanded = expandedId === s.id;
            const buildings: any[] = s.buildings || [];
            const queue: any[] = s.buildQueue || [];
            return (
              <Card key={s.id}>
                <TouchableOpacity onPress={() => setExpandedId(expanded ? null : s.id)} style={styles.settlementHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settlementName}>{s.name}</Text>
                    <Text style={styles.muted}>{s.settlement_type?.replace(/_/g," ")} · {buildings.length} buildings</Text>
                  </View>
                  <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
                </TouchableOpacity>

                {expanded && (
                  <View style={{ marginTop: 10 }}>
                    {queue.length > 0 && (
                      <View style={styles.queueBox}>
                        <Text style={styles.sectionLabel}>Building</Text>
                        {queue.map((q: any, i: number) => (
                          <Text key={i} style={styles.muted}>{q.building_code?.replace(/_/g," ")} — {new Date(q.ends_at).toLocaleTimeString()}</Text>
                        ))}
                      </View>
                    )}
                    <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Buildings</Text>
                    {buildings.map((b: any) => (
                      <View key={b.id} style={styles.buildingRow}>
                        <Text style={styles.buildingName}>{b.building_code?.replace(/_/g," ")}</Text>
                        <Text style={styles.muted}>Lv {b.level}</Text>
                        <Btn label="Upgrade" onPress={() => {}} small style={{ marginLeft: "auto" }} />
                      </View>
                    ))}
                    <Text style={[styles.sectionLabel, { marginTop: 10 }]}>Build</Text>
                    {buildingTypes.slice(0, 6).map((bt: any) => (
                      <View key={bt.code} style={styles.buildingRow}>
                        <Text style={[styles.buildingName, { flex: 1 }]}>{bt.name || bt.code?.replace(/_/g," ")}</Text>
                        <Btn label="Build" onPress={() => buildBuilding(s.id, bt.code)} loading={buildBusy === `${s.id}-${bt.code}`} small />
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: Colors.textMain },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  muted: { fontSize: 13, color: Colors.textMuted },
  typeOpt: { padding: 8, borderRadius: 6, borderWidth: 1, borderColor: "rgba(216,176,117,0.15)", marginBottom: 4 },
  typeOptSelected: { backgroundColor: "rgba(216,176,117,0.12)", borderColor: Colors.accent },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 12, color: Colors.textMain, fontSize: 15 },
  settlementHeader: { flexDirection: "row", alignItems: "center" },
  settlementName: { fontSize: 16, fontWeight: "800", color: Colors.accent },
  chevron: { color: Colors.textMuted, fontSize: 14 },
  queueBox: { backgroundColor: "rgba(216,176,117,0.05)", borderRadius: 6, padding: 8, marginBottom: 6 },
  buildingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  buildingName: { fontSize: 13, color: Colors.textMain, textTransform: "capitalize" },
});
