import React, { useEffect, useState } from "react";
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { allianceApi, pigeonsApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { LoadingView } from "../components/LoadingView";
import { Colors, Spacing } from "../theme";

export function AllianceForumsScreen() {
  const { auth } = useAuth();
  const [tab, setTab] = useState<"roster"|"message">("roster");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const kName = auth?.kingdom?.name || "";

  useEffect(() => {
    allianceApi.get(kName, auth!.token)
      .then((j) => setData(j))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kName, auth]);

  async function send() {
    if (!to || !subject || !body) { setMsg("Fill in all fields."); return; }
    setSending(true); setMsg("");
    try {
      await pigeonsApi.send(kName, to, subject, body, auth!.token);
      setMsg("Message sent!"); setSubject(""); setBody(""); setTo("");
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setSending(false); }
  }

  if (loading) return <LoadingView message="Loading…" />;

  const alliance = data?.alliance;
  const members: any[] = (data?.members || []).filter((m: any) => m.kingdom_name.toLowerCase() !== kName.toLowerCase());

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.tabs}>
        {(["roster","message"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === "roster" ? "👥 Roster" : "✉️ Message"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!alliance ? (
          <Card><Text style={styles.muted}>You are not in an alliance.</Text></Card>
        ) : tab === "roster" ? (
          <Card>
            <Text style={styles.sectionLabel}>Alliance Roster — [{alliance.tag}] {alliance.name}</Text>
            {members.length === 0 && <Text style={styles.muted}>No other members.</Text>}
            {members.map((m: any) => (
              <View key={m.kingdom_name} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.kingdom_name}</Text>
                  <Text style={styles.muted}>{m.role} · {m.username}</Text>
                </View>
                <Btn label="Message" onPress={() => { setTo(m.kingdom_name); setTab("message"); }} small />
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <Text style={styles.sectionLabel}>Send Message to Ally</Text>
            <Text style={styles.fieldLabel}>To Kingdom</Text>
            <View style={styles.memberPicker}>
              {members.map((m: any) => (
                <TouchableOpacity key={m.kingdom_name} style={[styles.memberOption, to === m.kingdom_name && styles.memberOptionSelected]} onPress={() => setTo(m.kingdom_name)}>
                  <Text style={[styles.muted, to === m.kingdom_name && { color: Colors.accent, fontWeight: "700" }]}>{m.kingdom_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Subject</Text>
            <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={Colors.textMuted} />
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Message</Text>
            <TextInput style={[styles.input, styles.textarea]} value={body} onChangeText={setBody} placeholder="Your message…" placeholderTextColor={Colors.textMuted} multiline numberOfLines={5} textAlignVertical="top" />
            {msg ? <Text style={{ color: msg === "Message sent!" ? Colors.success : Colors.error, marginTop: 8, fontSize: 13 }}>{msg}</Text> : null}
            <Btn label={sending ? "Sending…" : "Send Message"} onPress={send} loading={sending} style={{ marginTop: 12 }} />
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
  tabLabel: { fontSize: 14, color: Colors.textMuted, fontWeight: "600" },
  tabLabelActive: { color: Colors.accent },
  content: { padding: Spacing.md, gap: Spacing.md },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  muted: { fontSize: 13, color: Colors.textMuted },
  fieldLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 6 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  memberName: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  memberPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  memberOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: "rgba(216,176,117,0.2)" },
  memberOptionSelected: { backgroundColor: "rgba(216,176,117,0.15)", borderColor: Colors.accent },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 12, color: Colors.textMain, fontSize: 15 },
  textarea: { height: 100, textAlignVertical: "top" },
});
