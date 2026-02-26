import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { allianceApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { ErrorView, LoadingView } from "../components/LoadingView";
import { Colors, Spacing } from "../theme";

export function AllianceScreen({ navigation }: any) {
  const { auth } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createTag, setCreateTag] = useState("");
  const [joinSlug, setJoinSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const kName = auth?.kingdom?.name || "";

  const load = useCallback(async () => {
    setError("");
    try {
      const j = await allianceApi.get(kName, auth!.token);
      setData(j);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kName, auth]);

  useEffect(() => { void load(); }, [load]);

  async function createAlliance() {
    if (!createName.trim() || !createTag.trim()) { setMsg("Fill in name and tag."); return; }
    setBusy(true); setMsg("");
    try {
      await allianceApi.create(kName, createName.trim(), createTag.trim(), auth!.token);
      void load();
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  async function joinAlliance() {
    if (!joinSlug.trim()) { setMsg("Enter alliance slug."); return; }
    setBusy(true); setMsg("");
    try {
      await allianceApi.join(kName, joinSlug.trim(), auth!.token);
      void load();
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  async function leaveAlliance() {
    Alert.alert("Leave Alliance", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: async () => {
        try { await allianceApi.leave(kName, auth!.token); void load(); }
        catch (e: any) { Alert.alert("Error", String(e?.message || e)); }
      }},
    ]);
  }

  if (loading) return <LoadingView message="Loading alliance…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  const alliance = data?.alliance;
  const members: any[] = data?.members || [];
  const relations: any[] = data?.relations || [];
  const projects: any[] = data?.projects || [];

  if (!alliance) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {msg ? <Text style={styles.error}>{msg}</Text> : null}
          <Card>
            <Text style={styles.cardTitle}>Create Alliance</Text>
            <TextInput style={styles.input} value={createName} onChangeText={setCreateName} placeholder="Alliance name" placeholderTextColor={Colors.textMuted} />
            <TextInput style={[styles.input, { marginTop: 8 }]} value={createTag} onChangeText={setCreateTag} placeholder="Tag (2–5 chars)" placeholderTextColor={Colors.textMuted} autoCapitalize="characters" maxLength={5} />
            <Btn label="Create Alliance" onPress={createAlliance} loading={busy} style={{ marginTop: 12 }} />
          </Card>
          <Card>
            <Text style={styles.cardTitle}>Join Alliance</Text>
            <TextInput style={styles.input} value={joinSlug} onChangeText={setJoinSlug} placeholder="Alliance slug" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
            <Btn label="Join Alliance" onPress={joinAlliance} loading={busy} style={{ marginTop: 12 }} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
      >
        {/* Header */}
        <Card>
          <Text style={styles.allianceName}>[{alliance.tag}] {alliance.name}</Text>
          <Text style={styles.muted}>{members.length} members · Treasury: {Number(alliance.treasury_gold||0).toLocaleString()} gold</Text>
          <View style={styles.row}>
            <Btn label="📋 Alliance Forums" onPress={() => navigation.navigate("AllianceForums")} small style={{ flex: 1 }} />
            <Btn label="Leave" onPress={leaveAlliance} variant="danger" small style={{ flex: 0 }} />
          </View>
        </Card>

        {/* Members */}
        <Card>
          <Text style={styles.sectionLabel}>Members ({members.length})</Text>
          {members.map((m: any) => (
            <View key={m.kingdom_name} style={styles.memberRow}>
              <Text style={styles.memberName}>{m.kingdom_name}</Text>
              {m.role === "leader" && <Text style={styles.leaderBadge}>Leader</Text>}
              {m.role === "officer" && <Text style={styles.officerBadge}>Officer</Text>}
              <Text style={[styles.muted, { marginLeft: "auto" }]}>{m.username}</Text>
            </View>
          ))}
        </Card>

        {/* Relations */}
        {relations.length > 0 && (
          <Card>
            <Text style={styles.sectionLabel}>Diplomacy</Text>
            {relations.map((r: any) => (
              <View key={r.target_name} style={styles.relationRow}>
                <Text style={[styles.relationType, { color: r.relation_type === "ally" ? Colors.success : Colors.error }]}>
                  {r.relation_type === "ally" ? "🤝" : "⚔️"} {r.relation_type}
                </Text>
                <Text style={styles.muted}>{r.target_name}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <Card>
            <Text style={styles.sectionLabel}>Alliance Projects</Text>
            {projects.map((p: any) => {
              const pct = p.target_gold > 0 ? Math.min(100, Math.floor((p.progress_gold / p.target_gold) * 100)) : 0;
              return (
                <View key={p.building_code} style={styles.projectRow}>
                  <Text style={styles.projectName}>{p.building_code?.replace(/_/g," ")} Lv {p.level}</Text>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
                  </View>
                  <Text style={styles.muted}>{pct}% complete</Text>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  allianceName: { fontSize: 22, fontWeight: "800", color: Colors.accent, marginBottom: 4 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: Colors.textMain, marginBottom: 12 },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  muted: { fontSize: 13, color: Colors.textMuted },
  error: { color: Colors.error, fontSize: 13, paddingHorizontal: Spacing.md },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 12, color: Colors.textMain, fontSize: 15 },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  memberName: { fontSize: 14, fontWeight: "700", color: Colors.textMain, flex: 1 },
  leaderBadge: { fontSize: 11, color: "#f5c842", fontWeight: "800", textTransform: "uppercase", backgroundColor: "rgba(245,200,66,0.1)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  officerBadge: { fontSize: 11, color: Colors.accent, fontWeight: "700", textTransform: "uppercase" },
  relationRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  relationType: { fontSize: 14, fontWeight: "700", textTransform: "capitalize" },
  projectRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  projectName: { fontSize: 14, fontWeight: "700", color: Colors.textMain, textTransform: "capitalize", marginBottom: 6 },
  progressBar: { height: 6, backgroundColor: "rgba(216,176,117,0.1)", borderRadius: 3, overflow: "hidden", marginBottom: 4 },
  progressFill: { height: "100%", backgroundColor: Colors.accent, borderRadius: 3 },
});
