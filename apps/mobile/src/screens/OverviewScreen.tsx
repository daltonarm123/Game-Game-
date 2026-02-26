import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { kingdomApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { LoadingView, ErrorView } from "../components/LoadingView";
import { StatBadge } from "../components/StatBadge";
import { Colors, Spacing } from "../theme";

function countdown(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Done";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m > 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m ${s}s`;
}

const BLDG_ICONS: Record<string, string> = {
  farm: "🌾", lumberyard: "🪵", quarry: "🪨", horse_farms: "🐴",
  barracks: "⚔️", stables: "🏇", archery_range: "🏹", temples: "🔮",
  castle: "🏰", market: "🏪", walls: "🧱", university: "📚",
};

export function OverviewScreen({ navigation }: any) {
  const { auth } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [taxInput, setTaxInput] = useState("");
  const [taxBusy, setTaxBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const kName = auth?.kingdom?.name || "";

  const load = useCallback(async () => {
    if (!kName) return;
    setError("");
    try {
      const j = await kingdomApi.get(kName, auth!.token);
      setData(j);
      setTaxInput(String(j.kingdom?.tax_rate ?? 25));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kName, auth]);

  useEffect(() => { void load(); }, [load]);

  async function claimBonus() {
    try {
      const j = await kingdomApi.claimDailyBonus(kName, auth!.token);
      setMsg(`Daily bonus claimed! +${j.goldBonus || 0} gold`);
      void load();
    } catch (e: any) {
      Alert.alert("Bonus", String(e?.message || "Already claimed today."));
    }
  }

  async function saveTax() {
    const rate = parseInt(taxInput, 10);
    if (isNaN(rate) || rate < 0 || rate > 40) {
      Alert.alert("Invalid", "Tax rate must be 0–40.");
      return;
    }
    setTaxBusy(true);
    try {
      await kingdomApi.setTax(kName, rate, auth!.token);
      setMsg("Tax rate updated.");
      void load();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setTaxBusy(false); }
  }

  if (loading) return <LoadingView message="Loading kingdom…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  const k = data?.kingdom;
  const buildQueue: any[] = data?.buildQueue || [];
  const season = k?.season || data?.season;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
      >
        {/* Header */}
        <Card>
          <Text style={styles.kingdomName}>👑 {k?.name}</Text>
          <Text style={styles.land}>{Number(k?.land || 0).toLocaleString()} acres</Text>
          {season && <Text style={styles.season}>{season.name} · {Math.floor((season.remainingSeconds || 0) / 3600)}h left</Text>}
        </Card>

        {/* Resources */}
        <Card>
          <Text style={styles.sectionLabel}>Resources</Text>
          <View style={styles.statGrid}>
            <StatBadge label="🌾 Food" value={Number(k?.food || 0).toLocaleString()} />
            <StatBadge label="🪙 Gold" value={Number(k?.gold || 0).toLocaleString()} color={Colors.accent} />
            <StatBadge label="🪵 Wood" value={Number(k?.wood || 0).toLocaleString()} />
            <StatBadge label="🪨 Stone" value={Number(k?.stone || 0).toLocaleString()} />
            <StatBadge label="🐴 Horses" value={Number(k?.horses || 0).toLocaleString()} />
            <StatBadge label="✨ Mana" value={Number(k?.mana || 0).toLocaleString()} color={Colors.mana} />
          </View>
        </Card>

        {/* Troops */}
        <Card>
          <Text style={styles.sectionLabel}>Troops</Text>
          <View style={styles.row}>
            <StatBadge label="🏠 Home" value={Number(k?.troops?.home?.total || 0).toLocaleString()} />
            <StatBadge label="🔨 Training" value={Number(k?.troops?.training?.total || 0).toLocaleString()} />
            <StatBadge label="⚔️ Away" value={Number(k?.troops?.away?.total || 0).toLocaleString()} />
          </View>
        </Card>

        {/* Build queue */}
        {buildQueue.length > 0 && (
          <Card>
            <Text style={styles.sectionLabel}>Build Queue</Text>
            {buildQueue.map((q: any, i: number) => (
              <View key={i} style={styles.queueRow}>
                <Text style={styles.queueIcon}>{BLDG_ICONS[q.building_code] || "🏗️"}</Text>
                <Text style={styles.queueName}>{q.building_code?.replace(/_/g, " ")}</Text>
                <Text style={styles.queueTime}>{countdown(q.ends_at)}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Tax & bonus */}
        <Card>
          <Text style={styles.sectionLabel}>Tax Rate ({k?.tax_rate ?? 25}%)</Text>
          <Text style={styles.muted}>Rate 25–27% = population equilibrium. Below grows pop, above shrinks.</Text>
          <View style={[styles.row, { marginTop: 10, gap: 8 }]}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={taxInput}
              onChangeText={setTaxInput}
              keyboardType="number-pad"
              placeholder="0–40"
              placeholderTextColor={Colors.textMuted}
            />
            <Btn label="Set Tax" onPress={saveTax} loading={taxBusy} small />
          </View>
          <Btn label="🎁 Claim Daily Bonus" onPress={claimBonus} style={{ marginTop: 12 }} />
          {msg ? <Text style={styles.success}>{msg}</Text> : null}
        </Card>

        {/* Nav */}
        <View style={styles.navGrid}>
          <Btn label="🏗️ Buildings" onPress={() => navigation.navigate("Buildings")} style={{ flex: 1 }} small />
          <Btn label="📚 Research" onPress={() => navigation.navigate("Research")} style={{ flex: 1 }} small />
          <Btn label="🏙️ Settlements" onPress={() => navigation.navigate("Settlements")} style={{ flex: 1 }} small />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  kingdomName: { fontSize: 24, fontWeight: "800", color: Colors.accent },
  land: { fontSize: 14, color: Colors.textMuted, marginTop: 2 },
  season: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  queueRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.08)" },
  queueIcon: { fontSize: 18, width: 28 },
  queueName: { flex: 1, fontSize: 13, color: Colors.textMain, textTransform: "capitalize" },
  queueTime: { fontSize: 13, color: Colors.accent, fontWeight: "700" },
  muted: { fontSize: 13, color: Colors.textMuted },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 10, color: Colors.textMain, fontSize: 14 },
  success: { color: Colors.success, fontSize: 13, marginTop: 8 },
  navGrid: { flexDirection: "row", gap: 8 },
});
