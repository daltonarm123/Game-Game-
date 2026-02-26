import React, { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { allianceApi } from "../api";
import { useAuth } from "../auth";
import { Card } from "../components/Card";
import { Colors, Spacing } from "../theme";

export function EmbassyScreen() {
  const { auth } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const kName = auth?.kingdom?.name || "";

  useEffect(() => {
    allianceApi.get(kName, auth!.token)
      .then((j) => setData(j))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kName, auth]);

  const relations: any[] = data?.relations || [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.title}>🏛️ Embassy</Text>
          <Text style={styles.muted}>
            The Embassy manages diplomatic relationships with other alliances.
            Forge alliances to gain protection, or declare enemies to justify raiding.
          </Text>
        </Card>

        <Card>
          <Text style={styles.sectionLabel}>Current Relations</Text>
          {loading ? <Text style={styles.muted}>Loading…</Text> :
           !data?.alliance ? <Text style={styles.muted}>Join an alliance to manage diplomacy.</Text> :
           relations.length === 0 ? <Text style={styles.muted}>No diplomatic relations set.</Text> :
           relations.map((r: any) => (
             <View key={r.id || r.target_name} style={styles.relationRow}>
               <Text style={[styles.relationType, { color: r.relation_type === "ally" ? Colors.success : Colors.error }]}>
                 {r.relation_type === "ally" ? "🤝 Ally" : "⚔️ Enemy"}
               </Text>
               <Text style={styles.relationName}>{r.target_name}</Text>
               {r.note ? <Text style={styles.muted}>{r.note}</Text> : null}
             </View>
           ))
          }
        </Card>

        <Card>
          <Text style={styles.sectionLabel}>Diplomacy Guide</Text>
          {[
            ["🤝 Ally", "Allied alliances cannot attack each other. Coordinate land grabs and mutual defense."],
            ["⚔️ Enemy", "Declaring enemies signals hostile intent. Use this to justify repeated raiding."],
            ["🤝 Neutral", "Default state. No special protections or permissions."],
          ].map(([title, desc]) => (
            <View key={title as string} style={styles.tipRow}>
              <Text style={styles.tipTitle}>{title}</Text>
              <Text style={styles.muted}>{desc}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: Colors.textMain, marginBottom: 8 },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  muted: { fontSize: 13, color: Colors.textMuted },
  relationRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)", gap: 4 },
  relationType: { fontSize: 14, fontWeight: "700" },
  relationName: { fontSize: 14, color: Colors.textMain },
  tipRow: { paddingVertical: 8, gap: 4, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  tipTitle: { fontSize: 14, fontWeight: "700", color: Colors.accent },
});
