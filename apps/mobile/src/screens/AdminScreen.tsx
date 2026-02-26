import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { adminApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { ErrorView, LoadingView } from "../components/LoadingView";
import { Colors, Spacing } from "../theme";

type Tab = "overview" | "kingdoms" | "users";

export function AdminScreen() {
  const { auth } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [stats, kingdoms, users] = await Promise.all([
        adminApi.getStats(auth!.token),
        adminApi.getKingdoms(auth!.token),
        adminApi.getUsers(auth!.token),
      ]);
      setData({ stats, kingdoms: kingdoms.kingdoms || [], users: users.users || [] });
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth]);

  useEffect(() => { void load(); }, [load]);

  async function banUser(userId: string, username: string, ban: boolean) {
    setBusy(username);
    try {
      if (ban) {
        await adminApi.ban(userId, "Banned by admin", auth!.token);
      } else {
        await adminApi.unban(userId, auth!.token);
      }
      Alert.alert("Done", `${username} has been ${ban ? "banned" : "unbanned"}.`);
      void load();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleAdmin(userId: string, username: string, makeAdmin: boolean) {
    setBusy(username + "_admin");
    try {
      await adminApi.setAdmin(userId, makeAdmin, auth!.token);
      Alert.alert("Done", `${username} is ${makeAdmin ? "now" : "no longer"} an admin.`);
      void load();
    } catch (e: any) {
      Alert.alert("Error", String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingView message="Loading admin panel…" />;
  if (error) return <ErrorView message={error} onRetry={load} />;

  const stats = data?.stats || {};
  const kingdoms: any[] = data?.kingdoms || [];
  const users: any[] = data?.users || [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.tabs}>
        {(["overview", "kingdoms", "users"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === "overview" ? "📊 Overview" : t === "kingdoms" ? "🏰 Kingdoms" : "👥 Users"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />
        }
      >
        {tab === "overview" && (
          <>
            <Card>
              <Text style={styles.sectionLabel}>Server Stats</Text>
              <View style={styles.statGrid}>
                <StatItem label="Total Users" value={stats.totalUsers ?? "—"} />
                <StatItem label="Total Kingdoms" value={stats.totalKingdoms ?? "—"} />
                <StatItem label="Active 24h" value={stats.activeToday ?? "—"} />
                <StatItem label="Total Land" value={Number(stats.totalLand || 0).toLocaleString()} />
                <StatItem label="Total Gold" value={Number(stats.totalGold || 0).toLocaleString()} />
                <StatItem label="Banned" value={stats.bannedUsers ?? "—"} color={Colors.error} />
              </View>
            </Card>
            <Card>
              <Text style={styles.sectionLabel}>Admin Tips</Text>
              <Text style={styles.tip}>• Switch to Kingdoms tab to view all kingdoms sorted by networth.</Text>
              <Text style={styles.tip}>• Switch to Users tab to ban/unban players or grant admin.</Text>
              <Text style={styles.tip}>• Pull to refresh any tab to reload data.</Text>
            </Card>
          </>
        )}

        {tab === "kingdoms" && (
          <Card>
            <Text style={styles.sectionLabel}>All Kingdoms ({kingdoms.length})</Text>
            {kingdoms.length === 0 && <Text style={styles.muted}>No kingdoms found.</Text>}
            {kingdoms.map((k: any, i: number) => (
              <View key={k.name} style={styles.kingdomRow}>
                <Text style={styles.rank}>#{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kingdomName}>{k.name}</Text>
                  <Text style={styles.kingdomSub}>{k.username} · {Number(k.land || 0).toLocaleString()} acres</Text>
                </View>
                <Text style={styles.nw}>{Number(k.networth || 0).toLocaleString()} NW</Text>
              </View>
            ))}
          </Card>
        )}

        {tab === "users" && (
          <Card>
            <Text style={styles.sectionLabel}>All Users ({users.length})</Text>
            {users.length === 0 && <Text style={styles.muted}>No users found.</Text>}
            {users.map((u: any) => (
              <View key={u.username} style={styles.userRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.userHeader}>
                    <Text style={styles.userName}>{u.username}</Text>
                    {u.is_admin && <Text style={styles.adminBadge}>ADMIN</Text>}
                    {u.is_banned && <Text style={styles.bannedBadge}>BANNED</Text>}
                  </View>
                  <Text style={styles.userEmail}>{u.email}</Text>
                  {u.is_banned && u.banned_reason ? (
                    <Text style={styles.banReason}>Reason: {u.banned_reason}</Text>
                  ) : null}
                </View>
                <View style={styles.userActions}>
                  <Btn
                    label={u.is_banned ? "Unban" : "Ban"}
                    onPress={() => {
                      Alert.alert(
                        u.is_banned ? "Unban User" : "Ban User",
                        `${u.is_banned ? "Unban" : "Ban"} ${u.username}?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Confirm", style: "destructive", onPress: () => banUser(String(u.id), u.username, !u.is_banned) },
                        ]
                      );
                    }}
                    loading={busy === u.username}
                    variant={u.is_banned ? "ghost" : "danger"}
                    small
                    style={{ marginBottom: 4 }}
                  />
                  <Btn
                    label={u.is_admin ? "Demote" : "Make Admin"}
                    onPress={() => {
                      Alert.alert(
                        u.is_admin ? "Remove Admin" : "Grant Admin",
                        `${u.is_admin ? "Remove admin from" : "Grant admin to"} ${u.username}?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Confirm", onPress: () => toggleAdmin(String(u.id), u.username, !u.is_admin) },
                        ]
                      );
                    }}
                    loading={busy === u.username + "_admin"}
                    variant="ghost"
                    small
                  />
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={statStyles.item}>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  item: { width: "48%", backgroundColor: "rgba(216,176,117,0.08)", borderRadius: 8, padding: 10, marginBottom: 8, alignItems: "center" },
  label: { fontSize: 10, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  value: { fontSize: 20, fontWeight: "800", color: Colors.accent },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  tabs: { flexDirection: "row", backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  tabLabelActive: { color: Colors.accent },
  content: { padding: Spacing.md, gap: Spacing.md },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  muted: { fontSize: 13, color: Colors.textMuted },
  statGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  tip: { fontSize: 13, color: Colors.textMuted, lineHeight: 22 },
  kingdomRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  rank: { fontSize: 13, color: Colors.textMuted, width: 28 },
  kingdomName: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  kingdomSub: { fontSize: 12, color: Colors.textMuted },
  nw: { fontSize: 13, color: Colors.accent, fontWeight: "700" },
  userRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  userHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  userName: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  adminBadge: { fontSize: 10, fontWeight: "800", color: Colors.accent, backgroundColor: "rgba(216,176,117,0.15)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  bannedBadge: { fontSize: 10, fontWeight: "800", color: Colors.error, backgroundColor: "rgba(255,181,165,0.15)", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  userEmail: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  banReason: { fontSize: 12, color: Colors.error, marginTop: 2 },
  userActions: { alignItems: "stretch", minWidth: 90 },
});
