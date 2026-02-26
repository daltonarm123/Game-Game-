import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { prayApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { ErrorView, LoadingView } from "../components/LoadingView";
import { Colors, Spacing } from "../theme";

const PRAYERS: Array<{ code: string; name: string; icon: string; effect: string; manaPerDay: number }> = [
  { code: "attacking_wrath",    name: "Attacking Wrath",    icon: "⚔️",  effect: "+5% attack power",           manaPerDay: 500 },
  { code: "steeds_fury",        name: "Steed's Fury",        icon: "🐴",  effect: "+5% mounted attack",         manaPerDay: 600 },
  { code: "falors_gift",        name: "Falor's Gift",        icon: "🪙",  effect: "+5% gold income",            manaPerDay: 700 },
  { code: "fertility_blessing", name: "Fertility Blessing",  icon: "👶",  effect: "+5% population growth",      manaPerDay: 1000 },
  { code: "masons_benefice",    name: "Masons Benefice",     icon: "🪨",  effect: "+10% stone collection",      manaPerDay: 700 },
  { code: "foresters_delight",  name: "Forester's Delight",  icon: "🪵",  effect: "+10% wood collection",       manaPerDay: 700 },
  { code: "nastfurus_healing",  name: "Nastfuru's Healing",  icon: "💚",  effect: "-9% battle casualties",      manaPerDay: 700 },
  { code: "natures_gift",       name: "Nature's Gift",       icon: "🌾",  effect: "+5% food yield",             manaPerDay: 700 },
  { code: "springs_effect",     name: "Springs Effect",      icon: "🐴",  effect: "+9% horse production",       manaPerDay: 1000 },
  { code: "traders_whip",       name: "Trader's Whip",       icon: "🏪",  effect: "+25% market speed",          manaPerDay: 1000 },
];

function countdown(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
}

export function PrayScreen() {
  const { auth } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(PRAYERS[0].code);
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState(false);

  const kName = auth?.kingdom?.name || "";

  const load = useCallback(async () => {
    setError("");
    try {
      const j = await prayApi.get(kName, auth!.token);
      setData(j);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kName, auth]);

  useEffect(() => { void load(); }, [load]);

  async function startPrayer() {
    const d = parseInt(days, 10);
    if (!d || d < 1 || d > 90) { Alert.alert("Error", "Days must be 1–90."); return; }
    const def = PRAYERS.find((p) => p.code === selected)!;
    const cost = def.manaPerDay * d;
    const mana = Number(data?.mana || 0);
    if (mana < cost) { Alert.alert("Not enough mana", `Need ${cost.toLocaleString()}, have ${mana.toLocaleString()}.`); return; }
    setBusy(true);
    try {
      await prayApi.start(kName, selected, d, auth!.token);
      Alert.alert("Prayer Started", `${def.name} is now active for ${d} days.`);
      void load();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally { setBusy(false); }
  }

  async function stopPrayer(id: number, name: string) {
    Alert.alert("Cancel Prayer", `Cancel "${name}"? No mana refund.`, [
      { text: "Keep", style: "cancel" },
      { text: "Cancel Prayer", style: "destructive", onPress: async () => {
        try {
          await prayApi.stop(kName, id, auth!.token);
          void load();
        } catch (e: any) { Alert.alert("Error", String(e?.message || e)); }
      }},
    ]);
  }

  if (loading) return <LoadingView message="Loading Holy Circle…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  const mana = Number(data?.mana || 0);
  const priests = Number(data?.priests || 0);
  const priestCap = Number(data?.priestCap || 0);
  const manaPerHour = Number(data?.manaPerHour || 0);
  const activePrayers: any[] = data?.activePrayers || [];
  const selDef = PRAYERS.find((p) => p.code === selected)!;
  const d = parseInt(days, 10) || 0;
  const totalCost = selDef ? selDef.manaPerDay * d : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.mana} />}
      >
        {/* Stats */}
        <Card>
          <View style={styles.statRow}>
            <View style={styles.manaBadge}>
              <Text style={styles.manaLabel}>✨ Mana</Text>
              <Text style={styles.manaVal}>{mana.toLocaleString()}</Text>
              <Text style={styles.manaRate}>+{manaPerHour}/hr</Text>
            </View>
            <View style={styles.priestBadge}>
              <Text style={styles.manaLabel}>🔮 Priests</Text>
              <Text style={styles.manaVal}>{priests} / {priestCap}</Text>
              <Text style={styles.manaRate}>cap: {priestCap} (5 per Temple)</Text>
            </View>
          </View>
        </Card>

        {/* Active prayers */}
        {activePrayers.length > 0 && (
          <Card>
            <Text style={styles.sectionLabel}>Active Prayers</Text>
            {activePrayers.map((ap: any) => {
              const def = PRAYERS.find((p) => p.code === ap.prayer_code);
              return (
                <View key={ap.id} style={styles.activePrayerRow}>
                  <Text style={styles.activePrayerIcon}>{def?.icon || "✨"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activePrayerName}>{def?.name || ap.prayer_code}</Text>
                    <Text style={styles.muted}>{countdown(ap.ends_at)}</Text>
                  </View>
                  <Btn label="Cancel" onPress={() => stopPrayer(ap.id, def?.name || ap.prayer_code)} variant="danger" small />
                </View>
              );
            })}
          </Card>
        )}

        {/* Start prayer */}
        <Card>
          <Text style={styles.sectionLabel}>Start a Prayer</Text>
          {PRAYERS.map((p) => (
            <TouchableOpacity
              key={p.code}
              style={[styles.prayerOption, selected === p.code && styles.prayerSelected]}
              onPress={() => setSelected(p.code)}
            >
              <Text style={styles.prayerIcon}>{p.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.prayerName}>{p.name}</Text>
                <Text style={styles.muted}>{p.effect}</Text>
              </View>
              <Text style={styles.manaPerDay}>{p.manaPerDay.toLocaleString()}/day</Text>
            </TouchableOpacity>
          ))}
          <View style={[styles.row, { marginTop: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.muted}>Days (1–90)</Text>
              <TextInput
                style={styles.input}
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.costBox}>
              <Text style={styles.muted}>Total cost</Text>
              <Text style={[styles.costVal, { color: mana >= totalCost ? Colors.mana : Colors.error }]}>
                {totalCost.toLocaleString()}
              </Text>
            </View>
          </View>
          <Btn label={busy ? "Starting…" : "✨ Start Prayer"} onPress={startPrayer} loading={busy} style={{ marginTop: 12 }} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  statRow: { flexDirection: "row", gap: 10 },
  manaBadge: { flex: 1, backgroundColor: "rgba(140,100,200,0.12)", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "rgba(180,140,240,0.25)" },
  priestBadge: { flex: 1, backgroundColor: "rgba(216,176,117,0.08)", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "rgba(216,176,117,0.2)" },
  manaLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  manaVal: { fontSize: 22, fontWeight: "800", color: Colors.mana, marginTop: 2 },
  manaRate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  activePrayerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.08)" },
  activePrayerIcon: { fontSize: 22 },
  activePrayerName: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  muted: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  prayerOption: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "transparent", marginBottom: 4 },
  prayerSelected: { backgroundColor: "rgba(140,100,200,0.12)", borderColor: "rgba(180,140,240,0.3)" },
  prayerIcon: { fontSize: 22, width: 30 },
  prayerName: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  manaPerDay: { fontSize: 12, color: Colors.mana, fontWeight: "700" },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 10, color: Colors.textMain, fontSize: 15, marginTop: 6 },
  costBox: { alignItems: "center", minWidth: 90 },
  costVal: { fontSize: 20, fontWeight: "800", marginTop: 6 },
});
