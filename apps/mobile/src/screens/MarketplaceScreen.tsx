import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { marketApi } from "../api";
import { useAuth } from "../auth";
import { Btn } from "../components/Btn";
import { Card } from "../components/Card";
import { Colors, Spacing } from "../theme";

const RESOURCES = ["food","wood","stone","horses"] as const;
const ICONS: Record<string,string> = { food:"🌾", wood:"🪵", stone:"🪨", horses:"🐴" };
const LABELS: Record<string,string> = { food:"Food", wood:"Wood", stone:"Stone", horses:"Horses" };

export function MarketplaceScreen() {
  const { auth } = useAuth();
  const [tab, setTab] = useState<"browse"|"sell"|"history">("browse");
  const [filter, setFilter] = useState("all");
  const [listings, setListings] = useState<any[]>([]);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState("");
  const [buyQtys, setBuyQtys] = useState<Record<number,string>>({});
  const [buyBusy, setBuyBusy] = useState<number|null>(null);
  const [sellResource, setSellResource] = useState<typeof RESOURCES[number]>("food");
  const [sellQty, setSellQty] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellBusy, setSellBusy] = useState(false);

  const kName = auth?.kingdom?.name || "";

  const loadBrowse = useCallback(async () => {
    setLoading(true);
    try {
      const j = await marketApi.browse(filter === "all" ? undefined : filter);
      setListings(j.listings || []);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const j = await marketApi.history(kName, auth!.token);
      setMyListings(j.myListings || []);
      setTrades(j.trades || []);
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [kName, auth]);

  useEffect(() => {
    if (tab === "browse") void loadBrowse();
    else if (tab === "history") void loadHistory();
  }, [tab, filter, loadBrowse, loadHistory]);

  async function buy(listingId: number, available: number, pricePerUnit: number) {
    const qty = parseInt(buyQtys[listingId] || String(available), 10);
    if (!qty || qty < 1) { Alert.alert("Error", "Enter a valid quantity."); return; }
    setBuyBusy(listingId);
    try {
      const j = await marketApi.buy(kName, listingId, qty, auth!.token);
      setMsg(`Bought ${j.quantity.toLocaleString()} for ${j.totalGold.toLocaleString()} gold.`);
      void loadBrowse();
    } catch (e: any) { Alert.alert("Error", String(e?.message || e)); }
    finally { setBuyBusy(null); }
  }

  async function sell() {
    const qty = parseInt(sellQty, 10);
    const price = parseInt(sellPrice, 10);
    if (!qty || qty < 100) { Alert.alert("Error", "Min quantity 100."); return; }
    if (!price || price < 1) { Alert.alert("Error", "Enter valid price."); return; }
    setSellBusy(true);
    try {
      await marketApi.list(kName, sellResource, qty, price, auth!.token);
      setMsg(`Listed ${qty.toLocaleString()} ${LABELS[sellResource]}.`);
      setSellQty(""); setSellPrice("");
      void loadHistory();
    } catch (e: any) { Alert.alert("Error", String(e?.message || e)); }
    finally { setSellBusy(false); }
  }

  async function cancelListing(listingId: number) {
    Alert.alert("Cancel Listing", "Unsold resources will be refunded.", [
      { text: "Keep", style: "cancel" },
      { text: "Cancel Listing", style: "destructive", onPress: async () => {
        try { await marketApi.cancel(kName, listingId, auth!.token); void loadHistory(); }
        catch (e: any) { Alert.alert("Error", String(e?.message || e)); }
      }},
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.tabs}>
        {(["browse","sell","history"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>{t === "browse" ? "Browse" : t === "sell" ? "Sell" : "History"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); tab === "browse" ? void loadBrowse() : void loadHistory(); }} tintColor={Colors.accent} />}
      >
        {msg ? <Text style={styles.msgText}>{msg}</Text> : null}

        {tab === "browse" && (
          <>
            <View style={styles.filterRow}>
              {["all", ...RESOURCES].map((r) => (
                <TouchableOpacity key={r} style={[styles.filterBtn, filter === r && styles.filterActive]} onPress={() => setFilter(r)}>
                  <Text style={[styles.filterLabel, filter === r && styles.filterLabelActive]}>{r === "all" ? "All" : `${ICONS[r]} ${LABELS[r]}`}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {loading ? <Text style={styles.muted}>Loading…</Text> :
             listings.length === 0 ? <Text style={styles.muted}>No active listings.</Text> :
             listings.map((l: any) => {
               const available = Number(l.quantity_remaining);
               const isOwn = l.seller_kingdom_name?.toLowerCase() === kName.toLowerCase();
               return (
                 <Card key={l.id} style={{ opacity: isOwn ? 0.5 : 1 }}>
                   <View style={styles.listingHeader}>
                     <Text style={styles.listingResource}>{ICONS[l.resource]} {LABELS[l.resource]}</Text>
                     <Text style={styles.listingPrice}>{Number(l.price_per_unit).toLocaleString()} gold/unit</Text>
                   </View>
                   <Text style={styles.muted}>Seller: {l.seller_kingdom_name} · {available.toLocaleString()} available</Text>
                   {!isOwn && (
                     <View style={[styles.row, { marginTop: 8 }]}>
                       <TextInput
                         style={[styles.input, { flex: 1 }]}
                         value={buyQtys[l.id] ?? String(available)}
                         onChangeText={(v) => setBuyQtys((m) => ({ ...m, [l.id]: v }))}
                         keyboardType="number-pad"
                         placeholder="Qty"
                         placeholderTextColor={Colors.textMuted}
                       />
                       <Btn label="Buy" onPress={() => buy(l.id, available, Number(l.price_per_unit))} loading={buyBusy === l.id} small style={{ minWidth: 60 }} />
                     </View>
                   )}
                 </Card>
               );
             })
            }
          </>
        )}

        {tab === "sell" && (
          <Card>
            <Text style={styles.sectionLabel}>Create Listing</Text>
            <Text style={styles.muted}>5% tax on all sales. Resources deducted immediately. Expires in 7 days.</Text>
            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Resource</Text>
            <View style={styles.resourcePicker}>
              {RESOURCES.map((r) => (
                <TouchableOpacity key={r} style={[styles.resourceOpt, sellResource === r && styles.resourceOptSelected]} onPress={() => setSellResource(r)}>
                  <Text style={{ fontSize: 20 }}>{ICONS[r]}</Text>
                  <Text style={[styles.muted, sellResource === r && { color: Colors.accent, fontWeight: "700" }]}>{LABELS[r]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Quantity (min 100)</Text>
            <TextInput style={styles.input} value={sellQty} onChangeText={setSellQty} keyboardType="number-pad" placeholder="e.g. 10000" placeholderTextColor={Colors.textMuted} />
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Price per unit (gold)</Text>
            <TextInput style={styles.input} value={sellPrice} onChangeText={setSellPrice} keyboardType="number-pad" placeholder="e.g. 5" placeholderTextColor={Colors.textMuted} />
            {sellQty && sellPrice && (
              <Text style={[styles.muted, { marginTop: 8 }]}>
                Total: {(parseInt(sellQty||"0") * parseInt(sellPrice||"0")).toLocaleString()} gold
                {" "}→ You receive: {Math.floor(parseInt(sellQty||"0") * parseInt(sellPrice||"0") * 0.95).toLocaleString()} gold
              </Text>
            )}
            <Btn label={sellBusy ? "Listing…" : "Post Listing"} onPress={sell} loading={sellBusy} style={{ marginTop: 12 }} />
          </Card>
        )}

        {tab === "history" && (
          <>
            <Card>
              <Text style={styles.sectionLabel}>My Active Listings</Text>
              {myListings.filter((l: any) => l.status === "active").length === 0
                ? <Text style={styles.muted}>No active listings.</Text>
                : myListings.filter((l: any) => l.status === "active").map((l: any) => (
                    <View key={l.id} style={styles.histRow}>
                      <Text style={styles.histResource}>{ICONS[l.resource]} {LABELS[l.resource]}</Text>
                      <Text style={styles.muted}>{Number(l.quantity_remaining).toLocaleString()} left · {Number(l.price_per_unit).toLocaleString()}/unit</Text>
                      <Btn label="Cancel" onPress={() => cancelListing(l.id)} variant="danger" small />
                    </View>
                  ))
              }
            </Card>
            <Card>
              <Text style={styles.sectionLabel}>Trade History</Text>
              {trades.length === 0
                ? <Text style={styles.muted}>No trades yet.</Text>
                : trades.map((t: any) => (
                    <View key={t.id} style={styles.tradeRow}>
                      <Text style={[styles.tradeSide, { color: t.trade_side === "buy" ? Colors.success : Colors.accent }]}>
                        {t.trade_side === "buy" ? "BUY" : "SELL"}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.muted}>{ICONS[t.resource]} {LABELS[t.resource]} × {Number(t.quantity).toLocaleString()}</Text>
                        <Text style={styles.muted}>{t.trade_side === "buy" ? t.seller_kingdom_name : t.buyer_kingdom_name}</Text>
                      </View>
                      <Text style={[styles.tradeGold, { color: t.trade_side === "buy" ? Colors.error : Colors.success }]}>
                        {t.trade_side === "buy" ? `-${Number(t.total_gold).toLocaleString()}` : `+${Number(t.seller_receives).toLocaleString()}`}
                      </Text>
                    </View>
                  ))
              }
            </Card>
          </>
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
  msgText: { color: Colors.success, fontSize: 13, paddingHorizontal: 4 },
  muted: { fontSize: 13, color: Colors.textMuted },
  sectionLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  fieldLabel: { fontSize: 13, color: Colors.textMuted, marginBottom: 6 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filterBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: "rgba(216,176,117,0.2)" },
  filterActive: { backgroundColor: "rgba(216,176,117,0.2)", borderColor: Colors.accent },
  filterLabel: { fontSize: 12, color: Colors.textMuted },
  filterLabelActive: { color: Colors.accent, fontWeight: "700" },
  listingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  listingResource: { fontSize: 15, fontWeight: "700", color: Colors.textMain },
  listingPrice: { fontSize: 14, fontWeight: "700", color: Colors.accent },
  row: { flexDirection: "row", gap: 8 },
  input: { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(216,176,117,0.35)", borderRadius: 8, padding: 10, color: Colors.textMain, fontSize: 14 },
  resourcePicker: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  resourceOpt: { flex: 1, alignItems: "center", padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "rgba(216,176,117,0.2)", gap: 4 },
  resourceOptSelected: { backgroundColor: "rgba(216,176,117,0.12)", borderColor: Colors.accent },
  histRow: { paddingVertical: 8, gap: 4, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  histResource: { fontSize: 14, fontWeight: "700", color: Colors.textMain },
  tradeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(216,176,117,0.06)" },
  tradeSide: { fontSize: 11, fontWeight: "800", width: 36 },
  tradeGold: { fontSize: 14, fontWeight: "700" },
});
