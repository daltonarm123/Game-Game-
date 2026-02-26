import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { pigeonsApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { Colors, Spacing } from "../theme";

export function PigeonsScreen() {
  const { auth } = useAuth();
  const [tab, setTab] = useState<"inbox"|"compose">("inbox");
  const [inbox, setInbox] = useState<any[]>([]);
  const [outbox, setOutbox] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<number|null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const kName = auth?.kingdom?.name || "";

  const load = useCallback(async () => {
    try {
      const j = await pigeonsApi.get(kName, auth!.token);
      setInbox(j.inbox || []);
      setOutbox(j.outbox || []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [kName, auth]);

  useEffect(() => { void load(); }, [load]);

  async function markRead(mailId: number) {
    try { await pigeonsApi.read(kName, mailId, auth!.token); void load(); }
    catch { /* silent */ }
  }

  async function send() {
    if (!to || !subject || !body) { setMsg("Fill in all fields."); return; }
    setSending(true); setMsg("");
    try {
      await pigeonsApi.send(kName, to.trim(), subject.trim(), body.trim(), auth!.token);
      setMsg("Pigeon sent!"); setTo(""); setSubject(""); setBody("");
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setSending(false); }
  }

  const unread = inbox.filter((m: any) => !m.read_at).length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.tabs}>
        {(["inbox","compose"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === "inbox" ? `📬 Inbox${unread > 0 ? ` (${unread})` : ""}` : "✉️ Compose"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={Colors.accent} />}
      >
        {tab === "inbox" && (
          <>
            {loading ? <Text style={styles.muted}>Loading…</Text> :
             inbox.length === 0 ? <Card><Text style={styles.muted}>No messages.</Text></Card> :
             inbox.map((m: any) => (
               <TouchableOpacity
                 key={m.id}
                 onPress={() => { setExpanded(expanded === m.id ? null : m.id); if (!m.read_at) void markRead(m.id); }}
               >
                 <Card style={[styles.mailCard, !m.read_at && styles.unreadCard]}>
                   <View style={styles.mailHeader}>
                     {!m.read_at && <View style={styles.unreadDot} />}
                     <Text style={styles.mailFrom}>From: {m.from_kingdom_name}</Text>
                     <Text style={styles.mailDate}>{new Date(m.created_at).toLocaleDateString()}</Text>
                   </View>
                   <Text style={styles.mailSubject}>{m.subject}</Text>
                   {expanded === m.id && <Text style={[styles.muted, { marginTop: 8 }]}>{m.body}</Text>}
                 </Card>
               </TouchableOpacity>
             ))
            }

            {outbox.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>Sent</Text>
                {outbox.map((m: any) => (
                  <TouchableOpacity key={m.id} onPress={() => setExpanded(expanded === m.id ? null : m.id)}>
                    <Card style={styles.mailCard}>
                      <View style={styles.mailHeader}>
                        <Text style={styles.mailFrom}>To: {m.to_kingdom_name}</Text>
                        <Text style={styles.mailDate}>{new Date(m.created_at).toLocaleDateString()}</Text>
                      </View>
                      <Text style={styles.mailSubject}>{m.subject}</Text>
                      {expanded === m.id && <Text style={[styles.muted, { marginTop: 8 }]}>{m.body}</Text>}
                    </Card>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}

        {tab === "compose" && (
          <Card>
            <Text style={styles.sectionLabel}>New Message</Text>
            <Text style={styles.fieldLabel}>To Kingdom</Text>
            <TextInput style={styles.input} value={to} onChangeText={setTo} placeholder="Kingdom name" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Subject</Text>
            <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={Colors.textMuted} />
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Message</Text>
            <TextInput style={[styles.input, styles.textarea]} value={body} onChangeText={setBody} placeholder="Your message…" placeholderTextColor={Colors.textMuted} multiline numberOfLines={6} textAlignVertical="top" />
            {msg ? <Text style={{ color: msg === "Pigeon sent!" ? Colors.success : Colors.error, marginTop: 8, fontSize: 13 }}>{msg}</Text> : null}
            <Btn label={sending ? "Sending…" : "🕊️ Send Pigeon"} onPress={send} loading={sending} style={{ marginTop: 12 }} />
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
  content: { padding: Spacing.md, gap: 8 },
  muted: { fontSize: 13, color: Colors.textMuted },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  sectionHeader: { fontSize: 13, color: Colors.textMuted, fontWeight: "700", paddingHorizontal: 4, marginTop: 8 },
  mailCard: { marginBottom: 0 },
  unreadCard: { borderColor: "rgba(216,176,117,0.5)" },
  mailHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  mailFrom: { flex: 1, fontSize: 13, color: Colors.textMuted },
  mailDate: { fontSize: 12, color: Colors.textMuted },
  mailSubject: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  fieldLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 6 },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 12, color: Colors.textMain, fontSize: 15 },
  textarea: { height: 120, textAlignVertical: "top" },
});
