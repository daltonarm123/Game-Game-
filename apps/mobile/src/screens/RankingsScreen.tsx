import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { rankingsApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { Colors, Spacing } from "../theme";

export function RankingsScreen() {
  const { auth } = useAuth();
  const [kingdoms, setKingdoms] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const LIMIT = 50;
  const kName = auth?.kingdom?.name?.toLowerCase() || "";

  const load = useCallback(async (off = 0, q = search) => {
    setLoading(true);
    try {
      const j = await rankingsApi.getKingdoms(LIMIT, off, q);
      setKingdoms(off === 0 ? j.kingdoms || [] : (prev: any[]) => [...prev, ...(j.kingdoms || [])]);
      setTotal(j.total || 0);
      setOffset(off);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => void load(0, search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { void load(0); }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(0); }} tintColor={Colors.accent} />}
      >
        <Card>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search kingdoms…"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />
          <Text style={styles.total}>{total.toLocaleString()} kingdoms</Text>
        </Card>

        {kingdoms.map((k: any, i: number) => {
          const isMe = k.name?.toLowerCase() === kName;
          return (
            <View key={k.name} style={[styles.row, isMe && styles.rowHighlight]}>
              <Text style={[styles.rank, i === 0 && { color: "#f5c842" }, i === 1 && { color: "#c0c0c0" }, i === 2 && { color: "#cd7f32" }]}>
                #{(offset + i + 1).toString()}
              </Text>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, isMe && { color: Colors.accent }]}>{k.name}</Text>
                  {k.alliance_tag ? <Text style={styles.tag}>[{k.alliance_tag}]</Text> : null}
                </View>
                <Text style={styles.muted}>{k.username} · {Number(k.land || 0).toLocaleString()} acres</Text>
              </View>
              <Text style={styles.nw}>{Number(k.networth || 0).toLocaleString()}</Text>
            </View>
          );
        })}

        {kingdoms.length < total && (
          <Btn label={loading ? "Loading…" : "Load More"} onPress={() => void load(offset + LIMIT)} loading={loading} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: 4 },
  search: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 12, color: Colors.textMain, fontSize: 15, marginBottom: 8 },
  total: { fontSize: 12, color: Colors.textMuted },
  row: { backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: Colors.cardBorder, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  rowHighlight: { borderColor: Colors.accent, backgroundColor: "rgba(216,176,117,0.08)" },
  rank: { fontSize: 15, fontWeight: "800", color: Colors.textMuted, width: 36 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  tag: { fontSize: 12, color: Colors.textMuted },
  muted: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  nw: { fontSize: 13, fontWeight: "800", color: Colors.accent },
});
