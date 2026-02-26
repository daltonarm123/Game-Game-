import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { kingdomApi, rankingsApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { StatBadge } from "../components/StatBadge";
import { Colors, Spacing } from "../theme";

const SEASON_ICONS: Record<string, string> = { spring: "🌱", summer: "☀️", autumn: "🍂", winter: "❄️" };
const SEASON_COLORS: Record<string, string> = { spring: "#9ddb8f", summer: "#f5c842", autumn: "#d8854a", winter: "#8ac4f5" };

function fmtRemaining(secs: number) {
  if (secs > 86400) return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export function HomeScreen({ navigation }: any) {
  const { auth } = useAuth();
  const [kd, setKd] = useState<any>(null);
  const [top, setTop] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rankJ, kdJ] = await Promise.all([
        rankingsApi.getKingdoms(5),
        auth?.kingdom ? kingdomApi.get(auth.kingdom.name, auth.token) : Promise.resolve(null),
      ]);
      setTop(rankJ.kingdoms || []);
      if (kdJ) setKd(kdJ.kingdom);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [auth]);

  useEffect(() => { void load(); }, [load]);

  const season = kd?.season;
  const seasonIcon = season ? (SEASON_ICONS[season.code] || "🌍") : "🌍";
  const seasonColor = season ? (SEASON_COLORS[season.code] || Colors.accent) : Colors.accent;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
      >
        {/* Hero */}
        <Card style={styles.hero}>
          <Text style={styles.crown}>👑</Text>
          <Text style={styles.heroTitle}>Crownforge</Text>
          <Text style={styles.heroSub}>Build. Conquer. Reign.</Text>
          {kd && (
            <View style={styles.heroStats}>
              <StatBadge label="Land" value={Number(kd.land || 0).toLocaleString()} sub="acres" />
              <StatBadge label="Gold" value={Number(kd.gold || 0).toLocaleString()} color={Colors.accent} />
              <StatBadge label="Networth" value={Number(kd.networth || 0).toLocaleString()} />
            </View>
          )}
        </Card>

        {/* Season */}
        {season && (
          <Card>
            <Text style={styles.sectionLabel}>Current Season</Text>
            <Text style={[styles.seasonName, { color: seasonColor }]}>{seasonIcon} {season.name}</Text>
            <Text style={styles.muted}>{fmtRemaining(season.remainingSeconds)} remaining</Text>
          </Card>
        )}

        {/* Quick actions */}
        <Card>
          <Text style={styles.sectionLabel}>Quick Navigation</Text>
          <View style={styles.btnGrid}>
            <Btn label="👑 Overview" onPress={() => navigation.navigate("KingdomTab")} style={styles.quickBtn} small />
            <Btn label="⚔️ War Room" onPress={() => navigation.navigate("WarTab")} style={styles.quickBtn} small />
            <Btn label="🏪 Market" onPress={() => navigation.navigate("MarketTab")} style={styles.quickBtn} small />
            <Btn label="🤝 Alliance" onPress={() => navigation.navigate("SocialTab")} style={styles.quickBtn} small />
          </View>
        </Card>

        {/* Top kingdoms */}
        <Card>
          <Text style={styles.sectionLabel}>Top Kingdoms</Text>
          {loading ? (
            <Text style={styles.muted}>Loading…</Text>
          ) : top.length === 0 ? (
            <Text style={styles.muted}>No kingdoms yet.</Text>
          ) : (
            top.map((k: any, i: number) => (
              <View key={k.name} style={[styles.rankRow, i === 0 && styles.rankFirst]}>
                <Text style={[styles.rankNum, i === 0 && { color: "#f5c842" }]}>#{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rankName}>{k.name}</Text>
                  {k.alliance_tag ? <Text style={styles.muted}>[{k.alliance_tag}]</Text> : null}
                </View>
                <Text style={styles.rankNw}>{Number(k.networth || 0).toLocaleString()}</Text>
              </View>
            ))
          )}
        </Card>

        {/* Tips */}
        <Card>
          <Text style={styles.sectionLabel}>Getting Started</Text>
          {[
            ["1. Build", "Construct farms, barracks, and temples to grow economy and army."],
            ["2. Train", "Recruit troops — peasants are free, soldiers cost gold."],
            ["3. Expand", "Explore land and found settlements at milestones."],
            ["4. Conquer", "Attack rivals to steal resources and capture land."],
            ["5. Pray", "Build Temples → train Priests → channel mana into blessings."],
          ].map(([title, desc]) => (
            <View key={title} style={styles.tipRow}>
              <Text style={styles.tipTitle}>{title}</Text>
              <Text style={styles.tipDesc}>{desc}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md },
  hero: { alignItems: "center" },
  crown: { fontSize: 44 },
  heroTitle: { fontSize: 32, fontWeight: "800", color: Colors.accent, marginTop: 6 },
  heroSub: { fontSize: 14, color: Colors.textMuted, marginTop: 4, marginBottom: 14 },
  heroStats: { flexDirection: "row", gap: 8, width: "100%" },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  seasonName: { fontSize: 24, fontWeight: "800" },
  muted: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  btnGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickBtn: { flex: 1, minWidth: "45%" },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.08)" },
  rankFirst: { backgroundColor: "rgba(216,176,117,0.06)", borderRadius: 8, paddingHorizontal: 6 },
  rankNum: { fontSize: 16, fontWeight: "800", color: Colors.textMuted, width: 32 },
  rankName: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  rankNw: { fontSize: 14, fontWeight: "700", color: Colors.accent },
  tipRow: { flexDirection: "row", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  tipTitle: { fontSize: 13, fontWeight: "800", color: Colors.accent, width: 80 },
  tipDesc: { flex: 1, fontSize: 13, color: Colors.textMuted },
});
