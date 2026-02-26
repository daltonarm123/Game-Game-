import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { pigeonsApi, rankingsApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { Colors, Spacing } from "../theme";

export function ForumsScreen() {
  const { auth } = useAuth();
  const [tab, setTab] = useState<"activity"|"message">("activity");
  const [kingdoms, setKingdoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const kName = auth?.kingdom?.name || "";

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const j = await rankingsApi.getKingdoms(20);
      setKingdoms(j.kingdoms || []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void loadActivity(); }, [loadActivity]);

  async function send() {
    if (!to || !subject || !body) { setMsg("Fill in all fields."); return; }
    setSending(true); setMsg("");
    try {
      await pigeonsApi.send(kName, to.trim(), subject.trim(), body.trim(), auth!.token);
      setMsg("Message sent!"); setTo(""); setSubject(""); setBody("");
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setSending(false); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.tabs}>
        {(["activity","message"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === "activity" ? "🌍 Kingdom Activity" : "✉️ Send Message"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadActivity(); }} tintColor={Colors.accent} />}
      >
        {tab === "activity" && (
          <Card>
            <View style={styles.header}>
              <Text style={styles.sectionLabel}>Active Kingdoms</Text>
              <Btn label="Refresh" onPress={() => void loadActivity()} small />
            </View>
            {loading ? <Text style={styles.muted}>Loading…</Text> :
             kingdoms.map((k: any, i: number) => (
               <View key={k.name} style={styles.kingdomRow}>
                 <Text style={styles.rank}>#{i + 1}</Text>
                 <View style={{ flex: 1 }}>
                   <Text style={styles.kingdomName}>{k.name}</Text>
                   {k.alliance_tag ? <Text style={styles.tag}>[{k.alliance_tag}]</Text> : null}
                 </View>
                 <Text style={styles.nw}>{Number(k.networth || 0).toLocaleString()} NW</Text>
               </View>
             ))
            }
          </Card>
        )}

        {tab === "message" && (
          <Card>
            <Text style={styles.sectionLabel}>Send a Pigeon</Text>
            <Text style={styles.fieldLabel}>To Kingdom</Text>
            <TextInput style={styles.input} value={to} onChangeText={setTo} placeholder="Kingdom name" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Subject</Text>
            <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={Colors.textMuted} />
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Message</Text>
            <TextInput style={[styles.input, styles.textarea]} value={body} onChangeText={setBody} placeholder="Your message…" placeholderTextColor={Colors.textMuted} multiline numberOfLines={5} textAlignVertical="top" />
            {msg ? <Text style={{ color: msg === "Message sent!" ? Colors.success : Colors.error, marginTop: 8, fontSize: 13 }}>{msg}</Text> : null}
            <Btn label={sending ? "Sending…" : "🕊️ Send"} onPress={send} loading={sending} style={{ marginTop: 12 }} />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  tabs: { flexDirection: "row", backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },
  tabLabelActive: { color: Colors.accent },
  content: { padding: Spacing.md, gap: Spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  muted: { fontSize: 13, color: Colors.textMuted },
  fieldLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 6 },
  kingdomRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  rank: { fontSize: 13, color: Colors.textMuted, width: 28 },
  kingdomName: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  tag: { fontSize: 12, color: Colors.textMuted },
  nw: { fontSize: 13, color: Colors.accent, fontWeight: "700" },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 12, color: Colors.textMain, fontSize: 15 },
  textarea: { height: 100, textAlignVertical: "top" },
});
