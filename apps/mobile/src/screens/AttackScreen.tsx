import React, { useEffect, useState } from "react";
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { kingdomApi, warApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { Colors, Spacing } from "../theme";

const TROOPS = ["soldiers","archers","cavalry","pikemen","elite_soldiers"];
const TROOP_ICONS: Record<string,string> = { soldiers:"⚔️", archers:"🏹", cavalry:"🐴", pikemen:"🗡️", elite_soldiers:"⭐" };

export function AttackScreen() {
  const { auth } = useAuth();
  const [phase, setPhase] = useState<"search"|"attack">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [target, setTarget] = useState<any>(null);
  const [myKingdom, setMyKingdom] = useState<any>(null);
  const [qtys, setQtys] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);

  const kName = auth?.kingdom?.name || "";

  useEffect(() => {
    kingdomApi.get(kName, auth!.token).then((j) => setMyKingdom(j.kingdom)).catch(() => {});
  }, [kName, auth]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const j = await kingdomApi.search(query.trim(), auth!.token);
        setResults(j.kingdoms || []);
      } catch { /* silent */ }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [query, auth]);

  async function doAttack() {
    const troops: Record<string,number> = {};
    let hasAny = false;
    for (const code of TROOPS) {
      const q = parseInt(qtys[code] || "0", 10);
      if (q > 0) { troops[code] = q; hasAny = true; }
    }
    if (!hasAny) { Alert.alert("Error", "Send at least one troop."); return; }
    setBusy(true);
    try {
      const j = await warApi.attack(kName, target.name, troops, auth!.token);
      const r = j.result || j;
      Alert.alert(
        r.attackerWon ? "⚔️ Victory!" : "💀 Defeat",
        [
          r.attackerWon ? "You won the battle!" : "You were defeated.",
          `Land taken: ${Number(r.landTaken || 0).toLocaleString()} acres`,
          `Gold taken: ${Number(r.goldTaken || 0).toLocaleString()}`,
          `Your casualties: ${Number(r.attackerCasualties || 0).toLocaleString()}`,
          `Their casualties: ${Number(r.defenderCasualties || 0).toLocaleString()}`,
        ].join("\n"),
        [{ text: "OK", onPress: () => { setPhase("search"); setTarget(null); setQtys({}); } }]
      );
    } catch (e: any) {
      Alert.alert("Attack Failed", String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const homeTroops: Record<string,number> = {};
  for (const t of (myKingdom?.troops?.homeList || [])) {
    homeTroops[t.troop_code] = Number(t.amount || 0);
  }

  if (phase === "attack" && target) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <Text style={styles.targetLabel}>Target Kingdom</Text>
            <Text style={styles.targetName}>⚔️ {target.name}</Text>
            <Text style={styles.muted}>{target.username} · {Number(target.land || 0).toLocaleString()} acres</Text>
          </Card>

          <Card>
            <Text style={styles.sectionLabel}>Send Troops</Text>
            {TROOPS.map((code) => {
              const home = homeTroops[code] || 0;
              return (
                <View key={code} style={styles.troopRow}>
                  <Text style={styles.troopIcon}>{TROOP_ICONS[code]}</Text>
                  <Text style={[styles.troopName, { flex: 1 }]}>{code.replace(/_/g," ")}</Text>
                  <Text style={styles.homeCount}>{home.toLocaleString()} home</Text>
                  <TextInput
                    style={styles.input}
                    value={qtys[code] || ""}
                    onChangeText={(v) => setQtys((q) => ({ ...q, [code]: v }))}
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                  />
                </View>
              );
            })}
          </Card>

          <View style={styles.row}>
            <Btn label="← Back" onPress={() => { setPhase("search"); setTarget(null); }} style={{ flex: 1 }} variant="ghost" />
            <Btn label="⚔️ Attack!" onPress={doAttack} loading={busy} style={{ flex: 2 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.sectionLabel}>Search for Target</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Kingdom name…"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
          {searching && <Text style={styles.muted}>Searching…</Text>}
        </Card>

        {results.map((k: any) => (
          <TouchableOpacity
            key={k.name}
            style={styles.resultCard}
            onPress={() => { setTarget(k); setPhase("attack"); }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName}>{k.name}</Text>
              <Text style={styles.muted}>{k.username} · {Number(k.land || 0).toLocaleString()} acres</Text>
            </View>
            <Text style={styles.attackArrow}>⚔️ →</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  searchInput: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 12, color: Colors.textMain, fontSize: 15 },
  resultCard: { backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: Colors.cardBorder, padding: 14, flexDirection: "row", alignItems: "center" },
  resultName: { fontSize: 15, fontWeight: "700", color: Colors.textMain },
  attackArrow: { fontSize: 18 },
  muted: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  targetLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  targetName: { fontSize: 22, fontWeight: "800", color: Colors.accent, marginTop: 4 },
  troopRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  troopIcon: { fontSize: 20, width: 28 },
  troopName: { fontSize: 13, color: Colors.textMain, textTransform: "capitalize" },
  homeCount: { fontSize: 12, color: Colors.textMuted },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 6, padding: 8, color: Colors.textMain, fontSize: 14, width: 70, textAlign: "center" },
  row: { flexDirection: "row", gap: 10 },
});
