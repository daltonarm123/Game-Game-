import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type NavItem = { id: string; label: string; group: "top" | "kingdom" };

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", group: "top" },
  { id: "forums", label: "Forums", group: "top" },
  { id: "how-to-play", label: "How To Play", group: "top" },
  { id: "overview", label: "Overview", group: "kingdom" },
  { id: "buildings", label: "Buildings", group: "kingdom" },
  { id: "war-room", label: "War Room", group: "kingdom" },
  { id: "train-troops", label: "Train Troops", group: "kingdom" },
  { id: "attack-kingdom", label: "Attack Kingdom", group: "kingdom" },
  { id: "guildhall", label: "Guildhall", group: "kingdom" },
  { id: "holy-circle", label: "Holy Circle", group: "kingdom" },
  { id: "alliance", label: "Alliance", group: "kingdom" },
  { id: "alliance-forums", label: "Alliance Forums", group: "kingdom" },
  { id: "embassy", label: "Embassy", group: "kingdom" },
  { id: "marketplace", label: "Marketplace", group: "kingdom" },
  { id: "settlements", label: "Settlements", group: "kingdom" },
  { id: "rankings", label: "Rankings", group: "kingdom" },
  { id: "research", label: "Research", group: "kingdom" },
  { id: "pigeons", label: "Pigeons", group: "kingdom" },
  { id: "account", label: "Account", group: "kingdom" },
  { id: "admin", label: "Admin Panel", group: "kingdom" },
  { id: "logout", label: "Logout", group: "kingdom" },
];

const TEXT_MAIN = "#f8efe2";
const TEXT_MUTED = "#d5c4a9";
const ACCENT = "#d8b075";
const FONT_DISPLAY = "Georgia, 'Times New Roman', serif";
const FONT_BODY = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

const CARD: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(35, 35, 38, 0.74), rgba(20, 20, 22, 0.8))",
  border: "1px solid rgba(216, 176, 117, 0.28)",
  borderRadius: 12,
  padding: 14,
  boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
  backdropFilter: "blur(2px)",
};

const API_BASE = (window as any).__GG_API_BASE || (import.meta as any).env?.VITE_API_BASE || "http://localhost:8080";
const AUTH_STORAGE_KEY = "gg:auth";
const KINGDOM_STORAGE_KEY = "gg:kingdom";
const BUILD_SHA = (import.meta as any).env?.VITE_GIT_SHA || "dev";
const BUILD_MODE = (import.meta as any).env?.MODE || "development";
const FAST_FLAG = (import.meta as any).env?.VITE_LOCAL_DEMO_FAST || "unknown";
const INPUT_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(216,176,117,.4)",
  background: "rgba(14, 14, 17, 0.9)",
  color: TEXT_MAIN,
  fontSize: 15,
  fontFamily: FONT_BODY,
};

const BTN_STYLE: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid rgba(216,176,117,.5)",
  background: "linear-gradient(180deg, rgba(216,176,117,.28), rgba(120,88,43,.28))",
  color: TEXT_MAIN,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 14,
  fontFamily: FONT_BODY,
};

type AuthState = {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    emailVerified?: boolean;
    isAdmin?: boolean;
  };
  kingdom: {
    id: number;
    name: string;
  } | null;
  expiresAt?: string;
};

const BUILDING_META: Record<string, { sigil: string; summary: string; unlocks: string }> = {
  archery_ranges: { sigil: "AR", summary: "Houses up to 20 archers per range built. Required to train ranged military units.", unlocks: "Archers, Crossbowmen" },
  barns: { sigil: "BN", summary: "Increases food storage capacity by 10,000 per barn. Reduces the risk of food spoilage.", unlocks: "Food storage" },
  barracks: { sigil: "BK", summary: "Houses up to 50 infantry troops per barracks. Required to train foot soldiers.", unlocks: "Footmen, Pikemen" },
  castles: { sigil: "CT", summary: "Increases population cap by 100, houses up to 20 knights and stables 5 horses. Also provides 500 wood and stone capacity, plus 7,500 food and 20,000 gold capacity.", unlocks: "Knights" },
  embassies: { sigil: "EM", summary: "Houses up to 4 diplomats per embassy. Required for diplomatic missions and alliance strategy.", unlocks: "Diplomats" },
  farm: { sigil: "FM", summary: "Generates food per hour and provides 2,000 food storage capacity plus 30 gold capacity.", unlocks: "Food production" },
  guildhalls: { sigil: "GH", summary: "Houses up to 5 spies per guildhall. Required for covert operations and intelligence gathering.", unlocks: "Spies" },
  horse_farms: { sigil: "HF", summary: "Provides capacity for 50 horses and generates additional horses per hour. Required for cavalry.", unlocks: "Horse production" },
  houses: { sigil: "HS", summary: "Increases population cap by 10 people per house and provides 100 extra gold capacity.", unlocks: "Population growth" },
  lumberyard: { sigil: "LY", summary: "Generates wood per hour and provides 200 wood storage capacity. Core resource production.", unlocks: "Wood production" },
  markets: { sigil: "MK", summary: "Allows you to buy and sell goods with other kingdoms. Houses up to 3 trade wagons at a time.", unlocks: "Marketplace trading" },
  quarry: { sigil: "QY", summary: "Generates stone per hour and provides 200 stone storage capacity. Core resource production.", unlocks: "Stone production" },
  stables: { sigil: "ST", summary: "Houses up to 10 cavalry per stable and adds 1 extra horse capacity to your kingdom.", unlocks: "Light Cavalry, Heavy Cavalry" },
  temples: { sigil: "TP", summary: "Houses up to 5 priests per temple. Generates mana over time for spell casting.", unlocks: "Priests, Mana" },
};

const BUILDING_PROD: Record<string, { income: string; trains: string; special: string }> = {
  archery_ranges: { income: "", trains: "Archers, Crossbowmen", special: "Each level houses 1 archer unit" },
  barns:          { income: "", trains: "", special: "Increases food storage capacity, reduces spoilage risk" },
  barracks:       { income: "", trains: "Footmen, Pikemen", special: "Required to train infantry troops" },
  castles:        { income: "", trains: "Knights", special: "+10% castle defence bonus per castle built" },
  embassies:      { income: "", trains: "Diplomats", special: "Enables diplomacy and alliance-facing strategy" },
  farm:           { income: "+120 food/hr", trains: "", special: "Core food production — stack many for a strong food economy" },
  guildhalls:     { income: "", trains: "Spies", special: "Each guildhall supports spy operations and covert intel" },
  horse_farms:    { income: "+60 horses/hr", trains: "", special: "Generates horses required to train cavalry units" },
  houses:         { income: "", trains: "", special: "Expands peasant housing capacity and population growth" },
  lumberyard:     { income: "+80 wood/hr", trains: "", special: "Core wood production — needed for most construction" },
  markets:        { income: "", trains: "", special: "Enables marketplace trading with other kingdoms" },
  quarry:         { income: "+80 stone/hr", trains: "", special: "Core stone production — critical for fortification and builds" },
  stables:        { income: "", trains: "Light Cavalry, Heavy Cavalry", special: "Required to train mounted units" },
  temples:        { income: "", trains: "Priests", special: "Generates mana over time and houses priests for faith progression" },
};

const TROOP_META: Record<string, { sigil: string; tint: string; role: string }> = {
  archers: { sigil: "AR", tint: "linear-gradient(180deg, rgba(60,98,78,.7), rgba(30,49,40,.9))", role: "Ranged defenders specialized for holding lines." },
  crossbowmen: { sigil: "XB", tint: "linear-gradient(180deg, rgba(68,90,117,.7), rgba(33,44,58,.9))", role: "Armor-piercing ranged troops with balanced pressure." },
  diplomats: { sigil: "DP", tint: "linear-gradient(180deg, rgba(104,88,127,.68), rgba(44,36,56,.9))", role: "Low-combat agents for diplomatic missions." },
  elites: { sigil: "EL", tint: "linear-gradient(180deg, rgba(124,82,40,.78), rgba(60,38,18,.92))", role: "Rare veteran shock troops earned in battle." },
  footmen: { sigil: "FT", tint: "linear-gradient(180deg, rgba(115,76,66,.72), rgba(54,34,28,.9))", role: "Baseline infantry core used in most armies." },
  heavy_cavalry: { sigil: "HC", tint: "linear-gradient(180deg, rgba(70,87,124,.75), rgba(32,40,58,.92))", role: "Armored cavalry for hard line breaks." },
  knights: { sigil: "KN", tint: "linear-gradient(180deg, rgba(118,104,88,.75), rgba(53,47,40,.92))", role: "Castle-trained elite mounted nobles." },
  light_cavalry: { sigil: "LC", tint: "linear-gradient(180deg, rgba(84,116,98,.75), rgba(36,55,45,.92))", role: "Fast cavalry used for mobile pressure." },
  peasants: { sigil: "PE", tint: "linear-gradient(180deg, rgba(106,94,74,.72), rgba(52,44,34,.9))", role: "Civilians and labor force with minimal combat value." },
  pikemen: { sigil: "PK", tint: "linear-gradient(180deg, rgba(99,84,112,.72), rgba(46,38,53,.9))", role: "Infantry anti-cavalry phalanx units." },
  priests: { sigil: "PR", tint: "linear-gradient(180deg, rgba(116,92,62,.72), rgba(58,44,31,.9))", role: "Faith units with low direct combat impact." },
  spies: { sigil: "SP", tint: "linear-gradient(180deg, rgba(86,86,96,.72), rgba(40,40,46,.9))", role: "Covert agents for intelligence and sabotage." },
};

function OverviewView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "Elixer");
  const [details, setDetails] = useState<any>(null);
  const [war, setWar] = useState<any>(null);
  const [prayData, setPrayData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [taxRate, setTaxRate] = useState(26);
  const [seasonRemainingSec, setSeasonRemainingSec] = useState(0);
  const [taxBusy, setTaxBusy] = useState(false);
  const [shieldBusy, setShieldBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [nextTickSecs, setNextTickSecs] = useState(() => secsToNextTick(300));
  const [isMobileOv, setIsMobileOv] = useState(() => typeof window !== "undefined" ? window.innerWidth < 900 : false);

  useEffect(() => {
    const onResize = () => setIsMobileOv(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [kRes, wRes, pRes] = await Promise.all([
        fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}`),
        fetch(`${API_BASE}/api/war-room/${encodeURIComponent(kingdom)}`),
        fetch(`${API_BASE}/api/pray/${encodeURIComponent(kingdom)}`),
      ]);
      const kJson = await kRes.json();
      const wJson = await wRes.json();
      const pJson = await pRes.json();
      if (!kRes.ok || !kJson?.ok) throw new Error(kJson?.error || `Kingdom HTTP ${kRes.status}`);
      if (!wRes.ok || !wJson?.ok) throw new Error(wJson?.error || `War Room HTTP ${wRes.status}`);
      setDetails(kJson);
      setWar(wJson);
      if (pRes.ok && pJson?.ok) setPrayData(pJson);
      setTaxRate(Number(kJson?.kingdom?.tax_rate || 25));
    } catch (e: any) {
      setDetails(null);
      setWar(null);
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSeasonRemainingSec(Math.max(0, Number(details?.season?.remainingSeconds || 0)));
  }, [details?.season?.remainingSeconds]);

  useEffect(() => {
    const t = setInterval(() => {
      setSeasonRemainingSec((s) => Math.max(0, s - 1));
      setNextTickSecs(secsToNextTick(300));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = details?.kingdom;
  const econ = details?.economy || {};
  const econPerHour = econ?.perHour || {};
  const econCaps = econ?.storageCaps || {};
  const bq = (details?.buildQueue || []).filter((x: any) => x.status === "queued").slice(0, 8);
  const tq = (details?.trainQueue || []).filter((x: any) => x.status === "queued").slice(0, 8);
  const populationHome = Number(war?.kingdom?.populationHome || 0);
  const populationTrain = Number(war?.kingdom?.populationTrain || 0);
  const populationAway = Number(war?.kingdom?.populationAway || 0);
  const populationTotal = populationHome + populationTrain + populationAway;
  const season = details?.season;
  const seasonRemaining = seasonRemainingSec;
  const seasonDays = Math.floor(seasonRemaining / 86400);
  const seasonHours = Math.floor((seasonRemaining % 86400) / 3600);
  const seasonLabel = String(season?.name || "Spring");
  const shield = details?.shield || war?.shield;
  const daysPlayed = Math.max(1, Math.floor((Date.now() - new Date(String(k?.created_at || Date.now())).getTime()) / 86400000));
  const rankNum = Number(war?.kingdom?.rank || 0);
  const rankTitle = rankNum <= 3 ? "Prince" : rankNum <= 10 ? "Duke" : rankNum <= 25 ? "Count" : "Lord";
  const allianceTag = String(k?.alliance_tag || "").trim();
  const titleStr = allianceTag ? `[${allianceTag}] ${k?.name || kingdom}` : (k?.name || kingdom);
  const manaPerHour = Number(prayData?.manaPerHour || 0);
  const activePrayers: any[] = prayData?.activePrayers ?? [];

  // Build troop table from war data
  const troops = (war?.troops || []) as Array<any>;
  const activeTroops = troops.filter((t: any) => Number(t.home || 0) + Number(t.train || 0) + Number(t.away || 0) > 0);

  async function updateTax(nextRate: number) {
    const v = Math.max(0, Math.min(40, Math.floor(Number(nextRate || 0))));
    setTaxBusy(true);
    setStatusMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}/tax`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxRate: v }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setTaxRate(Number(j?.taxRate || v));
      await load();
    } catch (e: any) {
      setStatusMsg(`Tax update failed: ${String(e?.message || e)}`);
    } finally {
      setTaxBusy(false);
    }
  }

  async function activateShield() {
    setShieldBusy(true);
    setStatusMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}/shield/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setStatusMsg("Shield queued. It will activate in 24 hours.");
      await load();
    } catch (e: any) {
      setStatusMsg(`Shield failed: ${String(e?.message || e)}`);
    } finally {
      setShieldBusy(false);
    }
  }

  const STAT_ROW: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(216,176,117,.1)", fontSize: 15, gap: 8 };
  const STAT_LABEL: React.CSSProperties = { color: TEXT_MUTED, flexShrink: 0 };
  const STAT_VALUE: React.CSSProperties = { color: TEXT_MAIN, fontWeight: 600, textAlign: "right" };
  const SEC_HDR: React.CSSProperties = { fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, color: ACCENT, marginTop: 14, marginBottom: 6, borderBottom: "1px solid rgba(216,176,117,.25)", paddingBottom: 4 };
  const TH_S: React.CSSProperties = { padding: "4px 8px", fontSize: 12, color: ACCENT, textAlign: "left", borderBottom: "1px solid rgba(216,176,117,.2)" };
  const TD_S: React.CSSProperties = { padding: "4px 8px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,.05)" };

  const fmtNum = (v: number) => Number(v || 0).toLocaleString();
  const fmtRate = (v: number) => {
    const n = Number(v || 0);
    const sign = n >= 0 ? "+" : "";
    return <span style={{ color: n >= 0 ? "#9ddb8f" : "#ffab9c", fontSize: 13 }}>({sign}{fmtNum(n)}/hr)</span>;
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Header bar */}
      <div style={{ ...CARD, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: "#fff7ec" }}>
          Overview — {titleStr}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 14, padding: "7px 10px" }} placeholder="Kingdom name" />
          <button onClick={() => void load()} style={{ ...BTN_STYLE, padding: "7px 12px", fontSize: 13 }}>Load</button>
        </div>
      </div>

      {loading ? <div style={{ color: TEXT_MUTED, padding: "0 4px" }}>Loading overview...</div> : null}
      {error ? (
        <div style={{ color: "#ffae9a", display: "flex", alignItems: "center", gap: 8 }}>
          <span>{error}</span>
          <button onClick={() => void load()} style={BTN_STYLE}>Retry</button>
        </div>
      ) : null}
      {statusMsg ? <div style={{ color: "#c8e7b1", fontSize: 14 }}>{statusMsg}</div> : null}

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: isMobileOv ? "1fr" : "380px 1fr", gap: 16 }}>
        {/* LEFT COLUMN */}
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div style={CARD}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: ACCENT, marginBottom: 10 }}>Kingdom Stats</div>
            <div style={STAT_ROW}><span style={STAT_LABEL}>Rank / Title</span><span style={STAT_VALUE}>#{rankNum || "N/A"} / {rankTitle}</span></div>
            <div style={STAT_ROW}><span style={STAT_LABEL}>Religion</span><span style={STAT_VALUE}>Nastfuru</span></div>
            <div style={STAT_ROW}><span style={STAT_LABEL}>Networth</span><span style={STAT_VALUE}>{fmtNum(Number(war?.kingdom?.networth || 0))}</span></div>
            <div style={STAT_ROW}><span style={STAT_LABEL}>Land</span><span style={STAT_VALUE}>{fmtNum(Number(k?.land || 0))} / {fmtNum(Number(k?.land || 0))} Acres</span></div>
            <div style={STAT_ROW}><span style={STAT_LABEL}>Population (home/total)</span><span style={STAT_VALUE}>{fmtNum(populationHome)} / {fmtNum(populationTotal)}</span></div>
            <div style={STAT_ROW}><span style={STAT_LABEL}>Settlement Wellbeing</span><span style={STAT_VALUE}>{fmtNum(Math.floor(Number(k?.land || 0) * 12.5))}</span></div>
            <div style={STAT_ROW}><span style={STAT_LABEL}>Consecutive Days</span><span style={STAT_VALUE}>{fmtNum(daysPlayed)}</span></div>
          </div>

          <div style={CARD}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>Shield</div>
            <div style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 6 }}>
              {shield?.status === "pending" ? `Pending: ${formatDuration(Number(shield?.remainingSeconds || 0))}` : null}
              {shield?.status === "active" ? <span style={{ color: "#a8e6a3" }}>Active: {formatDuration(Number(shield?.remainingSeconds || 0))}</span> : null}
              {shield?.status === "cooldown" ? `Cooldown: ${formatDuration(Number(shield?.remainingSeconds || 0))} (retaliation only)` : null}
              {(shield?.status === "none" || !shield) ? "None — no active shield protection" : null}
            </div>
            <button
              style={{ ...BTN_STYLE, fontSize: 13, padding: "7px 14px" }}
              disabled={shieldBusy || (shield && String(shield.status || "none") !== "none")}
              onClick={() => void activateShield()}
            >
              {shieldBusy ? "..." : "Activate Shield"}
            </button>
          </div>

          <div style={CARD}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>Tax Rate</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{taxRate}%</span>
              <button disabled={taxBusy} onClick={() => void updateTax(taxRate + 1)} style={{ ...BTN_STYLE, padding: "4px 12px", fontSize: 16 }}>+</button>
              <button disabled={taxBusy} onClick={() => void updateTax(taxRate - 1)} style={{ ...BTN_STYLE, padding: "4px 12px", fontSize: 16 }}>-</button>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: ACCENT, marginBottom: 6 }}>Season</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{seasonLabel}</div>
            <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2 }}>{seasonDays}d {seasonHours}h remaining</div>
            <div style={{ fontSize: 13, fontStyle: "italic", color: "#f0e3ce", marginTop: 4 }}>{String(season?.flavor || "Season effects are active.")}</div>
            <div style={{ marginTop: 10, fontSize: 14 }}>
              Next Tick: <span style={{ color: nextTickSecs <= 30 ? "#a8e6a3" : ACCENT, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{formatCountdown(nextTickSecs)}</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div style={CARD}>
            <div style={SEC_HDR}>Resources</div>
            <div style={{ display: "grid", gap: 4 }}>
              {[
                { label: "Food", icon: "F", cur: Number(k?.food || 0), cap: Number(econCaps.food || 0), rate: Number(econPerHour.food || 0) },
                { label: "Gold", icon: "G", cur: Number(k?.gold || 0), cap: Number(econCaps.gold || 0), rate: Number(econPerHour.gold || 0) },
                { label: "Mana", icon: "M", cur: Number(k?.mana || 0), cap: 0, rate: manaPerHour },
                { label: "Stone", icon: "S", cur: Number(k?.stone || 0), cap: Number(econCaps.stone || 0), rate: Number(econPerHour.stone || 0) },
                { label: "Wood", icon: "W", cur: Number(k?.wood || 0), cap: Number(econCaps.wood || 0), rate: Number(econPerHour.wood || 0) },
              ].map((res) => (
                <div key={res.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(216,176,117,.1)", fontSize: 14 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 4, background: "rgba(216,176,117,.2)", border: "1px solid rgba(216,176,117,.35)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{res.icon}</span>
                  <span style={{ width: 46, color: TEXT_MUTED, flexShrink: 0 }}>{res.label}</span>
                  <span style={{ fontWeight: 600, minWidth: 80 }}>{fmtNum(res.cur)}{res.cap > 0 ? ` / ${fmtNum(res.cap)}` : ""}</span>
                  {fmtRate(res.rate)}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 20, flexWrap: "wrap", fontSize: 14 }}>
              <span style={{ color: TEXT_MUTED }}>Blue Gems: <span style={{ color: "#7eb8ff", fontWeight: 700 }}>{fmtNum(Number(k?.blue_gems || 0))}</span></span>
              <span style={{ color: TEXT_MUTED }}>Green Gems: <span style={{ color: "#7fdb8a", fontWeight: 700 }}>{fmtNum(Number(k?.green_gems || 0))}</span></span>
            </div>
          </div>

          <div style={CARD}>
            <div style={SEC_HDR}>Population (home / train / away)</div>
            {activeTroops.length === 0 ? (
              <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No troops data available.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH_S}>Troop</th>
                      <th style={{ ...TH_S, textAlign: "right" }}>Home</th>
                      <th style={{ ...TH_S, textAlign: "right" }}>Training</th>
                      <th style={{ ...TH_S, textAlign: "right" }}>Away</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTroops.map((t: any) => (
                      <tr key={String(t.troop_code || t.code)}>
                        <td style={TD_S}>{String(t.troopCode || t.troop_code || t.code || "").replace(/_/g, " ")}</td>
                        <td style={{ ...TD_S, textAlign: "right" }}>{fmtNum(Number(t.home || 0))}</td>
                        <td style={{ ...TD_S, textAlign: "right" }}>{fmtNum(Number(t.train || 0))}</td>
                        <td style={{ ...TD_S, textAlign: "right" }}>{fmtNum(Number(t.away || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            <div style={CARD}>
              <div style={SEC_HDR}>Building...</div>
              {bq.length === 0 ? <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No active build queue.</div> : null}
              {bq.map((q: any) => (
                <div key={`bq-${q.id}`} style={{ marginBottom: 6, fontSize: 14, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ color: TEXT_MUTED }}>{String(q.building_code || "").replace(/_/g, " ")} → Lvl {q.target_level}</span>
                  <QueueCountdown completesAt={q.completes_at} onComplete={() => void load()} />
                </div>
              ))}
            </div>
            <div style={CARD}>
              <div style={SEC_HDR}>Training...</div>
              {tq.length === 0 ? <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No active training queue.</div> : null}
              {tq.map((q: any) => (
                <div key={`tq-${q.id}`} style={{ marginBottom: 6, fontSize: 14, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ color: TEXT_MUTED }}>{fmtNum(Number(q.quantity || 0))} × {String(q.troop_code || "").replace(/_/g, " ")}</span>
                  <QueueCountdown completesAt={q.completes_at} onComplete={() => void load()} />
                </div>
              ))}
            </div>
          </div>

          {activePrayers.length > 0 ? (
            <div style={CARD}>
              <div style={SEC_HDR}>Prayers In Progress...</div>
              {activePrayers.map((ap: any) => (
                <div key={ap.id} style={{ marginBottom: 6, fontSize: 14, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ color: TEXT_MUTED }}>{String(ap.prayer_code || "").replace(/_/g, " ")}</span>
                  <span style={{ color: ACCENT }}>{formatDuration(Number(ap.remainingSeconds || ap.remaining_seconds || 0))} remaining</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BuildingsView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "Elixer");
  const [details, setDetails] = useState<any>(null);
  const [war, setWar] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [buildCode, setBuildCode] = useState("farm");
  const [buildQty, setBuildQty] = useState(1);
  const [buildBusy, setBuildBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [kRes, wRes] = await Promise.all([
        fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}`),
        fetch(`${API_BASE}/api/war-room/${encodeURIComponent(kingdom)}`),
      ]);
      const kJson = await kRes.json();
      const wJson = await wRes.json();
      if (!kRes.ok || !kJson?.ok) throw new Error(kJson?.error || `Kingdom HTTP ${kRes.status}`);
      if (!wRes.ok || !wJson?.ok) throw new Error(wJson?.error || `War Room HTTP ${wRes.status}`);
      setDetails(kJson);
      setWar(wJson);
    } catch (e: any) {
      setDetails(null);
      setWar(null);
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = details?.kingdom;
  const buildings = (details?.buildings || []) as Array<any>;
  const buildQueue = (details?.buildQueue || []).filter((x: any) => x.status === "queued") as Array<any>;
  const econ = details?.economy?.perHour || {};
  const buildingMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const b of buildings) m[String(b.building_code)] = b;
    return m;
  }, [buildings]);

  const queueCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const q of buildQueue) {
      const code = String(q.building_code || "");
      m[code] = (m[code] || 0) + 1;
    }
    return m;
  }, [buildQueue]);

  const usedLand = useMemo(() => {
    let used = 0;
    for (const b of buildings) {
      used += Number(b.level || 0) * Number(b.land_cost || 0);
    }
    return used;
  }, [buildings]);
  const queuedLand = useMemo(() => {
    let used = 0;
    for (const q of buildQueue) {
      const b = buildingMap[String(q.building_code)];
      used += Number(b?.land_cost || 0);
    }
    return used;
  }, [buildQueue, buildingMap]);
  const availableLand = Math.max(0, Number(k?.land || 0) - usedLand - queuedLand);

  const buildOptions = useMemo(() => {
    if (!Array.isArray(buildings) || buildings.length === 0) return ["farm", "lumberyard", "quarry", "barracks", "stables", "castles"];
    return buildings.map((b) => String(b.building_code));
  }, [buildings]);

  async function submitBuild(e: React.FormEvent) {
    e.preventDefault();
    if (!k) return;
    setActionMsg("");
    setBuildBusy(true);
    try {
      const qty = Math.max(1, Math.floor(Number(buildQty || 1)));
      let success = 0;
      for (let i = 0; i < qty; i += 1) {
        const r = await fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}/build`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buildingCode: buildCode }),
        });
        const j = await r.json();
        if (!r.ok || !j?.ok) {
          if (success === 0) throw new Error(j?.error || `HTTP ${r.status}`);
          setActionMsg(`Queued ${success} x ${buildCode}. Stopped: ${String(j?.error || `HTTP ${r.status}`)}`);
          await load();
          setBuildBusy(false);
          return;
        }
        success += 1;
      }
      setActionMsg(`Queued ${success} x ${buildCode}.`);
      await load();
    } catch (e: any) {
      setActionMsg(`Build failed: ${String(e?.message || e)}`);
    } finally {
      setBuildBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY }}>
              Buildings - {k ? k.name : kingdom}
            </div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 18, fontWeight: 700 }}>
              Rank #{war?.kingdom?.rank || "N/A"} • Land: {availableLand.toLocaleString()} / {Number(k?.land || 0).toLocaleString()} Acres
            </div>
            <div style={{ marginTop: 4, color: TEXT_MUTED, fontSize: 17, fontWeight: 700 }}>
              Stone: {Number(k?.stone || 0).toLocaleString()} ({Number(econ.stone || 0) >= 0 ? "+" : ""}{Number(econ.stone || 0).toLocaleString()}/h) • Wood: {Number(k?.wood || 0).toLocaleString()} ({Number(econ.wood || 0) >= 0 ? "+" : ""}{Number(econ.wood || 0).toLocaleString()}/h)
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={INPUT_STYLE} />
            <button onClick={() => void load()} style={BTN_STYLE}>Load</button>
          </div>
        </div>
        <div style={{ marginTop: 10, color: TEXT_MUTED }}>
          Each building has its own role. Build order now matters because military unlocks depend on structure type.
        </div>
        {loading ? <div style={{ marginTop: 8, color: TEXT_MUTED }}>Loading buildings...</div> : null}
        {error ? (
          <div style={{ marginTop: 8, color: "#ffae9a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{error}</span>
            <button onClick={() => void load()} style={BTN_STYLE}>Retry</button>
          </div>
        ) : null}
        {actionMsg ? <div style={{ marginTop: 8, color: "#c8e7b1" }}>{actionMsg}</div> : null}
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 24 }}>Kingdom Buildings</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(216,176,117,.4)", color: ACCENT, fontSize: 13 }}>Building</th>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(216,176,117,.4)", color: ACCENT, fontSize: 13 }}>What it does</th>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(216,176,117,.4)", color: ACCENT, fontSize: 13 }}>Cost per build</th>
                <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid rgba(216,176,117,.4)", color: ACCENT, fontSize: 13 }}>Built</th>
                <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid rgba(216,176,117,.4)", color: ACCENT, fontSize: 13 }}>Building</th>
                <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid rgba(216,176,117,.4)", color: ACCENT, fontSize: 13 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((b) => {
                const code = String(b.building_code);
                const meta = BUILDING_META[code] || { sigil: code.slice(0, 2).toUpperCase(), summary: "Core kingdom infrastructure.", unlocks: "General growth and economy support." };
                const prod = BUILDING_PROD[code];
                const built = Number(b.level || 0);
                const bldg = Number(queueCounts[code] || 0);
                const total = built + bldg;
                const rawSec = Number(b.base_build_seconds || 0);
                const buildTimeTxt = rawSec >= 86400
                  ? `${Math.floor(rawSec / 86400)}d ${Math.floor((rawSec % 86400) / 3600)}h`
                  : `${Math.floor(rawSec / 3600)}h`;
                return (
                  <tr key={code} style={{ cursor: "pointer" }} onClick={() => setBuildCode(code)}>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(216,176,117,.1)", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid rgba(216,176,117,.55)", background: "linear-gradient(180deg, rgba(89,67,37,.82), rgba(35,27,15,.92))", display: "grid", placeItems: "center", fontWeight: 800, color: "#f2dfbf", fontSize: 12, flexShrink: 0 }}>
                          {meta.sigil}
                        </div>
                        <span style={{ fontWeight: 600 }}>{String(b.building_name || code)}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(216,176,117,.1)" }}>
                      <div style={{ fontSize: 13, color: TEXT_MAIN }}>{meta.summary}</div>
                      {prod?.income ? <div style={{ marginTop: 3, fontSize: 12, color: "#9ddb8f", fontWeight: 600 }}>{prod.income} per building</div> : null}
                      {prod?.trains ? <div style={{ marginTop: 3, fontSize: 12, color: "#c8b8f8" }}>Trains: {prod.trains}</div> : null}
                      {prod?.special ? <div style={{ marginTop: 3, fontSize: 12, color: TEXT_MUTED }}>{prod.special}</div> : null}
                    </td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(216,176,117,.1)", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 12, display: "grid", gap: 3 }}>
                        <div style={{ color: ACCENT, fontWeight: 700 }}>⏱ {buildTimeTxt}</div>
                        <div style={{ display: "flex", gap: 5 }}>
                          <span>🌍</span>
                          <span style={{ color: availableLand >= Number(b.land_cost || 0) ? "#c8b8a0" : "#ff6b47", fontWeight: 600 }}>{Number(b.land_cost || 0)}</span>
                          <span style={{ color: TEXT_MUTED }}>/ {availableLand.toLocaleString()}</span>
                        </div>
                        <div style={{ display: "flex", gap: 5 }}>
                          <span>🪨</span>
                          <span style={{ color: Number(k?.stone || 0) >= Number(b.stone_cost || 0) ? "#c8b8a0" : "#ff6b47", fontWeight: 600 }}>{Number(b.stone_cost || 0).toLocaleString()}</span>
                          <span style={{ color: TEXT_MUTED }}>/ {Number(k?.stone || 0).toLocaleString()}</span>
                        </div>
                        <div style={{ display: "flex", gap: 5 }}>
                          <span>🪵</span>
                          <span style={{ color: Number(k?.wood || 0) >= Number(b.wood_cost || 0) ? "#c8b8a0" : "#ff6b47", fontWeight: 600 }}>{Number(b.wood_cost || 0).toLocaleString()}</span>
                          <span style={{ color: TEXT_MUTED }}>/ {Number(k?.wood || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.1)", fontSize: 15, fontWeight: 700 }}>{built.toLocaleString()}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.1)", fontSize: 15, color: bldg > 0 ? "#a8e6a3" : TEXT_MUTED }}>{bldg.toLocaleString()}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.1)", fontSize: 15, fontWeight: 700, color: ACCENT }}>{total.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 18 }}>Queue a Build</div>
        <form onSubmit={submitBuild} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={buildCode} onChange={(e) => setBuildCode(e.target.value)} style={{ ...INPUT_STYLE, minWidth: 180 }}>
            {buildOptions.map((code) => {
              const name = buildingMap[code]?.building_name || String(code).replace(/_/g, " ");
              return <option key={code} value={code}>{name}</option>;
            })}
          </select>
          <input
            type="number"
            min={1}
            max={500}
            value={buildQty}
            onChange={(e) => setBuildQty(Math.max(1, Number(e.target.value || 1)))}
            style={{ ...INPUT_STYLE, width: 90 }}
          />
          <button type="submit" style={BTN_STYLE} disabled={buildBusy}>
            {buildBusy ? "Queueing..." : "Queue Build"}
          </button>
        </form>

        {buildingMap[buildCode] ? (() => {
          const bm = buildingMap[buildCode];
          const meta = BUILDING_META[buildCode] || { sigil: "??", summary: "Kingdom structure.", unlocks: "" };
          const prod = BUILDING_PROD[buildCode];
          const rawSec = Number(bm.base_build_seconds || 0);
          const buildTimeTxt = rawSec >= 604800
            ? `${Math.floor(rawSec / 604800)} week`
            : rawSec >= 86400
            ? `${Math.floor(rawSec / 86400)}d ${Math.floor((rawSec % 86400) / 3600)}h`
            : rawSec >= 3600
            ? `${Math.floor(rawSec / 3600)} hour${Math.floor(rawSec / 3600) !== 1 ? "s" : ""}`
            : `${Math.floor(rawSec / 60)} min`;
          const totalWood = Number(bm.wood_cost || 0) * buildQty;
          const totalStone = Number(bm.stone_cost || 0) * buildQty;
          const totalLand = Number(bm.land_cost || 0) * buildQty;
          const canAffordWood = Number(k?.wood || 0) >= totalWood;
          const canAffordStone = Number(k?.stone || 0) >= totalStone;
          const canAffordLand = availableLand >= totalLand;
          const costRows = [
            { icon: "🌍", label: "Land",  cost: totalLand,  stock: availableLand,         stockSuffix: " available", canAfford: canAffordLand },
            { icon: "🪨", label: "Stone", cost: totalStone, stock: Number(k?.stone || 0), stockSuffix: "",           canAfford: canAffordStone },
            { icon: "🪵", label: "Wood",  cost: totalWood,  stock: Number(k?.wood || 0),  stockSuffix: "",           canAfford: canAffordWood },
          ];
          return (
            <div style={{ marginTop: 14, borderRadius: 10, border: "1px solid rgba(216,176,117,.3)", padding: "14px 16px", background: "rgba(0,0,0,.28)" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 7, border: "1px solid rgba(216,176,117,.6)", background: "linear-gradient(180deg, rgba(89,67,37,.9), rgba(35,27,15,.95))", display: "grid", placeItems: "center", fontWeight: 800, color: "#f2dfbf", fontSize: 13, flexShrink: 0 }}>
                  {meta.sigil}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: "#fff7ec" }}>{bm.building_name || buildCode}</div>
                  <div style={{ fontSize: 13, color: ACCENT, marginTop: 2 }}>
                    Building Time: {buildTimeTxt}{buildQty > 1 ? ` · ${buildQty}× queued` : ""}
                  </div>
                </div>
              </div>

              {/* Effects */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5 }}>Effects</div>
                <div style={{ fontSize: 13, color: "#d8cfc0", lineHeight: 1.55 }}>{meta.summary}</div>
                {prod?.income && <div style={{ fontSize: 13, color: "#9ddb8f", marginTop: 5 }}>📈 {prod.income} per building</div>}
                {prod?.trains && <div style={{ fontSize: 13, color: "#c8b8f8", marginTop: 3 }}>⚔️ Trains: {prod.trains}</div>}
              </div>

              {/* Building Costs */}
              <div>
                <div style={{ fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Building Costs</div>
                {costRows.map(({ icon, label, cost, stock, stockSuffix, canAfford }, i) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < costRows.length - 1 ? "1px solid rgba(216,176,117,.1)" : "none" }}>
                    <span style={{ fontSize: 17, width: 24, textAlign: "center", flexShrink: 0 }}>{icon}</span>
                    <span style={{ color: TEXT_MUTED, fontSize: 13, width: 46, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: canAfford ? "#e8dfc8" : "#ff6b47", fontFamily: FONT_DISPLAY, minWidth: 72 }}>
                      {cost.toLocaleString()}
                    </span>
                    <span style={{ color: TEXT_MUTED, fontSize: 13 }}>/ {stock.toLocaleString()}{stockSuffix}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })() : null}
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Building Queue</div>
        {buildQueue.length === 0 ? <div style={{ color: TEXT_MUTED }}>No active building queue.</div> : null}
        {buildQueue.map((q) => (
          <div key={q.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 14 }}>
              <span style={{ color: ACCENT, fontWeight: 700 }}>{BUILDING_META[String(q.building_code)]?.sigil || "??"}</span>
              {" "}{String(q.building_code).replace(/_/g, " ")} → Lvl {q.target_level}
            </span>
            <QueueCountdown completesAt={q.completes_at} onComplete={() => void load()} />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(sec: number) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function secsUntil(ts: string): number {
  return Math.max(0, Math.floor((new Date(ts).getTime() - Date.now()) / 1000));
}

function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m ${String(ss).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(ss).padStart(2, "0")}s`;
  return `${ss}s`;
}

function secsToNextTick(alignSecs = 300): number {
  const step = alignSecs * 1000;
  return Math.max(0, Math.floor((Math.ceil(Date.now() / step) * step - Date.now()) / 1000));
}

function QueueCountdown({ completesAt, onComplete }: { completesAt: string; onComplete?: () => void }) {
  const [secs, setSecs] = useState(() => secsUntil(completesAt));

  useEffect(() => {
    setSecs(secsUntil(completesAt));
  }, [completesAt]);

  useEffect(() => {
    if (secs <= 0) {
      // Wait 3s then call onComplete — gives the tick server time to process
      const t = setTimeout(() => onComplete?.(), 3000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setSecs(secsUntil(completesAt)), 1000);
    return () => clearTimeout(t);
  }, [secs, completesAt]);

  if (secs <= 0) return <span style={{ color: "#a8e6a3", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>Processing...</span>;
  return <span style={{ color: ACCENT, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatCountdown(secs)}</span>;
}

function ResearchView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "Elixer");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [busyCode, setBusyCode] = useState("");
  const [researchTab, setResearchTab] = useState<"skills" | "effects">("skills");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/research/${encodeURIComponent(kingdom)}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) {
      setData(null);
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startResearch(code: string) {
    setActionMsg("");
    setBusyCode(code);
    try {
      const r = await fetch(`${API_BASE}/api/research/${encodeURIComponent(kingdom)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ researchCode: code }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Research queued: ${code}`);
      await load();
    } catch (e: any) {
      setActionMsg(`Research failed: ${String(e?.message || e)}`);
    } finally {
      setBusyCode("");
    }
  }

  const items = (data?.items || []) as Array<any>;
  const queue = (data?.queue || []) as Array<any>;
  const byCategory = items.reduce((acc: Record<string, any[]>, item: any) => {
    const key = String(item.category || "General");
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  // Compute composite effects from researched items
  const effectsMap: Record<string, number> = {};
  items.forEach((item: any) => {
    const lvl = Number(item.currentLevel || 0);
    if (lvl <= 0) return;
    const effectText = String(item.effectText || "");
    const effectPerLevel = Number(item.effectPerLevel || item.currentEffect || 0);
    if (!effectText) return;
    const key = effectText;
    effectsMap[key] = (effectsMap[key] || 0) + effectPerLevel * lvl;
  });
  const effectEntries = Object.entries(effectsMap).filter(([, v]) => v !== 0);

  const TAB_BTN_R = (id: "skills" | "effects", label: string) => (
    <button
      key={id}
      onClick={() => setResearchTab(id)}
      style={{ ...BTN_STYLE, background: researchTab === id ? "rgba(216,176,117,.45)" : "rgba(8,8,10,.62)", fontSize: 14, padding: "8px 16px" }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY }}>Research - {data?.kingdom?.name || kingdom}</div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 18, fontWeight: 700 }}>
              Gold: {Number(data?.kingdom?.gold || 0).toLocaleString()} • Queue: {Number(data?.queueSlotsUsed || 0)}/{Number(data?.queueSlotsMax || 2)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={INPUT_STYLE} />
            <button onClick={() => void load()} style={BTN_STYLE}>Load</button>
          </div>
        </div>
        {loading ? <div style={{ marginTop: 8, color: TEXT_MUTED }}>Loading research...</div> : null}
        {error ? (
          <div style={{ marginTop: 8, color: "#ffae9a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{error}</span>
            <button onClick={() => void load()} style={BTN_STYLE}>Retry</button>
          </div>
        ) : null}
        {actionMsg ? <div style={{ marginTop: 8, color: "#c8e7b1" }}>{actionMsg}</div> : null}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {TAB_BTN_R("skills", "Skills & Technologies")}
          {TAB_BTN_R("effects", "Effects")}
        </div>
      </div>

      {researchTab === "effects" ? (
        <div style={CARD}>
          <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 22, fontFamily: FONT_DISPLAY }}>Composite Effects</div>
          <div style={{ color: TEXT_MUTED, fontSize: 14, marginBottom: 12 }}>Composite effects of all skills researched</div>
          {effectEntries.length === 0 ? (
            <div style={{ color: TEXT_MUTED }}>No researched skills yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {effectEntries.map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderRadius: 8, background: "rgba(0,0,0,.2)", border: "1px solid rgba(216,176,117,.15)" }}>
                  <span style={{ fontSize: 15 }}>{label}</span>
                  <span style={{ fontWeight: 700, color: ACCENT, fontSize: 15, fontFamily: FONT_DISPLAY }}>{Number(value).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={CARD}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 22 }}>Current Research Queue</div>
            {queue.length === 0 ? <div style={{ color: TEXT_MUTED }}>No active research queue.</div> : null}
            {queue.map((q) => (
              <div key={q.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 14 }}>{String(q.research_code).replace(/_/g, " ")} → Lvl {q.target_level}</span>
                <QueueCountdown completesAt={q.completes_at} onComplete={() => void load()} />
              </div>
            ))}
          </div>

          {Object.keys(byCategory).map((category) => (
            <div key={category} style={CARD}>
              <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 22 }}>{category}</div>
              <div style={{ display: "grid", gap: 8 }}>
                {byCategory[category].map((r: any) => (
                  <div key={r.code} style={{ border: "1px solid rgba(216,176,117,.2)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,.2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>{r.name}</div>
                        <div style={{ color: TEXT_MUTED, marginTop: 4 }}>
                          {r.effectText} • Lvl {r.currentLevel}/{r.maxLevel} • Effect {r.currentEffect}% → {r.nextEffect}%
                        </div>
                        {Array.isArray(r.prereqs) && r.prereqs.length > 0 ? (
                          <div style={{ color: TEXT_MUTED, marginTop: 4, fontSize: 13 }}>
                            Prereqs: {r.prereqs.map((p: any) => `${p.name} (${p.currentLevel}/${p.requiredLevel})`).join(", ")}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ minWidth: 220, textAlign: "right" }}>
                        <div style={{ fontSize: 14, color: TEXT_MUTED }}>Next: {r.nextGold.toLocaleString()} gold • {formatDuration(r.nextSeconds)}</div>
                        <div style={{ marginTop: 6 }}>
                          <button
                            style={BTN_STYLE}
                            disabled={!r.canResearch || !!busyCode || r.isQueued}
                            onClick={() => void startResearch(r.code)}
                          >
                            {r.isQueued ? "Queued" : busyCode === r.code ? "Starting..." : "Research"}
                          </button>
                        </div>
                        {!r.canResearch && !r.isQueued ? <div style={{ marginTop: 4, fontSize: 12, color: "#ffab9c" }}>Locked/requirements unmet</div> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SettlementsView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "Elixer");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [settlementId, setSettlementId] = useState<number>(0);
  const [showDetail, setShowDetail] = useState(false);
  const [renameId, setRenameId] = useState<number>(0);
  const [renameName, setRenameName] = useState("");
  const [buildingCode, setBuildingCode] = useState("housing");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/settlements/${encodeURIComponent(kingdom)}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
      if (!settlementId && Array.isArray(j.settlements) && j.settlements.length > 0) {
        setSettlementId(Number(j.settlements[0].id));
      }
    } catch (e: any) {
      setData(null);
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upgrade() {
    if (!settlementId) return;
    setBusy(true);
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/settlements/${encodeURIComponent(kingdom)}/upgrade-building`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlementId, buildingCode }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Queued ${buildingCode} for settlement #${settlementId}.`);
      await load();
    } catch (e: any) {
      setActionMsg(`Upgrade failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function renameSettlement() {
    if (!renameId || !renameName.trim()) return;
    setBusy(true);
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/settlements/${encodeURIComponent(kingdom)}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlementId: renameId, name: renameName.trim() }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Renamed settlement to "${String(j?.settlement?.name || renameName)}" (wellbeing -100).`);
      setRenameId(0);
      setRenameName("");
      await load();
    } catch (e: any) {
      setActionMsg(`Rename failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  const settlements = (data?.settlements || []) as Array<any>;
  const queue = (data?.queue || []) as Array<any>;
  const catalog = (data?.catalog || []) as Array<any>;
  const buildings = (data?.buildings || []) as Array<any>;
  const selected = settlements.find((s) => Number(s.id) === Number(settlementId));
  const selectedBuildings = buildings.filter((b) => Number(b.settlement_id) === Number(settlementId));
  const avgWellbeing = Number(data?.averageWellbeing || 0);
  const totalSettlementRank = Number(data?.totalSettlementRank || 0);
  const totalMaintenance = settlements.reduce(
    (acc, s) => {
      acc.gold += Number(s?.maintenance?.gold || 0);
      acc.stone += Number(s?.maintenance?.stone || 0);
      acc.wood += Number(s?.maintenance?.wood || 0);
      return acc;
    },
    { gold: 0, stone: 0, wood: 0 },
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY }}>
              Settlements - {data?.kingdom?.name || kingdom}
            </div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 18, fontWeight: 700 }}>
              Number of settlements: {settlements.length} ({Number(data?.unlockedByLand || 0)}) • Average Wellbeing: {avgWellbeing.toLocaleString()} • Total settlement rank: {totalSettlementRank}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={INPUT_STYLE} />
            <button onClick={() => void load()} style={BTN_STYLE}>Load</button>
          </div>
        </div>
        {loading ? <div style={{ marginTop: 8, color: TEXT_MUTED }}>Loading settlements...</div> : null}
        {error ? (
          <div style={{ marginTop: 8, color: "#ffae9a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{error}</span>
            <button onClick={() => void load()} style={BTN_STYLE}>Retry</button>
          </div>
        ) : null}
        {actionMsg ? <div style={{ marginTop: 8, color: "#c8e7b1" }}>{actionMsg}</div> : null}
      </div>

      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 22 }}>Owned Settlements</div>
          <div style={{ color: TEXT_MUTED }}>
            Maintenance/h: Gold {totalMaintenance.gold.toLocaleString()} Wood {totalMaintenance.wood.toLocaleString()} Stone {totalMaintenance.stone.toLocaleString()}
          </div>
        </div>
        <div style={{ marginBottom: 10, color: TEXT_MUTED }}>
          Settlements are part of your kingdom. Open one to manage buildings, or rename it with the edit icon.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 8 }}>Name</th>
                <th style={{ textAlign: "left", padding: 8 }}>Type</th>
                <th style={{ textAlign: "right", padding: 8 }}>Level</th>
                <th style={{ textAlign: "right", padding: 8 }}>Wellbeing</th>
                <th style={{ textAlign: "right", padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.id} style={{ background: Number(s.id) === Number(settlementId) ? "rgba(216,176,117,.12)" : "transparent" }}>
                  <td style={{ padding: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 28, fontFamily: FONT_DISPLAY }}>{s.name}</div>
                    <div style={{ color: TEXT_MUTED, marginTop: 4, fontSize: 18 }}>
                      Maintenance - Gold: {Number(s?.maintenance?.gold || 0).toLocaleString()} Wood: {Number(s?.maintenance?.wood || 0).toLocaleString()} Stone: {Number(s?.maintenance?.stone || 0).toLocaleString()}
                    </div>
                  </td>
                  <td style={{ padding: 8 }}>{String(s.settlement_type || "").replaceAll("_", " ")}</td>
                  <td style={{ padding: 8, textAlign: "right" }}>{Number(s.level || 0)}</td>
                  <td style={{ padding: 8, textAlign: "right" }}>{Number(s.wellbeing || 0).toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right" }}>
                    <button
                      onClick={() => {
                        setSettlementId(Number(s.id));
                        setShowDetail(true);
                      }}
                      style={{ ...BTN_STYLE, padding: "6px 10px", marginRight: 8 }}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => {
                        setRenameId(Number(s.id));
                        setRenameName(String(s.name || ""));
                      }}
                      style={{ ...BTN_STYLE, padding: "6px 10px" }}
                    >
                      Rename
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {renameId ? (
        <div style={CARD}>
          <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 22 }}>Rename Settlement</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={renameName} onChange={(e) => setRenameName(e.target.value)} style={INPUT_STYLE} />
            <button onClick={() => void renameSettlement()} style={BTN_STYLE} disabled={busy || !renameName.trim()}>
              {busy ? "Saving..." : "Save Name"}
            </button>
            <button onClick={() => { setRenameId(0); setRenameName(""); }} style={BTN_STYLE}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {showDetail && selected ? (
        <div style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 40, fontWeight: 800, fontFamily: FONT_DISPLAY }}>{selected.name}</div>
              <div style={{ marginTop: 4, fontSize: 22 }}>
                {String(selected.settlement_type || "").replaceAll("_", " ")} / Level: {Number(selected.level || 0)} / Slots: {Number(selected.slots_total || 0)}
              </div>
              <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 18 }}>
                Wellbeing: {Number(selected.wellbeing || 0).toLocaleString()} • Maintenance - Gold: {Number(selected?.maintenance?.gold || 0).toLocaleString()} Wood: {Number(selected?.maintenance?.wood || 0).toLocaleString()} Stone: {Number(selected?.maintenance?.stone || 0).toLocaleString()}
              </div>
            </div>
            <button onClick={() => setShowDetail(false)} style={BTN_STYLE}>Back To List</button>
          </div>

          <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 26 }}>Buildings</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <select value={buildingCode} onChange={(e) => setBuildingCode(e.target.value)} style={INPUT_STYLE}>
              {catalog.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            <button onClick={() => void upgrade()} style={BTN_STYLE} disabled={busy || !settlementId}>
              {busy ? "Queueing..." : "Upgrade Building"}
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8 }}>Building Type</th>
                  <th style={{ textAlign: "left", padding: 8 }}>Effect</th>
                  <th style={{ textAlign: "right", padding: 8 }}>Level</th>
                  <th style={{ textAlign: "right", padding: 8 }}>Cap</th>
                </tr>
              </thead>
              <tbody>
                {selectedBuildings.map((b) => (
                  <tr key={`${b.settlement_id}-${b.building_code}`}>
                    <td style={{ padding: 8 }}>{b.name}</td>
                    <td style={{ padding: 8, color: TEXT_MUTED }}>{b.effect_text}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>{Number(b.level || 0)}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>{Math.min(Number(b.max_level || 0), Number(selected.level || 1))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div style={CARD}>
        <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 22 }}>Settlement Build Queue</div>
        {queue.length === 0 ? <div style={{ color: TEXT_MUTED }}>No active settlement build queue.</div> : null}
        {queue.map((q) => (
          <div key={q.id} style={{ marginBottom: 6 }}>
            Settlement #{q.settlement_id} • {q.building_code} lvl {q.target_level} • {String(q.completes_at).replace("T", " ").slice(0, 19)}
          </div>
        ))}
      </div>
    </div>
  );
}

function AllianceView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "Elixer");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [createSlug, setCreateSlug] = useState("my-alliance");
  const [createName, setCreateName] = useState("My Alliance");
  const [createDesc, setCreateDesc] = useState("");

  const [joinAllianceId, setJoinAllianceId] = useState<number>(0);

  const [relationType, setRelationType] = useState("ally");
  const [relationTarget, setRelationTarget] = useState("");
  const [relationNote, setRelationNote] = useState("");

  const [contribCode, setContribCode] = useState("alliance_hall");
  const [contribGold, setContribGold] = useState(0);
  const [contribStone, setContribStone] = useState(0);
  const [contribWood, setContribWood] = useState(0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/alliance/${encodeURIComponent(kingdom)}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
      if (!joinAllianceId && Array.isArray(j.alliances) && j.alliances.length > 0) {
        setJoinAllianceId(Number(j.alliances[0].id));
      }
      if (Array.isArray(j.projects) && j.projects.length > 0 && !j.projects.find((p: any) => String(p.buildingCode || "") === contribCode)) {
        setContribCode(String(j.projects[0].buildingCode || "alliance_hall"));
      }
    } catch (e: any) {
      setData(null);
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createAlliance() {
    setBusy(true);
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/alliance/${encodeURIComponent(kingdom)}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: createSlug,
          name: createName,
          description: createDesc,
          imageUrl: "",
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Alliance created: ${String(j?.alliance?.name || createName)}`);
      await load();
    } catch (e: any) {
      setActionMsg(`Create failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function joinAlliance() {
    if (!joinAllianceId) return;
    setBusy(true);
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/alliance/${encodeURIComponent(kingdom)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allianceId: joinAllianceId }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Joined alliance #${joinAllianceId}`);
      await load();
    } catch (e: any) {
      setActionMsg(`Join failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function leaveAlliance() {
    setBusy(true);
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/alliance/${encodeURIComponent(kingdom)}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(Boolean(j?.disbanded) ? "Alliance disbanded." : "Left alliance.");
      await load();
    } catch (e: any) {
      setActionMsg(`Leave failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveRelation() {
    setBusy(true);
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/alliance/${encodeURIComponent(kingdom)}/relation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relationType,
          targetName: relationTarget,
          note: relationNote,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Relation saved: ${relationType} -> ${relationTarget}`);
      setRelationTarget("");
      setRelationNote("");
      await load();
    } catch (e: any) {
      setActionMsg(`Relation failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function contribute() {
    setBusy(true);
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/alliance/${encodeURIComponent(kingdom)}/contribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingCode: contribCode,
          gold: Math.max(0, Math.floor(Number(contribGold || 0))),
          stone: Math.max(0, Math.floor(Number(contribStone || 0))),
          wood: Math.max(0, Math.floor(Number(contribWood || 0))),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(j?.project?.leveledUp ? `${contribCode} leveled up.` : `Contribution sent to ${contribCode}.`);
      setContribGold(0);
      setContribStone(0);
      setContribWood(0);
      await load();
    } catch (e: any) {
      setActionMsg(`Contribution failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  const alliance = data?.alliance;
  const member = data?.member;
  const members = (data?.members || []) as Array<any>;
  const projects = (data?.projects || []) as Array<any>;
  const relations = (data?.relations || []) as Array<any>;
  const alliances = (data?.alliances || []) as Array<any>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY }}>
              Alliance - {data?.kingdom?.name || kingdom}
            </div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 18, fontWeight: 700 }}>
              Gold: {Number(data?.kingdom?.gold || 0).toLocaleString()} • Stone: {Number(data?.kingdom?.stone || 0).toLocaleString()} • Wood: {Number(data?.kingdom?.wood || 0).toLocaleString()}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={INPUT_STYLE} />
            <button onClick={() => void load()} style={BTN_STYLE}>Load</button>
          </div>
        </div>
        {loading ? <div style={{ marginTop: 8, color: TEXT_MUTED }}>Loading alliance...</div> : null}
        {error ? (
          <div style={{ marginTop: 8, color: "#ffae9a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{error}</span>
            <button onClick={() => void load()} style={BTN_STYLE}>Retry</button>
          </div>
        ) : null}
        {actionMsg ? <div style={{ marginTop: 8, color: "#c8e7b1" }}>{actionMsg}</div> : null}
      </div>

      {!alliance ? (
        <>
          <div style={CARD}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 22 }}>Create Alliance</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
              <input value={createSlug} onChange={(e) => setCreateSlug(e.target.value)} style={INPUT_STYLE} placeholder="slug" />
              <input value={createName} onChange={(e) => setCreateName(e.target.value)} style={INPUT_STYLE} placeholder="name" />
              <input value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} style={INPUT_STYLE} placeholder="description" />
            </div>
            <div style={{ marginTop: 8 }}>
              <button onClick={() => void createAlliance()} style={BTN_STYLE} disabled={busy}>
                {busy ? "Working..." : "Create"}
              </button>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 22 }}>Join Existing Alliance</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <select value={String(joinAllianceId)} onChange={(e) => setJoinAllianceId(Number(e.target.value) || 0)} style={INPUT_STYLE}>
                {alliances.map((a) => (
                  <option key={a.id} value={a.id}>
                    #{a.id} {a.name} ({Number(a.members || 0)} members)
                  </option>
                ))}
              </select>
              <button onClick={() => void joinAlliance()} style={BTN_STYLE} disabled={busy || !joinAllianceId}>
                {busy ? "Working..." : "Join"}
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8 }}>ID</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Name</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Slug</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Members</th>
                  </tr>
                </thead>
                <tbody>
                  {alliances.map((a) => (
                    <tr key={a.id} onClick={() => setJoinAllianceId(Number(a.id))} style={{ cursor: "pointer", background: Number(a.id) === Number(joinAllianceId) ? "rgba(216,176,117,.12)" : "transparent" }}>
                      <td style={{ padding: 8 }}>{a.id}</td>
                      <td style={{ padding: 8 }}>{a.name}</td>
                      <td style={{ padding: 8 }}>{a.slug}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{Number(a.members || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {alliance ? (
        <>
          <div style={CARD}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 24 }}>{alliance.name} [{alliance.slug}]</div>
                <div style={{ color: TEXT_MUTED, marginTop: 4 }}>
                  Role: {member?.role || "member"} • Members: {members.length}/{Number(alliance.memberCap || 15)}
                </div>
                {alliance.description ? <div style={{ color: TEXT_MUTED, marginTop: 4 }}>{alliance.description}</div> : null}
              </div>
              <button onClick={() => void leaveAlliance()} style={BTN_STYLE} disabled={busy}>
                {busy ? "Working..." : "Leave Alliance"}
              </button>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 22 }}>Alliance Members</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8 }}>Kingdom</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Role</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Land</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={`${m.kingdomId}-${m.kingdomName}`}>
                      <td style={{ padding: 8 }}>{m.kingdomName}</td>
                      <td style={{ padding: 8 }}>{m.role}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{Number(m.land || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 22 }}>Alliance Projects</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 10 }}>
              <select value={contribCode} onChange={(e) => setContribCode(e.target.value)} style={INPUT_STYLE}>
                {projects.map((p) => (
                  <option key={p.buildingCode} value={p.buildingCode}>{p.name}</option>
                ))}
              </select>
              <input type="number" min={0} value={contribGold} onChange={(e) => setContribGold(Number(e.target.value) || 0)} style={INPUT_STYLE} placeholder="gold" />
              <input type="number" min={0} value={contribStone} onChange={(e) => setContribStone(Number(e.target.value) || 0)} style={INPUT_STYLE} placeholder="stone" />
              <input type="number" min={0} value={contribWood} onChange={(e) => setContribWood(Number(e.target.value) || 0)} style={INPUT_STYLE} placeholder="wood" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <button onClick={() => void contribute()} style={BTN_STYLE} disabled={busy}>
                {busy ? "Working..." : "Contribute"}
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8 }}>Project</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Effect</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Level</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Gold</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Stone</th>
                    <th style={{ textAlign: "right", padding: 8 }}>Wood</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.buildingCode}>
                      <td style={{ padding: 8 }}>{p.name}</td>
                      <td style={{ padding: 8, color: TEXT_MUTED }}>{p.effectText}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{Number(p.level || 0)}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{Number(p.progressGold || 0).toLocaleString()} / {Number(p.targetGold || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{Number(p.progressStone || 0).toLocaleString()} / {Number(p.targetStone || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{Number(p.progressWood || 0).toLocaleString()} / {Number(p.targetWood || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 22 }}>Diplomacy Relations</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 10 }}>
              <select value={relationType} onChange={(e) => setRelationType(e.target.value)} style={INPUT_STYLE}>
                <option value="ally">ally</option>
                <option value="nap">nap</option>
                <option value="enemy">enemy</option>
                <option value="cease_fire">cease_fire</option>
                <option value="joint_ops">joint_ops</option>
              </select>
              <input value={relationTarget} onChange={(e) => setRelationTarget(e.target.value)} style={INPUT_STYLE} placeholder="target kingdom/alliance" />
              <input value={relationNote} onChange={(e) => setRelationNote(e.target.value)} style={INPUT_STYLE} placeholder="note" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <button onClick={() => void saveRelation()} style={BTN_STYLE} disabled={busy || !relationTarget.trim()}>
                {busy ? "Working..." : "Save Relation"}
              </button>
            </div>
            {relations.length === 0 ? <div style={{ color: TEXT_MUTED }}>No relations set.</div> : null}
            {relations.map((r) => (
              <div key={r.id} style={{ marginBottom: 6 }}>
                {r.relation_type} - {r.target_name}{r.note ? ` (${r.note})` : ""}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#fff7ec" }}>{label}</div>
      <div style={{ color: TEXT_MUTED, marginTop: 8, fontSize: 18, fontWeight: 600 }}>
        This tab is scaffolded and ready for feature implementation.
      </div>
    </div>
  );
}

function HomeView() {
  const kingdom = localStorage.getItem(KINGDOM_STORAGE_KEY) || "";
  const [topKingdoms, setTopKingdoms] = useState<any[]>([]);
  const [myKingdom, setMyKingdom] = useState<any>(null);
  const [season, setSeason] = useState<{ code: string; name: string; remainingSeconds: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [rankRes, kwRes] = await Promise.all([
          fetch(`${API_BASE}/api/rankings/kingdoms?limit=5`),
          kingdom ? fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}`) : Promise.resolve(null),
        ]);
        const rankJ = await rankRes.json();
        if (rankJ.ok) setTopKingdoms(rankJ.kingdoms || []);
        if (kwRes) {
          const kwJ = await kwRes.json();
          if (kwJ.ok) {
            setMyKingdom(kwJ.kingdom);
            if (kwJ.season) setSeason(kwJ.season);
          }
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    void load();
  }, []);

  const SEASON_ICONS: Record<string, string> = { spring: "🌱", summer: "☀️", autumn: "🍂", winter: "❄️" };
  const SEASON_COLORS: Record<string, string> = { spring: "#9ddb8f", summer: "#f5c842", autumn: "#d8854a", winter: "#8ac4f5" };
  const seasonIcon = season ? (SEASON_ICONS[season.code] || "🌍") : "🌍";
  const seasonColor = season ? (SEASON_COLORS[season.code] || ACCENT) : ACCENT;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Hero banner */}
      <div style={{ ...CARD, background: "linear-gradient(135deg, rgba(35,25,12,.9), rgba(60,45,20,.8))", border: "1px solid rgba(216,176,117,.4)", padding: "24px 20px" }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 38, fontWeight: 800, color: "#fff7ec", letterSpacing: "-.01em" }}>
          Crownforge
        </div>
        <div style={{ color: TEXT_MUTED, fontSize: 16, marginTop: 6, maxWidth: 560 }}>
          Build your kingdom. Command armies. Forge alliances. Conquer the realm.
        </div>
        {myKingdom && (
          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "Land", value: Number(myKingdom.land || 0).toLocaleString() + " acres" },
              { label: "Gold", value: Number(myKingdom.gold || 0).toLocaleString() },
              { label: "Networth", value: Number(myKingdom.networth || 0).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "rgba(216,176,117,.12)", borderRadius: 8, padding: "8px 14px", border: "1px solid rgba(216,176,117,.25)" }}>
                <div style={{ fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: ACCENT, fontFamily: FONT_DISPLAY }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Season card */}
        <div style={{ ...CARD }}>
          <div style={{ fontSize: 13, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Current Season</div>
          {loading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : season ? (
            <>
              <div style={{ fontSize: 28, fontWeight: 800, color: seasonColor, fontFamily: FONT_DISPLAY }}>
                {seasonIcon} {season.name}
              </div>
              <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 4 }}>
                {season.remainingSeconds > 86400
                  ? `${Math.floor(season.remainingSeconds / 86400)}d ${Math.floor((season.remainingSeconds % 86400) / 3600)}h remaining`
                  : `${Math.floor(season.remainingSeconds / 3600)}h ${Math.floor((season.remainingSeconds % 3600) / 60)}m remaining`}
              </div>
            </>
          ) : <div style={{ fontSize: 20, fontWeight: 700, color: ACCENT }}>—</div>}
        </div>

        {/* Quick links */}
        <div style={{ ...CARD }}>
          <div style={{ fontSize: 13, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>Quick Actions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              ["Overview", "overview"], ["War Room", "war-room"],
              ["Buildings", "buildings"], ["Holy Circle", "holy-circle"],
              ["Marketplace", "marketplace"], ["Rankings", "rankings"],
            ].map(([label, id]) => (
              <button
                key={id}
                onClick={() => {
                  const ev = new CustomEvent("gg:navigate", { detail: id });
                  window.dispatchEvent(ev);
                }}
                style={{ ...BTN_STYLE, fontSize: 12, padding: "8px 10px", textAlign: "center" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top kingdoms */}
      <div style={CARD}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10, fontFamily: FONT_DISPLAY }}>Top Kingdoms</div>
        {loading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : topKingdoms.length === 0 ? (
          <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No kingdoms yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {topKingdoms.map((k: any, i: number) => (
              <div key={k.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 8, background: i === 0 ? "rgba(216,176,117,.1)" : "transparent", border: "1px solid rgba(216,176,117,.1)" }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: i === 0 ? "#f5c842" : TEXT_MUTED, width: 28, textAlign: "center" }}>#{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: TEXT_MAIN }}>{k.name}</div>
                  <div style={{ fontSize: 12, color: TEXT_MUTED }}>{k.username}{k.alliance_tag ? ` [${k.alliance_tag}]` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: ACCENT, fontFamily: FONT_DISPLAY }}>{Number(k.networth || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: TEXT_MUTED }}>networth</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How to play mini guide */}
      <div style={CARD}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10, fontFamily: FONT_DISPLAY }}>Getting Started</div>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            ["1. Build", "Construct farms, lumberyards, and barracks to grow your economy and army."],
            ["2. Train", "Recruit troops — peasants are free, soldiers cost gold. Balance your forces."],
            ["3. Expand", "Explore unclaimed land to grow your kingdom and unlock settlements."],
            ["4. Conquer", "Attack rival kingdoms to steal resources and capture land."],
            ["5. Pray", "Build Temples and train Priests to channel mana into powerful blessings."],
          ].map(([title, desc]) => (
            <div key={title as string} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(216,176,117,.08)" }}>
              <span style={{ fontWeight: 800, color: ACCENT, minWidth: 80, fontSize: 14 }}>{title}</span>
              <span style={{ color: TEXT_MUTED, fontSize: 14 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ForumsView() {
  const kingdom = localStorage.getItem(KINGDOM_STORAGE_KEY) || "";
  const [tab, setTab] = useState<"global" | "post">("global");
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadActivity() {
    setLoading(true);
    try {
      // Use rankings as a public activity feed (shows who's active, networth changes)
      const r = await fetch(`${API_BASE}/api/rankings/kingdoms?limit=20`);
      const j = await r.json();
      if (j.ok) setPosts(j.kingdoms || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadActivity(); }, []);

  async function sendPigeon(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim() || !subject.trim() || !body.trim()) { setMsg("Fill in all fields."); return; }
    setSending(true); setMsg("");
    try {
      const token = (() => { try { return JSON.parse(localStorage.getItem("gg:auth") || "{}").token; } catch { return ""; } })();
      const r = await fetch(`${API_BASE}/api/pigeons/${encodeURIComponent(kingdom)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toKingdom: to.trim(), subject: subject.trim(), body: body.trim() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to send");
      setMsg("Message sent!"); setTo(""); setSubject(""); setBody("");
    } catch (e: any) { setMsg(`Error: ${String(e?.message || e)}`); }
    finally { setSending(false); }
  }

  const TAB_BTN = (id: "global" | "post", label: string) => (
    <button onClick={() => setTab(id)} style={{ ...BTN_STYLE, background: tab === id ? "rgba(216,176,117,.4)" : "rgba(216,176,117,.1)", borderColor: tab === id ? "rgba(216,176,117,.8)" : "rgba(216,176,117,.3)", fontSize: 14 }}>
      {label}
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={CARD}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Forums</div>
        <div style={{ color: TEXT_MUTED, fontSize: 13, marginBottom: 12 }}>
          Browse the realm's activity or send a private message to another kingdom.
        </div>
        <div style={{ display: "flex", gap: 8 }}>{TAB_BTN("global", "Kingdom Activity")}{TAB_BTN("post", "Send Message")}</div>
      </div>

      {tab === "global" && (
        <div style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Active Kingdoms</div>
            <button onClick={() => void loadActivity()} style={{ ...BTN_STYLE, fontSize: 12, padding: "6px 10px" }}>Refresh</button>
          </div>
          {loading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : posts.length === 0 ? (
            <div style={{ color: TEXT_MUTED }}>No kingdoms yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {posts.map((k: any, i: number) => (
                <div key={k.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(216,176,117,.04)", border: "1px solid rgba(216,176,117,.08)" }}>
                  <span style={{ color: TEXT_MUTED, fontWeight: 700, width: 28, fontSize: 13 }}>#{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, color: TEXT_MAIN }}>{k.name}</span>
                    {k.alliance_tag ? <span style={{ marginLeft: 6, fontSize: 12, color: TEXT_MUTED }}>[{k.alliance_tag}]</span> : null}
                  </div>
                  <div style={{ fontSize: 13, color: TEXT_MUTED }}>{Number(k.land || 0).toLocaleString()} acres</div>
                  <div style={{ fontSize: 13, color: ACCENT, fontWeight: 700 }}>{Number(k.networth || 0).toLocaleString()} NW</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "post" && (
        <div style={{ ...CARD, maxWidth: 520 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Send a Pigeon</div>
          <form onSubmit={sendPigeon} style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: 13, color: TEXT_MUTED }}>To Kingdom<input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Kingdom name" style={{ ...INPUT_STYLE, display: "block", width: "100%", marginTop: 4, boxSizing: "border-box" }} /></label>
            <label style={{ fontSize: 13, color: TEXT_MUTED }}>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={{ ...INPUT_STYLE, display: "block", width: "100%", marginTop: 4, boxSizing: "border-box" }} /></label>
            <label style={{ fontSize: 13, color: TEXT_MUTED }}>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your message…" rows={5} style={{ ...INPUT_STYLE, display: "block", width: "100%", marginTop: 4, boxSizing: "border-box", resize: "vertical" as const }} /></label>
            {msg && <div style={{ fontSize: 13, color: msg.startsWith("Error") ? "#ffb5a5" : "#a8e6a3" }}>{msg}</div>}
            <button type="submit" style={BTN_STYLE} disabled={sending}>{sending ? "Sending…" : "Send Message"}</button>
          </form>
        </div>
      )}
    </div>
  );
}

function AllianceForumsView() {
  const kingdom = localStorage.getItem(KINGDOM_STORAGE_KEY) || "";
  const [allianceData, setAllianceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"roster" | "message">("roster");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    async function load() {
      if (!kingdom) { setLoading(false); return; }
      try {
        const r = await fetch(`${API_BASE}/api/alliance/${encodeURIComponent(kingdom)}`);
        const j = await r.json();
        if (j.ok) setAllianceData(j);
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    void load();
  }, [kingdom]);

  async function sendPigeon(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim() || !subject.trim() || !body.trim()) { setMsg("Fill in all fields."); return; }
    setSending(true); setMsg("");
    try {
      const token = (() => { try { return JSON.parse(localStorage.getItem("gg:auth") || "{}").token; } catch { return ""; } })();
      const r = await fetch(`${API_BASE}/api/pigeons/${encodeURIComponent(kingdom)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toKingdom: to.trim(), subject: subject.trim(), body: body.trim() }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to send");
      setMsg("Message sent!"); setTo(""); setSubject(""); setBody("");
    } catch (e: any) { setMsg(`Error: ${String(e?.message || e)}`); }
    finally { setSending(false); }
  }

  const TAB_BTN = (id: "roster" | "message", label: string) => (
    <button onClick={() => setTab(id)} style={{ ...BTN_STYLE, background: tab === id ? "rgba(216,176,117,.4)" : "rgba(216,176,117,.1)", borderColor: tab === id ? "rgba(216,176,117,.8)" : "rgba(216,176,117,.3)", fontSize: 14 }}>
      {label}
    </button>
  );

  const members: any[] = allianceData?.members || [];
  const allianceName: string = allianceData?.alliance?.name || "";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={CARD}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, marginBottom: 4 }}>
          Alliance Forums {allianceName ? `— ${allianceName}` : ""}
        </div>
        <div style={{ color: TEXT_MUTED, fontSize: 13, marginBottom: 12 }}>
          Coordinate with your allies — view the roster or send a private message.
        </div>
        <div style={{ display: "flex", gap: 8 }}>{TAB_BTN("roster", "Alliance Roster")}{TAB_BTN("message", "Message Ally")}</div>
      </div>

      {loading ? (
        <div style={{ ...CARD, color: TEXT_MUTED }}>Loading…</div>
      ) : !allianceData?.alliance ? (
        <div style={{ ...CARD, color: TEXT_MUTED }}>You are not in an alliance. Join or create one in the Alliance tab.</div>
      ) : (
        <>
          {tab === "roster" && (
            <div style={CARD}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Members ({members.length})</div>
              {members.length === 0 ? (
                <div style={{ color: TEXT_MUTED }}>No members.</div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {members.map((m: any) => (
                    <div key={m.kingdom_name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(216,176,117,.05)", border: "1px solid rgba(216,176,117,.1)" }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, color: TEXT_MAIN }}>{m.kingdom_name}</span>
                        {m.role === "leader" && <span style={{ marginLeft: 6, fontSize: 11, color: "#f5c842", fontWeight: 700, textTransform: "uppercase" }}>Leader</span>}
                        {m.role === "officer" && <span style={{ marginLeft: 6, fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase" }}>Officer</span>}
                      </div>
                      <div style={{ fontSize: 13, color: TEXT_MUTED }}>{m.username}</div>
                      <button
                        onClick={() => { setTab("message"); setTo(m.kingdom_name); }}
                        style={{ ...BTN_STYLE, fontSize: 11, padding: "4px 8px" }}
                      >
                        Message
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "message" && (
            <div style={{ ...CARD, maxWidth: 520 }}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Send Message to Ally</div>
              <form onSubmit={sendPigeon} style={{ display: "grid", gap: 10 }}>
                <label style={{ fontSize: 13, color: TEXT_MUTED }}>
                  To Kingdom
                  <select value={to} onChange={(e) => setTo(e.target.value)} style={{ ...INPUT_STYLE, display: "block", width: "100%", marginTop: 4 }}>
                    <option value="">— select ally —</option>
                    {members.filter((m: any) => m.kingdom_name.toLowerCase() !== kingdom.toLowerCase()).map((m: any) => (
                      <option key={m.kingdom_name} value={m.kingdom_name}>{m.kingdom_name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 13, color: TEXT_MUTED }}>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={{ ...INPUT_STYLE, display: "block", width: "100%", marginTop: 4, boxSizing: "border-box" }} /></label>
                <label style={{ fontSize: 13, color: TEXT_MUTED }}>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your message…" rows={5} style={{ ...INPUT_STYLE, display: "block", width: "100%", marginTop: 4, boxSizing: "border-box", resize: "vertical" as const }} /></label>
                {msg && <div style={{ fontSize: 13, color: msg.startsWith("Error") ? "#ffb5a5" : "#a8e6a3" }}>{msg}</div>}
                <button type="submit" style={BTN_STYLE} disabled={sending}>{sending ? "Sending…" : "Send Message"}</button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WarRoomView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "Elixer");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [trainOpen, setTrainOpen] = useState(true);
  const [attackOpen, setAttackOpen] = useState(false);
  const [trainTroop, setTrainTroop] = useState("footmen");
  const [trainQty, setTrainQty] = useState(1);
  const [attackTarget, setAttackTarget] = useState("");
  const [sentTroops, setSentTroops] = useState<Record<string, number>>({});
  const [targetHints, setTargetHints] = useState<Array<string>>([]);
  const [reports, setReports] = useState<Array<any>>([]);

  async function load() {
    setLoading(true);
    setError("");
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/war-room/${encodeURIComponent(kingdom)}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
      const rr = await fetch(`${API_BASE}/api/war-room/reports/${encodeURIComponent(kingdom)}?limit=12`);
      const rj = await rr.json();
      if (rr.ok && rj?.ok) setReports(Array.isArray(rj.items) ? rj.items : []);
    } catch (e: any) {
      setError(String(e?.message || e));
      setData(null);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = data?.kingdom;
  const troops = (data?.troops || []) as Array<any>;
  const training = (data?.training || []) as Array<any>;
  const troopCodeOptions = troops.filter((t) => Boolean(t.isTrainable)).map((t) => String(t.troopCode || ""));
  const trainTroopData = troops.find((t) => String(t.troopCode || "") === String(trainTroop));
  const trainQtySafe = Math.max(1, Number(trainQty || 1));
  const reqText = trainTroopData?.requiredBuildingName
    ? `${String(trainTroopData.requiredBuildingName)} ${Number(trainTroopData.requiredBuildingLevel || 1)}`
    : "None";

  async function submitTrain(e: React.FormEvent) {
    e.preventDefault();
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          troopCode: trainTroop,
          quantity: Math.max(1, Math.floor(Number(trainQty || 0))),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Queued ${Number(trainQty || 0).toLocaleString()} ${trainTroop}.`);
      await load();
    } catch (e: any) {
      setActionMsg(`Train failed: ${String(e?.message || e)}`);
    }
  }

  async function searchTargets(q: string) {
    try {
      const r = await fetch(`${API_BASE}/api/kingdom-search?q=${encodeURIComponent(q)}&limit=8`);
      const j = await r.json();
      if (r.ok && j?.ok) setTargetHints(Array.isArray(j.items) ? j.items : []);
    } catch {
      setTargetHints([]);
    }
  }

  function updateSent(code: string, value: number) {
    setSentTroops((prev) => ({ ...prev, [code]: Math.max(0, Math.floor(value || 0)) }));
  }

  async function disbandTroop(troopCode: string, maxHome: number) {
    const raw = window.prompt(`How many ${troopCode} do you want to disband? (max ${maxHome.toLocaleString()})`, "0");
    const qty = Math.max(0, Math.floor(Number(raw || 0)));
    if (!qty) return;
    if (qty > maxHome) {
      setActionMsg(`Disband failed: amount exceeds home troops (${maxHome})`);
      return;
    }
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}/disband`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ troopCode, quantity: qty }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const refunded = Number(j.horsesRefunded || 0);
      setActionMsg(refunded > 0 ? `Disbanded ${qty.toLocaleString()} ${troopCode} and refunded ${refunded.toLocaleString()} horses.` : `Disbanded ${qty.toLocaleString()} ${troopCode}.`);
      await load();
    } catch (e: any) {
      setActionMsg(`Disband failed: ${String(e?.message || e)}`);
    }
  }

  async function submitAttack(e: React.FormEvent) {
    e.preventDefault();
    setActionMsg("");
    try {
      const payload = Object.fromEntries(
        Object.entries(sentTroops).filter(([, v]) => Number(v || 0) > 0),
      );
      const r = await fetch(`${API_BASE}/api/war-room/${encodeURIComponent(kingdom)}/attack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defenderKingdom: attackTarget,
          sentTroops: payload,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const eliteMsg = Number(j.elitesPromoted || 0) > 0 ? ` | Elites promoted ${Number(j.elitesPromoted || 0).toLocaleString()}` : "";
      setActionMsg(`Attack result: ${j.result} | Ratio ${Number(j.ratio || 0).toFixed(2)} | Land ${Number(j.landTaken || 0).toLocaleString()}${eliteMsg}`);
      await load();
    } catch (e: any) {
      setActionMsg(`Attack failed: ${String(e?.message || e)}`);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...CARD, background: "linear-gradient(180deg, rgba(52,32,16,0.96), rgba(28,18,10,0.94))" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 42, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY }}>War Room - {k?.name || kingdom}</div>
          <input
            value={kingdom}
            onChange={(e) => setKingdom(e.target.value)}
            style={INPUT_STYLE}
            placeholder="Kingdom name"
          />
          <button onClick={() => void load()} style={BTN_STYLE}>Load</button>
        </div>
        {loading ? <div style={{ marginTop: 8, color: TEXT_MUTED }}>Loading...</div> : null}
        {error ? (
          <div style={{ marginTop: 8, color: "#ffae9a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{error}</span>
            <button onClick={() => void load()} style={BTN_STYLE}>Retry</button>
          </div>
        ) : null}
        {actionMsg ? <div style={{ marginTop: 8, color: "#c8e7b1" }}>{actionMsg}</div> : null}
      </div>

      {k ? (
        <>
          <div style={CARD}>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY }}>Kingdom Status</div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 20, fontWeight: 700 }}>
              Rank: #{k.rank || "N/A"} • Networth: {Math.floor(Number(k.networth || 0)).toLocaleString()}
            </div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 20, fontWeight: 700 }}>
              Population: {Number(k.populationHome || 0).toLocaleString()} / {Number((k.populationHome || 0) + (k.populationTrain || 0) + (k.populationAway || 0)).toLocaleString()}
            </div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 20, fontWeight: 700 }}>
              Food: {Number(k.food || 0).toLocaleString()} • Gold: {Number(k.gold || 0).toLocaleString()} • Horses: {Number(k.horses || 0).toLocaleString()}
            </div>
          </div>

          <div style={{ ...CARD, display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 24, fontFamily: FONT_DISPLAY }}>Kingdom Troops</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid rgba(216,176,117,.38)" }}>Troop</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(216,176,117,.38)" }}>Att</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(216,176,117,.38)" }}>Def</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(216,176,117,.38)" }}>Food</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(216,176,117,.38)" }}>Gold</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(216,176,117,.38)" }}>NW</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(216,176,117,.38)" }}>Home</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(216,176,117,.38)" }}>Train</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(216,176,117,.38)" }}>Away</th>
                      <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid rgba(216,176,117,.38)" }}>Disband</th>
                    </tr>
                  </thead>
                  <tbody>
                    {troops.map((t) => {
                      const code = String(t.troopCode || "");
                      const meta = TROOP_META[code] || { sigil: code.slice(0, 2).toUpperCase(), tint: "linear-gradient(180deg, rgba(86,70,48,.72), rgba(42,32,22,.9))", role: "Kingdom military unit." };
                      return (
                        <tr key={code}>
                          <td style={{ padding: 6, borderBottom: "1px solid rgba(216,176,117,.16)" }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <div style={{ width: 34, height: 34, borderRadius: 6, border: "1px solid rgba(216,176,117,.58)", background: meta.tint, display: "grid", placeItems: "center", color: "#f5e4c9", fontWeight: 800 }}>
                                {meta.sigil}
                              </div>
                              <div>
                                <div style={{ fontSize: 29, fontFamily: FONT_DISPLAY, lineHeight: 1.02 }}>{t.troopName}</div>
                                <div style={{ fontSize: 12, color: "#d8c9b2" }}>{meta.role}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: 6, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.16)" }}>{Number(t.att || 0).toLocaleString()}</td>
                          <td style={{ padding: 6, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.16)" }}>{Number(t.def || 0).toLocaleString()}</td>
                          <td style={{ padding: 6, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.16)" }}>{Number(t.upkeepFood || 0).toLocaleString()}</td>
                          <td style={{ padding: 6, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.16)" }}>{Number(t.upkeepGold || 0).toLocaleString()}</td>
                          <td style={{ padding: 6, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.16)" }}>{Number(t.nw || 0).toLocaleString()}</td>
                          <td style={{ padding: 6, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.16)", fontFamily: FONT_DISPLAY, fontSize: 25 }}>{Number(t.home || 0).toLocaleString()}</td>
                          <td style={{ padding: 6, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.16)" }}>{Number(t.train || 0).toLocaleString()}</td>
                          <td style={{ padding: 6, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.16)" }}>{Number(t.away || 0).toLocaleString()}</td>
                          <td style={{ padding: 6, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.16)" }}>
                            <button style={{ ...BTN_STYLE, padding: "5px 9px" }} onClick={() => void disbandTroop(code, Number(t.home || 0))}>Trash</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 24, fontFamily: FONT_DISPLAY }}>Actions</div>
              <div style={{ border: "1px solid rgba(216,176,117,.24)", borderRadius: 10, overflow: "hidden" }}>
                <button onClick={() => setTrainOpen((v) => !v)} style={{ ...BTN_STYLE, width: "100%", textAlign: "left", borderRadius: 0, border: "none", borderBottom: "1px solid rgba(216,176,117,.2)" }}>
                  {trainOpen ? "-" : "+"} Train Troops
                </button>
                {trainOpen ? (
                  <form onSubmit={submitTrain} style={{ padding: 10, display: "grid", gap: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 8 }}>
                      <div style={{ ...INPUT_STYLE }}>Population Types</div>
                      <select value={trainTroop} onChange={(e) => setTrainTroop(e.target.value)} style={INPUT_STYLE}>
                        {troopCodeOptions.map((code) => {
                          const tr = troops.find((t) => String(t.troopCode || "") === code);
                          return <option key={code} value={code}>{String(tr?.troopName || code)}</option>;
                        })}
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 8 }}>
                      <div style={{ ...INPUT_STYLE }}>Amount To Train</div>
                      <input type="number" min={1} max={50000} value={trainQty} onChange={(e) => setTrainQty(Math.max(1, Number(e.target.value || 1)))} style={INPUT_STYLE} />
                    </div>
                    {trainTroopData ? (
                      <div style={{ color: TEXT_MUTED }}>
                        {trainTroopData.troopName} • Training Time: {formatDuration(Number(trainTroopData.trainSeconds || 0) * trainQtySafe)}
                        <br />
                        Stats: Att {Number(trainTroopData.att || 0)} • Def {Number(trainTroopData.def || 0)} • NW {Number(trainTroopData.nw || 0)}
                        <br />
                        Costs: Gold {(Number(trainTroopData.goldCost || 0) * trainQtySafe).toLocaleString()} • Food {(Number(trainTroopData.foodCost || 0) * trainQtySafe).toLocaleString()} • Horses {(Number(trainTroopData.horseCost || 0) * trainQtySafe).toLocaleString()}
                        <br />
                        Upkeep/h each: Gold {Number(trainTroopData.upkeepGold || 0)} • Food {Number(trainTroopData.upkeepFood || 0)}
                        <br />
                        Requirement: {reqText}
                        {trainTroopData.requiredBuildingName ? ` (you have ${Number(trainTroopData.currentRequiredBuildingLevel || 0)})` : ""}
                        {!Boolean(trainTroopData.canTrainNow) ? " - requirement not met." : ""}
                        <br />
                        {String(trainTroopData.notes || TROOP_META[String(trainTroopData.troopCode || "")]?.role || "")}
                      </div>
                    ) : null}
                    <button type="submit" style={BTN_STYLE} disabled={trainTroopData && !Boolean(trainTroopData.canTrainNow)}>
                      {trainTroopData && !Boolean(trainTroopData.canTrainNow) ? "Requirement Missing" : "Train Now"}
                    </button>
                  </form>
                ) : null}

                <button onClick={() => setAttackOpen((v) => !v)} style={{ ...BTN_STYLE, width: "100%", textAlign: "left", borderRadius: 0, border: "none", borderTop: "1px solid rgba(216,176,117,.2)" }}>
                  {attackOpen ? "-" : "+"} Attack Kingdom
                </button>
                {attackOpen ? (
                  <form onSubmit={submitAttack} style={{ padding: 10, display: "grid", gap: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 8 }}>
                      <div style={{ ...INPUT_STYLE }}>Kingdom Name</div>
                      <input
                        value={attackTarget}
                        onChange={(e) => {
                          setAttackTarget(e.target.value);
                          void searchTargets(e.target.value);
                        }}
                        placeholder="Kingdom to attack..."
                        style={INPUT_STYLE}
                        list="attack-hints"
                      />
                      <datalist id="attack-hints">
                        {targetHints.map((n) => <option key={n} value={n} />)}
                      </datalist>
                    </div>
                    <div style={{ fontWeight: 700 }}>Troops To Send...</div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {troops.map((t) => (
                        <div key={`atk-${t.troopCode}`} style={{ display: "grid", gridTemplateColumns: "170px 1fr 120px", gap: 8, alignItems: "center" }}>
                          <div>{t.troopName}</div>
                          <input
                            type="number"
                            min={0}
                            max={Number(t.home || 0)}
                            value={Number(sentTroops[t.troopCode] || 0)}
                            onChange={(e) => updateSent(t.troopCode, Math.min(Number(t.home || 0), Number(e.target.value || 0)))}
                            style={INPUT_STYLE}
                          />
                          <div style={{ textAlign: "right" }}>/ {Number(t.home || 0).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                    <button type="submit" style={BTN_STYLE}>Send Attack</button>
                  </form>
                ) : null}
              </div>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Training...</div>
            {training.length === 0 ? <div style={{ opacity: 0.8 }}>No active training queue.</div> : null}
            {training.map((q) => (
              <div key={q.id} style={{ marginBottom: 6 }}>
                {Number(q.quantity || 0).toLocaleString()} x {q.troop_code} • {String(q.completes_at).replace("T", " ").slice(0, 19)}
              </div>
            ))}
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent Battles</div>
            {reports.length === 0 ? <div style={{ opacity: 0.8 }}>No recent reports.</div> : null}
            {reports.map((r) => (
              <div key={r.id} style={{ marginBottom: 6 }}>
                {String(r.created_at).replace("T", " ").slice(0, 19)} • {r.attacker_name} vs {r.defender_name} • {r.result} • Land {Number(r.land_taken || 0).toLocaleString()}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function TrainTroopsView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "Elixer");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [trainTroop, setTrainTroop] = useState("pikemen");
  const [trainQty, setTrainQty] = useState(1000);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/war-room/${encodeURIComponent(kingdom)}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) {
      setError(String(e?.message || e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = data?.kingdom;
  const troops = (data?.troops || []) as Array<any>;
  const training = (data?.training || []) as Array<any>;
  const troopCodeOptions = troops.filter((t) => Boolean(t.isTrainable)).map((t) => String(t.troopCode || ""));

  async function submitTrain(e: React.FormEvent) {
    e.preventDefault();
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          troopCode: trainTroop,
          quantity: Math.max(1, Math.floor(Number(trainQty || 0))),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Queued ${Number(trainQty || 0).toLocaleString()} ${trainTroop}.`);
      await load();
    } catch (e: any) {
      setActionMsg(`Train failed: ${String(e?.message || e)}`);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Train Troops</div>
          <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={INPUT_STYLE} />
          <button onClick={() => void load()} style={BTN_STYLE}>
            Load
          </button>
        </div>
        {loading ? <div style={{ marginTop: 8 }}>Loading...</div> : null}
        {error ? (
          <div style={{ marginTop: 8, color: "#ffae9a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{error}</span>
            <button onClick={() => void load()} style={BTN_STYLE}>Retry</button>
          </div>
        ) : null}
        {actionMsg ? <div style={{ marginTop: 8, color: "#c8e7b1" }}>{actionMsg}</div> : null}
      </div>

      {k ? (
        <>
          <div style={CARD}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Kingdom Troops</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 6 }}>Troop</th>
                    <th style={{ textAlign: "right", padding: 6 }}>Home</th>
                    <th style={{ textAlign: "right", padding: 6 }}>Train</th>
                    <th style={{ textAlign: "right", padding: 6 }}>Away</th>
                  </tr>
                </thead>
                <tbody>
                  {troops.map((t) => (
                    <tr key={t.troopCode}>
                      <td style={{ padding: 6 }}>{t.troopName}</td>
                      <td style={{ padding: 6, textAlign: "right" }}>{Number(t.home || 0).toLocaleString()}</td>
                      <td style={{ padding: 6, textAlign: "right" }}>{Number(t.train || 0).toLocaleString()}</td>
                      <td style={{ padding: 6, textAlign: "right" }}>{Number(t.away || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={CARD}>
            <form onSubmit={submitTrain} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={trainTroop} onChange={(e) => setTrainTroop(e.target.value)} style={INPUT_STYLE}>
                {troopCodeOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={50000}
                value={trainQty}
                onChange={(e) => setTrainQty(Math.max(1, Number(e.target.value || 1)))}
                style={{ ...INPUT_STYLE, width: 130 }}
              />
              <button type="submit" style={BTN_STYLE}>
                Queue Training
              </button>
            </form>
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Training Queue</div>
            {training.length === 0 ? <div style={{ opacity: 0.8 }}>No active training queue.</div> : null}
            {training.map((q) => (
              <div key={q.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 14 }}>{Number(q.quantity || 0).toLocaleString()} × {String(q.troop_code).replace(/_/g, " ")}</span>
                <QueueCountdown completesAt={q.completes_at} onComplete={() => void load()} />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function AttackKingdomView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "Elixer");
  const [data, setData] = useState<any>(null);
  const [reports, setReports] = useState<Array<any>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [attackTarget, setAttackTarget] = useState("");
  const [sentTroops, setSentTroops] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/war-room/${encodeURIComponent(kingdom)}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
      const rr = await fetch(`${API_BASE}/api/war-room/reports/${encodeURIComponent(kingdom)}?limit=12`);
      const rj = await rr.json();
      if (rr.ok && rj?.ok) setReports(Array.isArray(rj.items) ? rj.items : []);
    } catch (e: any) {
      setError(String(e?.message || e));
      setData(null);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const troops = (data?.troops || []) as Array<any>;

  function updateSent(code: string, value: number) {
    setSentTroops((prev) => ({ ...prev, [code]: Math.max(0, Math.floor(value || 0)) }));
  }

  async function submitAttack(e: React.FormEvent) {
    e.preventDefault();
    setActionMsg("");
    try {
      const payload = Object.fromEntries(Object.entries(sentTroops).filter(([, v]) => Number(v || 0) > 0));
      const r = await fetch(`${API_BASE}/api/war-room/${encodeURIComponent(kingdom)}/attack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defenderKingdom: attackTarget,
          sentTroops: payload,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Attack result: ${j.result} | Ratio ${Number(j.ratio || 0).toFixed(2)} | Land ${Number(j.landTaken || 0).toLocaleString()}`);
      await load();
    } catch (e: any) {
      setActionMsg(`Attack failed: ${String(e?.message || e)}`);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Attack Kingdom</div>
          <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={INPUT_STYLE} />
          <button onClick={() => void load()} style={BTN_STYLE}>
            Load
          </button>
        </div>
        {loading ? <div style={{ marginTop: 8 }}>Loading...</div> : null}
        {error ? (
          <div style={{ marginTop: 8, color: "#ffae9a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{error}</span>
            <button onClick={() => void load()} style={BTN_STYLE}>Retry</button>
          </div>
        ) : null}
        {actionMsg ? <div style={{ marginTop: 8, color: "#c8e7b1" }}>{actionMsg}</div> : null}
      </div>

      <div style={CARD}>
        <form onSubmit={submitAttack} style={{ display: "grid", gap: 8 }}>
          <input value={attackTarget} onChange={(e) => setAttackTarget(e.target.value)} placeholder="Defender kingdom" style={{ ...INPUT_STYLE, minWidth: 220 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
            {troops.map((t) => (
              <label key={t.troopCode} style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.85 }}>
                  {t.troopName} (home {Number(t.home || 0).toLocaleString()})
                </span>
                <input
                  type="number"
                  min={0}
                  max={Number(t.home || 0)}
                  value={Number(sentTroops[t.troopCode] || 0)}
                  onChange={(e) => updateSent(t.troopCode, Math.min(Number(t.home || 0), Number(e.target.value || 0)))}
                  style={INPUT_STYLE}
                />
              </label>
            ))}
          </div>
          <div>
            <button type="submit" style={BTN_STYLE}>
              Launch Attack
            </button>
          </div>
        </form>
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent Battles</div>
        {reports.length === 0 ? <div style={{ opacity: 0.8 }}>No recent reports.</div> : null}
        {reports.map((r) => (
          <div key={r.id} style={{ marginBottom: 6 }}>
            {String(r.created_at).replace("T", " ").slice(0, 19)} • {r.attacker_name} vs {r.defender_name} • {r.result} • Land {Number(r.land_taken || 0).toLocaleString()}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmailVerifyBanner({ token, onVerified }: { token: string; onVerified: () => void }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function resend() {
    setSending(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/auth/resend-verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Failed");
      setSent(true);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ borderRadius: 8, background: "rgba(216,140,40,.12)", border: "1px solid rgba(216,140,40,.4)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 18 }}>📧</span>
      <div style={{ flex: 1, fontSize: 14, color: "#f5d08a" }}>
        <strong>Your email is not verified.</strong> Check your inbox for the verification link.
      </div>
      {sent ? (
        <span style={{ color: "#9ddb8f", fontSize: 13 }}>✓ Email sent</span>
      ) : (
        <button onClick={() => void resend()} disabled={sending} style={{ ...BTN_STYLE, fontSize: 12, padding: "4px 12px" }}>
          {sending ? "Sending…" : "Resend Email"}
        </button>
      )}
      {err && <span style={{ color: "#ffb5a5", fontSize: 13 }}>{err}</span>}
    </div>
  );
}

function AuthGate(props: { onAuthenticated: (auth: AuthState) => void }) {
  // Detect ?verify= or ?reset= in URL on mount
  const urlParams = new URLSearchParams(window.location.search);
  const urlVerifyToken = urlParams.get("verify") || "";
  const urlResetToken = urlParams.get("reset") || "";

  type Screen = "login" | "register" | "forgot" | "verify-pending" | "verify-result" | "reset";
  const initScreen: Screen = urlVerifyToken ? "verify-result" : urlResetToken ? "reset" : "login";

  const [screen, setScreen] = useState<Screen>(initScreen);
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [kingdomName, setKingdomName] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function readJsonSafe(r: Response) {
    const text = await r.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    }
  }

  // Auto-verify if token is in URL
  useEffect(() => {
    if (urlVerifyToken && screen === "verify-result") {
      setBusy(true);
      fetch(`${API_BASE}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: urlVerifyToken }),
      })
        .then((r) => readJsonSafe(r))
        .then((j) => {
          if (j?.ok) setMsg("Your email has been verified! You can now log in.");
          else setError(j?.error || "Verification failed.");
        })
        .catch((e: any) => setError(String(e?.message || e || "Network error during verification.")))
        .finally(() => {
          setBusy(false);
          // Clean the URL so a reload doesn't re-trigger
          window.history.replaceState({}, "", window.location.pathname);
        });
    }
  }, []);

  function buildAuth(j: any): AuthState {
    return {
      token: String(j?.session?.token || ""),
      user: {
        id: String(j?.user?.id || ""),
        username: String(j?.user?.username || ""),
        email: String(j?.user?.email || ""),
        emailVerified: Boolean(j?.user?.emailVerified),
      },
      kingdom: j?.kingdom ? { id: Number(j.kingdom.id), name: String(j.kingdom.name) } : null,
      expiresAt: String(j?.session?.expiresAt || ""),
    };
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrUsername, password }),
      });
      const j = await readJsonSafe(r);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}: empty or invalid response`);
      const auth = buildAuth(j);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
      if (auth.kingdom?.name) localStorage.setItem(KINGDOM_STORAGE_KEY, auth.kingdom.name);
      props.onAuthenticated(auth);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password, kingdomName }),
      });
      const j = await readJsonSafe(r);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}: empty or invalid response`);
      // Log in immediately but show the "check your email" screen
      const auth = buildAuth(j);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
      if (auth.kingdom?.name) localStorage.setItem(KINGDOM_STORAGE_KEY, auth.kingdom.name);
      setRegisteredEmail(email);
      setScreen("verify-pending");
      // Authenticate in background — user can proceed to game
      props.onAuthenticated(auth);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await readJsonSafe(r);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}: empty or invalid response`);
      setMsg(j.message || "If that email exists, a reset link has been sent.");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: urlResetToken, newPassword }),
      });
      const j = await readJsonSafe(r);
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}: empty or invalid response`);
      setMsg("Password reset successfully. You can now log in.");
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setScreen("login"), 2000);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const authBg: React.CSSProperties = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 16,
    color: TEXT_MAIN,
    fontFamily: FONT_BODY,
    background: "radial-gradient(1200px 700px at 85% 20%, rgba(92,76,58,0.45), rgba(23,23,25,0.92)), linear-gradient(180deg, #2b2b2f 0%, #1a1a1d 48%, #161515 100%)",
  };

  // ── Email verified / reset result screen ──
  if (screen === "verify-result") {
    return (
      <main style={authBg}>
        <div style={{ ...CARD, width: "min(480px, 96vw)", textAlign: "center" }}>
          <div style={{ fontSize: 36, fontFamily: FONT_DISPLAY, fontWeight: 800, marginBottom: 14 }}>Crownforge</div>
          {busy && <div style={{ color: TEXT_MUTED, marginBottom: 10 }}>Verifying your email…</div>}
          {msg && <div style={{ color: "#9ddb8f", marginBottom: 14, fontSize: 15 }}>✓ {msg}</div>}
          {error && <div style={{ color: "#ffb5a5", marginBottom: 14, fontSize: 15 }}>{error}</div>}
          {!busy && <button onClick={() => setScreen("login")} style={BTN_STYLE}>Go to Login</button>}
        </div>
      </main>
    );
  }

  // ── Reset password screen ──
  if (screen === "reset") {
    return (
      <main style={authBg}>
        <div style={{ ...CARD, width: "min(480px, 96vw)" }}>
          <div style={{ fontSize: 36, fontFamily: FONT_DISPLAY, fontWeight: 800, marginBottom: 6 }}>Crownforge</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, color: ACCENT }}>Reset Password</div>
          {msg ? (
            <div style={{ color: "#9ddb8f", fontSize: 15 }}>✓ {msg}</div>
          ) : (
            <form onSubmit={submitReset} style={{ display: "grid", gap: 8 }}>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (8+ chars)"
                style={INPUT_STYLE}
                minLength={8}
                required
              />
              <button type="submit" style={BTN_STYLE} disabled={busy}>{busy ? "Resetting…" : "Set New Password"}</button>
            </form>
          )}
          {error && <div style={{ color: "#ffb5a5", marginTop: 8 }}>{error}</div>}
          <button onClick={() => setScreen("login")} style={{ ...BTN_STYLE, marginTop: 10, background: "transparent", color: TEXT_MUTED, fontSize: 13 }}>← Back to Login</button>
        </div>
      </main>
    );
  }

  return (
    <main style={authBg}>
      <div style={{ ...CARD, width: "min(560px, 96vw)" }}>
        <div style={{ fontSize: 40, fontFamily: FONT_DISPLAY, fontWeight: 800, marginBottom: 10 }}>Crownforge</div>

        {/* Tab bar — only on login/register */}
        {(screen === "login" || screen === "register") && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => { setScreen("login"); setError(""); setMsg(""); }} style={{ ...BTN_STYLE, background: screen === "login" ? "rgba(216,176,117,.35)" : (BTN_STYLE.background as string) }}>Login</button>
            <button onClick={() => { setScreen("register"); setError(""); setMsg(""); }} style={{ ...BTN_STYLE, background: screen === "register" ? "rgba(216,176,117,.35)" : (BTN_STYLE.background as string) }}>Register</button>
          </div>
        )}

        {/* Login */}
        {screen === "login" && (
          <>
            <form onSubmit={submitLogin} style={{ display: "grid", gap: 8 }}>
              <input value={emailOrUsername} onChange={(e) => setEmailOrUsername(e.target.value)} placeholder="Email or Username" style={INPUT_STYLE} required />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={INPUT_STYLE} required />
              <button type="submit" style={BTN_STYLE} disabled={busy}>{busy ? "Logging in…" : "Login"}</button>
            </form>
            <button onClick={() => { setScreen("forgot"); setError(""); setMsg(""); }} style={{ marginTop: 10, background: "none", border: "none", color: TEXT_MUTED, fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Forgot password?
            </button>
          </>
        )}

        {/* Register */}
        {screen === "register" && (
          <form onSubmit={submitRegister} style={{ display: "grid", gap: 8 }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={INPUT_STYLE} required />
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" style={INPUT_STYLE} required />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ chars)" style={INPUT_STYLE} minLength={8} required />
            <input value={kingdomName} onChange={(e) => setKingdomName(e.target.value)} placeholder="Kingdom Name" style={INPUT_STYLE} required />
            <button type="submit" style={BTN_STYLE} disabled={busy}>{busy ? "Creating account…" : "Create Account"}</button>
          </form>
        )}

        {/* Forgot password */}
        {screen === "forgot" && (
          <>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 10, color: ACCENT }}>Forgot Password</div>
            {msg ? (
              <div style={{ color: "#9ddb8f", fontSize: 14 }}>✓ {msg}</div>
            ) : (
              <form onSubmit={submitForgot} style={{ display: "grid", gap: 8 }}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your account email" style={INPUT_STYLE} required />
                <button type="submit" style={BTN_STYLE} disabled={busy}>{busy ? "Sending…" : "Send Reset Link"}</button>
              </form>
            )}
            <button onClick={() => { setScreen("login"); setError(""); setMsg(""); }} style={{ marginTop: 10, background: "none", border: "none", color: TEXT_MUTED, fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              ← Back to Login
            </button>
          </>
        )}

        {/* Check your email (post-register) */}
        {screen === "verify-pending" && (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📬</div>
            <div style={{ fontWeight: 700, fontSize: 17, color: "#fff7ec", marginBottom: 6 }}>Check your email</div>
            <div style={{ color: TEXT_MUTED, fontSize: 14, lineHeight: 1.6 }}>
              We sent a verification link to <strong style={{ color: ACCENT }}>{registeredEmail}</strong>.<br />
              Click the link to verify your account. You can play while you wait.
            </div>
          </div>
        )}

        {error ? <div style={{ color: "#ffb5a5", marginTop: 8, fontSize: 14 }}>{error}</div> : null}
      </div>
    </main>
  );
}

const RESOURCE_LABELS: Record<string, string> = {
  food: "Food",
  wood: "Wood",
  stone: "Stone",
  horses: "Horses",
};

const RESOURCE_ICONS: Record<string, string> = {
  food: "🌾",
  wood: "🪵",
  stone: "🪨",
  horses: "🐴",
};

// ── Prayer definitions (mirrors API) ────────────────────────────────────────
const PRAYER_DEFS: Record<string, { name: string; effect: string; manaPerDay: number; icon: string }> = {
  attacking_wrath:    { name: "Attacking Wrath",    effect: "Increases the attacking values of troops by 5%",                     manaPerDay: 500,  icon: "⚔️" },
  steeds_fury:        { name: "Steed's Fury",        effect: "All mounted troops have increased attack statistics (5%)",           manaPerDay: 600,  icon: "🐴" },
  falors_gift:        { name: "Falor's Gift",        effect: "Increases the amount of Gold Generated (5%)",                       manaPerDay: 700,  icon: "💰" },
  fertility_blessing: { name: "Fertility Blessing",  effect: "Increases the rate that population arrives (5%)",                   manaPerDay: 1000, icon: "🌱" },
  masons_benefice:    { name: "Masons Benefice",     effect: "Increases the rate of stone collection (10%)",                      manaPerDay: 700,  icon: "🪨" },
  foresters_delight:  { name: "Forester's Delight",  effect: "Increases the wood collection rate (10%)",                          manaPerDay: 700,  icon: "🌲" },
  nastfurus_healing:  { name: "Nastfuru's Healing",  effect: "Reduces the casualty rate in battle (9%)",                          manaPerDay: 700,  icon: "✨" },
  natures_gift:       { name: "Nature's Gift",       effect: "Increases the yield of Grain (5%)",                                 manaPerDay: 700,  icon: "🌾" },
  springs_effect:     { name: "Springs Effect",      effect: "Increases the amount of animals produced by Kingdom farms (9%)",    manaPerDay: 1000, icon: "🌊" },
  traders_whip:       { name: "Trader's Whip",       effect: "Increases the speed that market wagons purchase from market (25%)", manaPerDay: 1000, icon: "🛒" },
};

function PrayView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [selectedPrayer, setSelectedPrayer] = useState(Object.keys(PRAYER_DEFS)[0]);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!kingdom.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/pray/${encodeURIComponent(kingdom)}`);
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function startPrayer(e: React.FormEvent) {
    e.preventDefault();
    setActionMsg("");
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/pray/${encodeURIComponent(kingdom)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prayerCode: selectedPrayer, days }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const def = PRAYER_DEFS[selectedPrayer];
      setActionMsg(`${def?.name || selectedPrayer} started for ${days} days.`);
      await load();
    } catch (e: any) { setActionMsg(`Error: ${String(e?.message || e)}`); }
    finally { setBusy(false); }
  }

  async function stopPrayer(prayerId: number, prayerCode: string) {
    if (!confirm(`Cancel "${PRAYER_DEFS[prayerCode]?.name || prayerCode}"? No mana refund.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/pray/${encodeURIComponent(kingdom)}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prayerId }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setActionMsg("Prayer cancelled.");
      await load();
    } catch (e: any) { setActionMsg(`Error: ${String(e?.message || e)}`); }
    finally { setBusy(false); }
  }

  const mana: number = data?.mana ?? 0;
  const priests: number = data?.priests ?? 0;
  const priestCap: number = data?.priestCap ?? 0;
  const manaPerHour: number = data?.manaPerHour ?? 0;
  const activePrayers: any[] = data?.activePrayers ?? [];
  const selDef = PRAYER_DEFS[selectedPrayer];
  const totalManaCost = selDef ? selDef.manaPerDay * days : 0;
  const canAfford = mana >= totalManaCost;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Header */}
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY }}>Holy Circle — {kingdom || "…"}</div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 16 }}>
              Priests channel divine power into sustained prayers that bless your kingdom.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={INPUT_STYLE} placeholder="Kingdom name" />
            <button onClick={() => void load()} style={BTN_STYLE}>Load</button>
          </div>
        </div>
        {loading && <div style={{ marginTop: 8, color: TEXT_MUTED }}>Loading…</div>}
        {error && <div style={{ marginTop: 8, color: "#ffae9a" }}>{error}</div>}
        {actionMsg && <div style={{ marginTop: 8, color: "#c8e7b1" }}>{actionMsg}</div>}
      </div>

      {/* Mana + Priests stats */}
      {data && (
        <div style={{ ...CARD, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div style={{ background: "rgba(140,100,200,.12)", borderRadius: 10, padding: "12px 16px", border: "1px solid rgba(180,140,240,.25)" }}>
            <div style={{ fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Mana</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#c8b8f8", fontFamily: FONT_DISPLAY }}>{mana.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2 }}>+{manaPerHour}/hr from {Math.min(priests, priestCap)} priest{Math.min(priests, priestCap) !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ background: "rgba(216,176,117,.08)", borderRadius: 10, padding: "12px 16px", border: "1px solid rgba(216,176,117,.2)" }}>
            <div style={{ fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Priests</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: ACCENT, fontFamily: FONT_DISPLAY }}>{priests} / {priestCap}</div>
            <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2 }}>cap: {priestCap} · 5 per Temple · 4 mana/hr each</div>
          </div>
        </div>
      )}

      {/* Prayers In Progress */}
      {activePrayers.length > 0 && (
        <div style={CARD}>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 10 }}>Prayers In Progress</div>
          {activePrayers.map((ap: any) => {
            const def = PRAYER_DEFS[ap.prayer_code];
            const endsAt = new Date(ap.ends_at);
            const remaining = Math.max(0, endsAt.getTime() - Date.now());
            const daysLeft = Math.floor(remaining / 86400000);
            const hoursLeft = Math.floor((remaining % 86400000) / 3600000);
            const timeStr = daysLeft > 0 ? `${daysLeft}d ${hoursLeft}h remaining` : `${hoursLeft}h remaining`;
            return (
              <div key={ap.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(216,176,117,.1)" }}>
                <span style={{ fontSize: 22, width: 28, textAlign: "center" }}>{def?.icon || "✨"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#fff7ec" }}>{def?.name || ap.prayer_code}</div>
                  <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 1 }}>{def?.effect}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: "#c8b8f8", fontWeight: 600 }}>{timeStr}</div>
                  <div style={{ fontSize: 12, color: TEXT_MUTED }}>{Number(ap.mana_spent).toLocaleString()} mana spent</div>
                </div>
                <button
                  onClick={() => void stopPrayer(ap.id, ap.prayer_code)}
                  disabled={busy}
                  style={{ ...BTN_STYLE, background: "rgba(180,60,60,.7)", fontSize: 12, padding: "4px 10px" }}
                >
                  Cancel
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pray panel */}
      <div style={CARD}>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 12 }}>Pray</div>
        <form onSubmit={startPrayer} style={{ display: "grid", gap: 10 }}>
          {/* Prayer selector + days row */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={selectedPrayer}
              onChange={(e) => setSelectedPrayer(e.target.value)}
              style={{ ...INPUT_STYLE, minWidth: 200 }}
            >
              {Object.entries(PRAYER_DEFS).map(([code, def]) => (
                <option key={code} value={code}>{def.name}</option>
              ))}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: TEXT_MUTED, fontSize: 14 }}>Days:</span>
              <input
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value || 1))))}
                style={{ ...INPUT_STYLE, width: 70 }}
              />
            </div>
            <button type="submit" style={BTN_STYLE} disabled={busy || !canAfford || !data}>
              {busy ? "Starting…" : "Start Prayer"}
            </button>
          </div>

          {/* Info card for selected prayer */}
          {selDef && (
            <div style={{ borderRadius: 10, border: "1px solid rgba(180,140,240,.3)", padding: "14px 16px", background: "rgba(100,60,180,.1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 28 }}>{selDef.icon}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: "#fff7ec" }}>{selDef.name}</div>
                  <div style={{ fontSize: 13, color: "#d8cfc0", marginTop: 2 }}>{selDef.effect}</div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Costs</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                <span style={{ fontSize: 17, width: 24, textAlign: "center", flexShrink: 0 }}>✨</span>
                <span style={{ color: TEXT_MUTED, fontSize: 13, width: 46, flexShrink: 0 }}>Mana</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: canAfford ? "#c8b8f8" : "#ff6b47", fontFamily: FONT_DISPLAY, minWidth: 90 }}>
                  {totalManaCost.toLocaleString()}
                </span>
                <span style={{ color: TEXT_MUTED, fontSize: 13 }}>/ {mana.toLocaleString()} available</span>
              </div>
              <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 4 }}>
                {selDef.manaPerDay.toLocaleString()} mana/day × {days} days = {totalManaCost.toLocaleString()} total
              </div>
            </div>
          )}
        </form>
      </div>

      {/* All prayers reference table */}
      <div style={CARD}>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 10 }}>All Prayers</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(216,176,117,.4)", color: ACCENT, fontSize: 13 }}>Prayer</th>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(216,176,117,.4)", color: ACCENT, fontSize: 13 }}>Effect</th>
                <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid rgba(216,176,117,.4)", color: ACCENT, fontSize: 13 }}>Mana / Day</th>
                <th style={{ textAlign: "center", padding: "8px 10px", borderBottom: "1px solid rgba(216,176,117,.4)", color: ACCENT, fontSize: 13 }}>Active</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(PRAYER_DEFS).map(([code, def]) => {
                const isActive = activePrayers.some((ap: any) => ap.prayer_code === code);
                return (
                  <tr
                    key={code}
                    style={{ cursor: "pointer", background: isActive ? "rgba(140,100,200,.12)" : "transparent" }}
                    onClick={() => setSelectedPrayer(code)}
                  >
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(216,176,117,.08)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{def.icon}</span>
                        <span style={{ fontWeight: 600, color: isActive ? "#c8b8f8" : TEXT_MAIN }}>{def.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(216,176,117,.08)", fontSize: 13, color: TEXT_MUTED }}>{def.effect}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(216,176,117,.08)", textAlign: "right", fontWeight: 700, color: ACCENT, fontFamily: FONT_DISPLAY }}>{def.manaPerDay.toLocaleString()}</td>
                    <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(216,176,117,.08)", textAlign: "center" }}>
                      {isActive ? <span style={{ color: "#9ddb8f", fontWeight: 700 }}>✓ Active</span> : <span style={{ color: TEXT_MUTED }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MarketplaceView() {
  const kingdom = localStorage.getItem(KINGDOM_STORAGE_KEY) || "";
  const [tab, setTab] = useState<"browse" | "sell" | "history">("browse");
  const [filterResource, setFilterResource] = useState("all");
  const [listings, setListings] = useState<any[]>([]);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // Create listing form
  const [sellResource, setSellResource] = useState("food");
  const [sellQty, setSellQty] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellBusy, setSellBusy] = useState(false);

  // Buy state
  const [buyQtyMap, setBuyQtyMap] = useState<Record<number, string>>({});
  const [buyBusy, setBuyBusy] = useState<number | null>(null);

  async function loadBrowse() {
    setLoading(true);
    setError("");
    try {
      const url = filterResource === "all"
        ? `${API_BASE}/api/market`
        : `${API_BASE}/api/market?resource=${encodeURIComponent(filterResource)}`;
      const r = await fetch(url);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to load market");
      setListings(j.listings || []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/market/${encodeURIComponent(kingdom)}/history`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to load history");
      setTrades(j.trades || []);
      setMyListings(j.myListings || []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "browse") loadBrowse();
    else if (tab === "history") loadHistory();
  }, [tab, filterResource]);

  async function handleSell(e: React.FormEvent) {
    e.preventDefault();
    setSellBusy(true);
    setError("");
    setStatusMsg("");
    try {
      const qty = parseInt(sellQty, 10);
      const price = parseInt(sellPrice, 10);
      if (!qty || !price) throw new Error("Enter valid quantity and price");
      const r = await fetch(`${API_BASE}/api/market/${encodeURIComponent(kingdom)}/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: sellResource, quantity: qty, pricePerUnit: price }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to create listing");
      setStatusMsg(`Listed ${qty.toLocaleString()} ${RESOURCE_LABELS[sellResource]} at ${price.toLocaleString()} gold each.`);
      setSellQty("");
      setSellPrice("");
      loadHistory();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSellBusy(false);
    }
  }

  async function handleBuy(listingId: number, pricePerUnit: number, available: number) {
    const rawQty = buyQtyMap[listingId] || String(available);
    const qty = Math.min(parseInt(rawQty, 10) || 1, available);
    setBuyBusy(listingId);
    setError("");
    setStatusMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/market/${encodeURIComponent(kingdom)}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, quantity: qty }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to buy");
      setStatusMsg(`Bought ${j.quantity.toLocaleString()} ${RESOURCE_LABELS[j.resource]} for ${j.totalGold.toLocaleString()} gold.`);
      loadBrowse();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBuyBusy(null);
    }
  }

  async function handleCancel(listingId: number) {
    setError("");
    setStatusMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/market/${encodeURIComponent(kingdom)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed to cancel");
      setStatusMsg("Listing cancelled. Unsold resources refunded.");
      loadHistory();
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  const TAB_BTN = (id: "browse" | "sell" | "history", label: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        ...BTN_STYLE,
        background: tab === id ? "rgba(216,176,117,.4)" : "rgba(216,176,117,.1)",
        borderColor: tab === id ? "rgba(216,176,117,.8)" : "rgba(216,176,117,.3)",
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );

  const TH: React.CSSProperties = {
    padding: "8px 10px",
    textAlign: "left",
    color: ACCENT,
    fontWeight: 700,
    fontSize: 13,
    borderBottom: "1px solid rgba(216,176,117,.2)",
    whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: 13,
    borderBottom: "1px solid rgba(255,255,255,.05)",
    color: TEXT_MAIN,
    verticalAlign: "middle",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ ...CARD }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Marketplace</div>
        <div style={{ color: TEXT_MUTED, fontSize: 13, marginBottom: 12 }}>
          Trade resources with other kingdoms. A 5% tax applies to all sales.
          Listings expire after 7 days and unsold resources are refunded.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TAB_BTN("browse", "Browse Market")}
          {TAB_BTN("sell", "Create Listing")}
          {TAB_BTN("history", "My Listings & History")}
        </div>
      </div>

      {error ? <div style={{ ...CARD, color: "#ffb5a5", fontSize: 14 }}>{error}</div> : null}
      {statusMsg ? <div style={{ ...CARD, color: "#a8e6a3", fontSize: 14 }}>{statusMsg}</div> : null}

      {tab === "browse" && (
        <div style={{ ...CARD }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: TEXT_MUTED, fontSize: 13 }}>Filter:</span>
            {["all", "food", "wood", "stone", "horses"].map((r) => (
              <button
                key={r}
                onClick={() => setFilterResource(r)}
                style={{
                  ...BTN_STYLE,
                  fontSize: 12,
                  padding: "6px 10px",
                  background: filterResource === r ? "rgba(216,176,117,.4)" : "rgba(216,176,117,.1)",
                }}
              >
                {r === "all" ? "All" : `${RESOURCE_ICONS[r]} ${RESOURCE_LABELS[r]}`}
              </button>
            ))}
            <button onClick={loadBrowse} style={{ ...BTN_STYLE, fontSize: 12, padding: "6px 10px", marginLeft: "auto" }}>
              Refresh
            </button>
          </div>
          {loading ? (
            <div style={{ color: TEXT_MUTED, fontSize: 14 }}>Loading listings...</div>
          ) : listings.length === 0 ? (
            <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No active listings{filterResource !== "all" ? ` for ${RESOURCE_LABELS[filterResource]}` : ""}.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Resource</th>
                    <th style={TH}>Seller</th>
                    <th style={{ ...TH, textAlign: "right" }}>Available</th>
                    <th style={{ ...TH, textAlign: "right" }}>Price / Unit</th>
                    <th style={{ ...TH, textAlign: "right" }}>Buy Qty</th>
                    <th style={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => {
                    const available = Number(l.quantity_remaining);
                    const isOwnListing = String(l.seller_kingdom_name).toLowerCase() === kingdom.toLowerCase();
                    return (
                      <tr key={l.id} style={{ opacity: isOwnListing ? 0.5 : 1 }}>
                        <td style={TD}>{RESOURCE_ICONS[l.resource]} {RESOURCE_LABELS[l.resource]}</td>
                        <td style={TD}>{l.seller_kingdom_name}</td>
                        <td style={{ ...TD, textAlign: "right" }}>{available.toLocaleString()}</td>
                        <td style={{ ...TD, textAlign: "right", color: ACCENT }}>{Number(l.price_per_unit).toLocaleString()} gold</td>
                        <td style={{ ...TD, textAlign: "right" }}>
                          <input
                            type="number"
                            min={1}
                            max={available}
                            value={buyQtyMap[l.id] ?? String(available)}
                            onChange={(e) => setBuyQtyMap((m) => ({ ...m, [l.id]: e.target.value }))}
                            style={{ ...INPUT_STYLE, width: 90, padding: "4px 8px", fontSize: 13 }}
                            disabled={isOwnListing}
                          />
                        </td>
                        <td style={TD}>
                          <button
                            onClick={() => handleBuy(l.id, Number(l.price_per_unit), available)}
                            disabled={isOwnListing || buyBusy === l.id}
                            style={{
                              ...BTN_STYLE,
                              fontSize: 12,
                              padding: "6px 12px",
                              opacity: isOwnListing ? 0.4 : 1,
                            }}
                          >
                            {buyBusy === l.id ? "Buying..." : isOwnListing ? "Yours" : "Buy"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "sell" && (
        <div style={{ ...CARD, maxWidth: 480 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 16 }}>Create a Sell Listing</div>
          <div style={{ color: TEXT_MUTED, fontSize: 13, marginBottom: 12 }}>
            Resources are deducted immediately. You receive 95% of the sale price after the 5% market tax.
          </div>
          <form onSubmit={handleSell} style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: 13, color: TEXT_MUTED }}>
              Resource
              <select
                value={sellResource}
                onChange={(e) => setSellResource(e.target.value)}
                style={{ ...INPUT_STYLE, display: "block", width: "100%", marginTop: 4 }}
              >
                {["food", "wood", "stone", "horses"].map((r) => (
                  <option key={r} value={r}>{RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13, color: TEXT_MUTED }}>
              Quantity (min 100, max 1,000,000)
              <input
                type="number"
                min={100}
                max={1_000_000}
                value={sellQty}
                onChange={(e) => setSellQty(e.target.value)}
                placeholder="e.g. 10000"
                style={{ ...INPUT_STYLE, display: "block", width: "100%", marginTop: 4, boxSizing: "border-box" }}
              />
            </label>
            <label style={{ fontSize: 13, color: TEXT_MUTED }}>
              Price per unit (gold)
              <input
                type="number"
                min={1}
                max={100_000}
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="e.g. 5"
                style={{ ...INPUT_STYLE, display: "block", width: "100%", marginTop: 4, boxSizing: "border-box" }}
              />
            </label>
            {sellQty && sellPrice && (
              <div style={{ fontSize: 13, color: TEXT_MUTED, background: "rgba(216,176,117,.08)", borderRadius: 6, padding: "8px 10px" }}>
                Total listing value: <span style={{ color: ACCENT, fontWeight: 700 }}>{(parseInt(sellQty || "0") * parseInt(sellPrice || "0")).toLocaleString()} gold</span>
                {" "}→ You receive: <span style={{ color: "#a8e6a3", fontWeight: 700 }}>{Math.floor(parseInt(sellQty || "0") * parseInt(sellPrice || "0") * 0.95).toLocaleString()} gold</span> (after 5% tax)
              </div>
            )}
            <button type="submit" style={BTN_STYLE} disabled={sellBusy}>
              {sellBusy ? "Listing..." : "Post Listing"}
            </button>
          </form>
        </div>
      )}

      {tab === "history" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ ...CARD }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 16 }}>My Active Listings</div>
            {loading ? (
              <div style={{ color: TEXT_MUTED, fontSize: 14 }}>Loading...</div>
            ) : myListings.filter((l) => l.status === "active").length === 0 ? (
              <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No active listings.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH}>Resource</th>
                      <th style={{ ...TH, textAlign: "right" }}>Listed</th>
                      <th style={{ ...TH, textAlign: "right" }}>Remaining</th>
                      <th style={{ ...TH, textAlign: "right" }}>Price / Unit</th>
                      <th style={TH}>Expires</th>
                      <th style={TH}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {myListings.filter((l) => l.status === "active").map((l) => (
                      <tr key={l.id}>
                        <td style={TD}>{RESOURCE_ICONS[l.resource]} {RESOURCE_LABELS[l.resource]}</td>
                        <td style={{ ...TD, textAlign: "right" }}>{Number(l.quantity).toLocaleString()}</td>
                        <td style={{ ...TD, textAlign: "right" }}>{Number(l.quantity_remaining).toLocaleString()}</td>
                        <td style={{ ...TD, textAlign: "right", color: ACCENT }}>{Number(l.price_per_unit).toLocaleString()} gold</td>
                        <td style={{ ...TD, fontSize: 12, color: TEXT_MUTED }}>{new Date(l.expires_at).toLocaleDateString()}</td>
                        <td style={TD}>
                          <button
                            onClick={() => handleCancel(l.id)}
                            style={{ ...BTN_STYLE, fontSize: 12, padding: "5px 10px", background: "rgba(180,60,60,.25)", borderColor: "rgba(220,80,80,.4)" }}
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ ...CARD }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 16 }}>Trade History</div>
            {loading ? (
              <div style={{ color: TEXT_MUTED, fontSize: 14 }}>Loading...</div>
            ) : trades.length === 0 ? (
              <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No trade history yet.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH}>Type</th>
                      <th style={TH}>Resource</th>
                      <th style={{ ...TH, textAlign: "right" }}>Qty</th>
                      <th style={{ ...TH, textAlign: "right" }}>Price/Unit</th>
                      <th style={{ ...TH, textAlign: "right" }}>Gold</th>
                      <th style={TH}>Counterpart</th>
                      <th style={TH}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => {
                      const isBuy = t.trade_side === "buy";
                      return (
                        <tr key={t.id}>
                          <td style={{ ...TD, color: isBuy ? "#a8e6a3" : ACCENT, fontWeight: 700, fontSize: 12 }}>
                            {isBuy ? "BUY" : "SELL"}
                          </td>
                          <td style={TD}>{RESOURCE_ICONS[t.resource]} {RESOURCE_LABELS[t.resource]}</td>
                          <td style={{ ...TD, textAlign: "right" }}>{Number(t.quantity).toLocaleString()}</td>
                          <td style={{ ...TD, textAlign: "right" }}>{Number(t.price_per_unit).toLocaleString()}</td>
                          <td style={{ ...TD, textAlign: "right", color: isBuy ? "#ffb5a5" : "#a8e6a3" }}>
                            {isBuy ? `-${Number(t.total_gold).toLocaleString()}` : `+${Number(t.seller_receives).toLocaleString()}`}
                          </td>
                          <td style={{ ...TD, fontSize: 12 }}>{isBuy ? t.seller_kingdom_name : t.buyer_kingdom_name}</td>
                          <td style={{ ...TD, fontSize: 12, color: TEXT_MUTED }}>{new Date(t.traded_at).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Panel ──────────────────────────────────────────────────────────────

function AdminView() {
  const auth = (() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthState) : null;
    } catch { return null; }
  })();
  const token = auth?.token || "";

  type StatsData = { totalUsers: number; totalKingdoms: number; activeSessions: number; bannedUsers: number };
  type KingdomRow = { id: number; name: string; land: number; gold: number; user_id: string; username: string; email: string; is_admin: boolean; is_banned: boolean; banned_reason: string | null };
  type UserRow = { id: string; username: string; email: string; email_verified: boolean; is_admin: boolean; is_banned: boolean; banned_reason: string | null; created_at: string; kingdom_name: string | null };

  const [tab, setTab] = useState<"overview" | "kingdoms" | "users">("overview");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [kingdoms, setKingdoms] = useState<KingdomRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [kingdomTotal, setKingdomTotal] = useState(0);
  const [userTotal, setUserTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const api = async (path: string, method = "GET", body?: object) => {
    const r = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.json();
  };

  const loadStats = async () => {
    const j = await api("/api/admin/stats");
    if (j.ok) setStats(j.stats);
  };

  const loadKingdoms = async (s = search) => {
    setLoading(true);
    const j = await api(`/api/admin/kingdoms?limit=50&search=${encodeURIComponent(s)}`);
    if (j.ok) { setKingdoms(j.kingdoms); setKingdomTotal(j.total); }
    setLoading(false);
  };

  const loadUsers = async (s = search) => {
    setLoading(true);
    const j = await api(`/api/admin/users?limit=50&search=${encodeURIComponent(s)}`);
    if (j.ok) { setUsers(j.users); setUserTotal(j.total); }
    setLoading(false);
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSearch("");
    if (tab === "kingdoms") loadKingdoms("");
    else if (tab === "users") loadUsers("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const doSearch = () => {
    if (tab === "kingdoms") loadKingdoms(search);
    else loadUsers(search);
  };

  const banUser = async (userId: string, reason: string) => {
    const j = await api("/api/admin/ban", "POST", { userId, reason });
    setMsg(j.ok ? "User banned." : j.error);
    if (tab === "kingdoms") loadKingdoms(search);
    else loadUsers(search);
    loadStats();
  };

  const unbanUser = async (userId: string) => {
    const j = await api("/api/admin/unban", "POST", { userId });
    setMsg(j.ok ? "User unbanned." : j.error);
    if (tab === "kingdoms") loadKingdoms(search);
    else loadUsers(search);
    loadStats();
  };

  const setAdminUser = async (userId: string, grant: boolean) => {
    const j = await api("/api/admin/set-admin", "POST", { userId, grant });
    setMsg(j.ok ? (grant ? "Admin granted." : "Admin revoked.") : j.error);
    if (tab === "users") loadUsers(search);
  };

  const TAB_BTN = (id: typeof tab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      style={{ ...BTN_STYLE, background: tab === id ? "rgba(216,176,117,.45)" : "rgba(8,8,10,.62)", fontSize: 14 }}
    >
      {label}
    </button>
  );

  const TH: React.CSSProperties = { padding: "8px 10px", textAlign: "left", color: ACCENT, fontSize: 13, borderBottom: "1px solid rgba(216,176,117,.25)", whiteSpace: "nowrap" };
  const TD: React.CSSProperties = { padding: "7px 10px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,.06)" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ ...CARD }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Admin Panel</div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {TAB_BTN("overview", "Overview")}
          {TAB_BTN("kingdoms", "Kingdoms")}
          {TAB_BTN("users", "Users")}
        </div>

        {/* Message bar */}
        {msg && (
          <div style={{ padding: "8px 12px", marginBottom: 12, borderRadius: 6, background: "rgba(216,176,117,.18)", border: "1px solid rgba(216,176,117,.4)", fontSize: 14 }}>
            {msg}{" "}
            <button onClick={() => setMsg("")} style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>
        )}

        {/* Overview tab */}
        {tab === "overview" && (
          <div>
            <button onClick={loadStats} style={{ ...BTN_STYLE, fontSize: 13, marginBottom: 14 }}>Refresh</button>
            {stats ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
                {([
                  ["Total Users", stats.totalUsers],
                  ["Total Kingdoms", stats.totalKingdoms],
                  ["Active Sessions", stats.activeSessions],
                  ["Banned Users", stats.bannedUsers],
                ] as [string, number][]).map(([label, val]) => (
                  <div key={label} style={{ ...CARD, textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: ACCENT }}>{val.toLocaleString()}</div>
                    <div style={{ fontSize: 13, color: TEXT_MUTED }}>{label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: TEXT_MUTED }}>Loading stats…</div>
            )}
          </div>
        )}

        {/* Kingdoms tab */}
        {tab === "kingdoms" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder="Search kingdom or player…"
                style={{ ...INPUT_STYLE, flex: 1 }}
              />
              <button onClick={doSearch} style={{ ...BTN_STYLE, fontSize: 13 }}>Search</button>
            </div>
            <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>Showing {kingdoms.length} of {kingdomTotal}</div>
            {loading ? (
              <div style={{ color: TEXT_MUTED }}>Loading…</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Kingdom", "Player", "Land", "Gold", "Status", "Actions"].map((h) => (
                        <th key={h} style={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kingdoms.map((k) => (
                      <tr key={k.id}>
                        <td style={TD}>{k.name}</td>
                        <td style={{ ...TD, color: k.is_admin ? ACCENT : TEXT_MAIN }}>{k.username}{k.is_admin ? " ★" : ""}</td>
                        <td style={TD}>{Number(k.land).toLocaleString()}</td>
                        <td style={TD}>{Number(k.gold).toLocaleString()}</td>
                        <td style={{ ...TD, color: k.is_banned ? "#ff7f7f" : "#a8e6a3" }}>
                          {k.is_banned ? `Banned${k.banned_reason ? ": " + k.banned_reason : ""}` : "Active"}
                        </td>
                        <td style={TD}>
                          <div style={{ display: "flex", gap: 6 }}>
                            {k.is_banned ? (
                              <button onClick={() => unbanUser(k.user_id)} style={{ ...BTN_STYLE, fontSize: 12, padding: "4px 8px", color: "#a8e6a3" }}>Unban</button>
                            ) : (
                              <button
                                onClick={() => {
                                  const reason = window.prompt(`Ban reason for ${k.username}?`) ?? "";
                                  if (reason !== null) banUser(k.user_id, reason);
                                }}
                                style={{ ...BTN_STYLE, fontSize: 12, padding: "4px 8px", color: "#ff7f7f" }}
                              >Ban</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Users tab */}
        {tab === "users" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder="Search username or email…"
                style={{ ...INPUT_STYLE, flex: 1 }}
              />
              <button onClick={doSearch} style={{ ...BTN_STYLE, fontSize: 13 }}>Search</button>
            </div>
            <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>Showing {users.length} of {userTotal}</div>
            {loading ? (
              <div style={{ color: TEXT_MUTED }}>Loading…</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Username", "Email", "Kingdom", "Verified", "Admin", "Status", "Actions"].map((h) => (
                        <th key={h} style={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td style={{ ...TD, color: u.is_admin ? ACCENT : TEXT_MAIN }}>{u.username}{u.is_admin ? " ★" : ""}</td>
                        <td style={{ ...TD, fontSize: 12, color: TEXT_MUTED }}>{u.email}</td>
                        <td style={TD}>{u.kingdom_name || "—"}</td>
                        <td style={{ ...TD, color: u.email_verified ? "#a8e6a3" : "#ffb5a5" }}>{u.email_verified ? "Yes" : "No"}</td>
                        <td style={{ ...TD, color: u.is_admin ? ACCENT : TEXT_MUTED }}>{u.is_admin ? "Yes" : "No"}</td>
                        <td style={{ ...TD, color: u.is_banned ? "#ff7f7f" : "#a8e6a3" }}>
                          {u.is_banned ? `Banned${u.banned_reason ? ": " + u.banned_reason : ""}` : "Active"}
                        </td>
                        <td style={TD}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {u.is_banned ? (
                              <button onClick={() => unbanUser(u.id)} style={{ ...BTN_STYLE, fontSize: 12, padding: "4px 8px", color: "#a8e6a3" }}>Unban</button>
                            ) : (
                              <button
                                onClick={() => {
                                  const reason = window.prompt(`Ban reason for ${u.username}?`) ?? "";
                                  if (reason !== null) banUser(u.id, reason);
                                }}
                                style={{ ...BTN_STYLE, fontSize: 12, padding: "4px 8px", color: "#ff7f7f" }}
                              >Ban</button>
                            )}
                            {!u.is_admin ? (
                              <button onClick={() => setAdminUser(u.id, true)} style={{ ...BTN_STYLE, fontSize: 12, padding: "4px 8px", color: ACCENT }}>Grant Admin</button>
                            ) : (
                              <button onClick={() => setAdminUser(u.id, false)} style={{ ...BTN_STYLE, fontSize: 12, padding: "4px 8px" }}>Revoke Admin</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rankings View ────────────────────────────────────────────────────────────

function RankingsView() {
  const [tab, setTab] = useState<"kingdoms" | "alliances">("kingdoms");
  const [kingdoms, setKingdoms] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const PAGE_SIZE = 20;

  const myKingdom = localStorage.getItem(KINGDOM_STORAGE_KEY) || "";

  async function load(pg = page, q = search) {
    setLoading(true);
    setError("");
    try {
      const offset = pg * PAGE_SIZE;
      const url = `${API_BASE}/api/rankings/kingdoms?limit=${PAGE_SIZE}&offset=${offset}${q ? `&search=${encodeURIComponent(q)}` : ""}`;
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setKingdoms(j.kingdoms || []);
      setTotal(Number(j.total || 0));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "kingdoms") void load(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  // Auto-refresh every 30s so rankings update after ticks without manual reload
  useEffect(() => {
    const t = setInterval(() => {
      if (tab === "kingdoms") void load(page, search);
    }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, search]);

  function doSearch() {
    setSearch(searchInput);
    setPage(0);
    void load(0, searchInput);
  }

  const TH: React.CSSProperties = { padding: "8px 10px", textAlign: "left", color: ACCENT, fontSize: 13, borderBottom: "1px solid rgba(216,176,117,.25)", whiteSpace: "nowrap" };
  const TD: React.CSSProperties = { padding: "7px 10px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,.06)" };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, color: "#fff7ec", marginBottom: 12 }}>Rankings</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["kingdoms", "alliances"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...BTN_STYLE, background: tab === t ? "rgba(216,176,117,.45)" : "rgba(8,8,10,.62)", fontSize: 14, padding: "8px 16px", textTransform: "capitalize" }}>
              {t}
            </button>
          ))}
        </div>

        {tab === "alliances" ? (
          <div style={{ color: TEXT_MUTED, padding: 20, textAlign: "center", fontSize: 18 }}>Coming Soon</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder="Search kingdoms..."
                style={{ ...INPUT_STYLE, flex: 1, fontSize: 14 }}
              />
              <button onClick={doSearch} style={{ ...BTN_STYLE, fontSize: 13 }}>Search</button>
            </div>

            {error ? <div style={{ color: "#ffae9a", marginBottom: 8 }}>{error}</div> : null}
            {loading ? <div style={{ color: TEXT_MUTED }}>Loading...</div> : null}

            <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()} kingdoms
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Rank</th>
                    <th style={TH}>Kingdom</th>
                    <th style={{ ...TH, textAlign: "right" }}>Networth</th>
                    <th style={{ ...TH, textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {kingdoms.map((k: any, i: number) => {
                    const rank = page * PAGE_SIZE + i + 1;
                    const tag = String(k.alliance_tag || "").trim();
                    const displayName = tag ? `[${tag}] ${k.name}` : k.name;
                    const isMe = k.name === myKingdom;
                    return (
                      <tr key={k.id} style={{ background: isMe ? "rgba(216,176,117,.08)" : "transparent" }}>
                        <td style={{ ...TD, color: rank === 1 ? "#ffd700" : rank === 2 ? "#c0c0c0" : rank === 3 ? "#cd7f32" : TEXT_MAIN, fontWeight: rank <= 3 ? 700 : 400 }}>{rank}</td>
                        <td style={{ ...TD, fontWeight: isMe ? 700 : 400, color: isMe ? ACCENT : TEXT_MAIN }}>{displayName}</td>
                        <td style={{ ...TD, textAlign: "right" }}>{Number(k.networth || 0).toLocaleString()}</td>
                        <td style={{ ...TD, textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                            <button title="Spy" style={{ ...BTN_STYLE, padding: "3px 8px", fontSize: 13 }}>Spy</button>
                            <button title="Attack" style={{ ...BTN_STYLE, padding: "3px 8px", fontSize: 13 }}>Attack</button>
                            <button title="Pigeon" style={{ ...BTN_STYLE, padding: "3px 8px", fontSize: 13 }}>Pigeon</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, justifyContent: "flex-end" }}>
              <button disabled={page === 0} onClick={() => setPage(page - 1)} style={{ ...BTN_STYLE, padding: "6px 14px", fontSize: 13 }}>Prev</button>
              <span style={{ fontSize: 13, color: TEXT_MUTED }}>Page {page + 1}</span>
              <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)} style={{ ...BTN_STYLE, padding: "6px 14px", fontSize: 13 }}>Next</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Pigeons View ──────────────────────────────────────────────────────────────

function PigeonsView() {
  const kingdom = localStorage.getItem(KINGDOM_STORAGE_KEY) || "";
  const [tab, setTab] = useState<"inbox" | "outbox">("inbox");
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [toKingdom, setToKingdom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  async function load() {
    if (!kingdom) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/pigeons/${encodeURIComponent(kingdom)}?limit=100`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setMessages(j.items || []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function markRead(id: number) {
    try {
      await fetch(`${API_BASE}/api/pigeons/${encodeURIComponent(kingdom)}/${id}/read`, { method: "POST" });
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, read_at: new Date().toISOString() } : m));
    } catch {}
  }

  async function handleExpand(msg: any) {
    if (expandedId === msg.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(msg.id);
    if (!msg.read_at) await markRead(msg.id);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!toKingdom.trim() || !subject.trim() || !body.trim()) return;
    setSendBusy(true);
    setStatusMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/pigeons/${encodeURIComponent(kingdom)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toKingdom: toKingdom.trim(), subject: subject.trim(), body: body.trim() }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setStatusMsg("Message sent.");
      setToKingdom(""); setSubject(""); setBody("");
      setComposing(false);
      await load();
    } catch (e: any) {
      setStatusMsg(`Send failed: ${String(e?.message || e)}`);
    } finally {
      setSendBusy(false);
    }
  }

  const inbox = messages.filter((m: any) => !String(m.subject || "").startsWith("Sent:"));
  const outbox = messages.filter((m: any) => String(m.subject || "").startsWith("Sent:"));
  const displayed = tab === "inbox" ? inbox : outbox;
  const unreadCount = inbox.filter((m: any) => !m.read_at).length;

  function fmtDate(s: string) {
    if (!s) return "";
    try { return new Date(s).toLocaleString(); } catch { return s; }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, color: "#fff7ec" }}>Pigeons</div>
          <button onClick={() => setComposing(!composing)} style={{ ...BTN_STYLE, fontSize: 13, padding: "8px 16px" }}>
            {composing ? "Cancel" : "+ Compose"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setTab("inbox")} style={{ ...BTN_STYLE, background: tab === "inbox" ? "rgba(216,176,117,.45)" : "rgba(8,8,10,.62)", fontSize: 14, padding: "8px 16px" }}>
            Inbox {unreadCount > 0 ? <span style={{ marginLeft: 6, background: "#c8b8f8", color: "#1a1a2e", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 800 }}>{unreadCount}</span> : null}
          </button>
          <button onClick={() => setTab("outbox")} style={{ ...BTN_STYLE, background: tab === "outbox" ? "rgba(216,176,117,.45)" : "rgba(8,8,10,.62)", fontSize: 14, padding: "8px 16px" }}>
            Outbox
          </button>
        </div>

        {composing ? (
          <form onSubmit={sendMessage} style={{ ...CARD, display: "grid", gap: 10, marginBottom: 16, background: "rgba(0,0,0,.3)" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Send Pigeon</div>
            <input value={toKingdom} onChange={(e) => setToKingdom(e.target.value)} placeholder="To Kingdom" style={INPUT_STYLE} required />
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={INPUT_STYLE} required />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body..." style={{ ...INPUT_STYLE, minHeight: 100, resize: "vertical" }} required />
            {statusMsg ? <div style={{ color: "#c8e7b1", fontSize: 13 }}>{statusMsg}</div> : null}
            <button type="submit" disabled={sendBusy} style={{ ...BTN_STYLE, width: "fit-content" }}>{sendBusy ? "Sending..." : "Send"}</button>
          </form>
        ) : null}

        {statusMsg && !composing ? <div style={{ color: "#c8e7b1", fontSize: 14, marginBottom: 8 }}>{statusMsg}</div> : null}
        {error ? <div style={{ color: "#ffae9a", marginBottom: 8 }}>{error}</div> : null}
        {loading ? <div style={{ color: TEXT_MUTED }}>Loading...</div> : null}

        {displayed.length === 0 && !loading ? (
          <div style={{ color: TEXT_MUTED, padding: 12 }}>No messages in {tab}.</div>
        ) : null}

        <div style={{ display: "grid", gap: 4 }}>
          {displayed.map((msg: any) => {
            const isUnread = !msg.read_at;
            const isExpanded = expandedId === msg.id;
            return (
              <div key={msg.id} style={{ border: "1px solid rgba(216,176,117,.2)", borderRadius: 8, overflow: "hidden" }}>
                <div
                  onClick={() => void handleExpand(msg)}
                  style={{ display: "flex", gap: 12, padding: "10px 12px", cursor: "pointer", background: isExpanded ? "rgba(216,176,117,.12)" : "rgba(0,0,0,.2)", alignItems: "center" }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: isUnread ? "#c8b8f8" : "transparent", flexShrink: 0, marginTop: 1 }} />
                  <span style={{ flex: 1, fontWeight: isUnread ? 700 : 400, color: isUnread ? TEXT_MAIN : TEXT_MUTED, fontSize: 14 }}>{String(msg.subject || "(no subject)")}</span>
                  <span style={{ fontSize: 12, color: TEXT_MUTED, flexShrink: 0 }}>{String(msg.from_kingdom || msg.sender || "System")}</span>
                  <span style={{ fontSize: 12, color: TEXT_MUTED, flexShrink: 0 }}>{fmtDate(String(msg.created_at || msg.sent_at || ""))}</span>
                </div>
                {isExpanded ? (
                  <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(216,176,117,.15)", background: "rgba(0,0,0,.35)", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", color: TEXT_MUTED }}>
                    {String(msg.body || msg.message || "(empty)")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Guildhall View ────────────────────────────────────────────────────────────

function GuildhallView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "");
  const [data, setData] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [trainOpen, setTrainOpen] = useState(false);
  const [spyOpen, setSpyOpen] = useState(false);
  const [trainAmt, setTrainAmt] = useState(1);
  const [defenderKingdom, setDefenderKingdom] = useState("");
  const [spiesToSend, setSpiesToSend] = useState(1);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!kingdom.trim()) return;
    setLoading(true);
    setError("");
    try {
      const [wRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/api/war-room/${encodeURIComponent(kingdom)}`),
        fetch(`${API_BASE}/api/war-room/reports/${encodeURIComponent(kingdom)}?limit=12`),
      ]);
      const wJson = await wRes.json();
      const rJson = await rRes.json();
      if (!wRes.ok || !wJson?.ok) throw new Error(wJson?.error || `HTTP ${wRes.status}`);
      setData(wJson);
      if (rRes.ok && rJson?.ok) setReports(Array.isArray(rJson.items) ? rJson.items : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const spiesTroop = (data?.troops || []).find((t: any) => String(t.troopCode || t.troop_code || t.code) === "spies");
  const trainQueue = (data?.training || []).filter((q: any) => String(q.troop_code) === "spies" && String(q.status) === "queued");
  const rankNum = Number(data?.kingdom?.rank || 0);
  const populationHome = Number(data?.kingdom?.populationHome || 0);

  async function trainSpies(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ troopCode: "spies", quantity: trainAmt }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Training ${trainAmt} spies queued.`);
      await load();
    } catch (e: any) {
      setActionMsg(`Training failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendSpies(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setActionMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}/spy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defenderKingdom, spiesToSend }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setActionMsg(`Spy mission launched against ${defenderKingdom}.`);
      await load();
    } catch (e: any) {
      setActionMsg(`Spy failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  const TH: React.CSSProperties = { padding: "6px 10px", textAlign: "left", color: ACCENT, fontSize: 12, borderBottom: "1px solid rgba(216,176,117,.2)" };
  const TD: React.CSSProperties = { padding: "6px 10px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,.05)" };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, color: "#fff7ec" }}>
            Guildhall — {String(data?.kingdom?.allianceTag ? `[${data.kingdom.allianceTag}] ` : "")}{kingdom || "..."}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 14 }} placeholder="Kingdom name" />
            <button onClick={() => void load()} style={{ ...BTN_STYLE, fontSize: 13 }}>Load</button>
          </div>
        </div>
        {loading ? <div style={{ marginTop: 8, color: TEXT_MUTED }}>Loading...</div> : null}
        {error ? <div style={{ marginTop: 8, color: "#ffae9a" }}>{error}</div> : null}
        {actionMsg ? <div style={{ marginTop: 8, color: "#c8e7b1", fontSize: 14 }}>{actionMsg}</div> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Left panel */}
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div style={CARD}>
            <div style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 6 }}>Rank: <span style={{ color: TEXT_MAIN, fontWeight: 600 }}>#{rankNum || "N/A"}</span></div>
            <div style={{ fontSize: 14, color: TEXT_MUTED }}>Population at Home: <span style={{ color: TEXT_MAIN, fontWeight: 600 }}>{populationHome.toLocaleString()}</span></div>
            <div style={{ marginTop: 12, fontWeight: 700, marginBottom: 6, fontSize: 15 }}>Spies</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Home</th>
                  <th style={TH}>Training</th>
                  <th style={TH}>Away</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={TD}>{Number(spiesTroop?.home || 0).toLocaleString()}</td>
                  <td style={TD}>{Number(spiesTroop?.train || 0).toLocaleString()}</td>
                  <td style={TD}>{Number(spiesTroop?.away || 0).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            {trainQueue.length > 0 ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Training...</div>
                {trainQueue.map((q: any) => (
                  <div key={q.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span>{Number(q.quantity || 0).toLocaleString()} spies</span>
                    <QueueCountdown completesAt={q.completes_at} onComplete={() => void load()} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <div style={CARD}>
            <button onClick={() => setTrainOpen(!trainOpen)} style={{ ...BTN_STYLE, width: "100%", textAlign: "left", marginBottom: trainOpen ? 12 : 0, fontSize: 14 }}>
              {trainOpen ? "▼" : "▶"} + TRAIN SPIES
            </button>
            {trainOpen ? (
              <form onSubmit={trainSpies} style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 13, color: TEXT_MUTED }}>Train spies at your guildhall.</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 14, color: TEXT_MUTED }}>Amount:</span>
                  <input type="number" min={1} value={trainAmt} onChange={(e) => setTrainAmt(Math.max(1, Number(e.target.value)))} style={{ ...INPUT_STYLE, width: 80, fontSize: 14 }} />
                </div>
                <button type="submit" disabled={busy} style={{ ...BTN_STYLE, width: "fit-content", fontSize: 13 }}>{busy ? "Training..." : "Train Now"}</button>
              </form>
            ) : null}
          </div>

          <div style={CARD}>
            <button onClick={() => setSpyOpen(!spyOpen)} style={{ ...BTN_STYLE, width: "100%", textAlign: "left", marginBottom: spyOpen ? 12 : 0, fontSize: 14 }}>
              {spyOpen ? "▼" : "▶"} + SPY ON KINGDOM
            </button>
            {spyOpen ? (
              <form onSubmit={sendSpies} style={{ display: "grid", gap: 8 }}>
                <input value={defenderKingdom} onChange={(e) => setDefenderKingdom(e.target.value)} placeholder="Target Kingdom" style={INPUT_STYLE} required />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 14, color: TEXT_MUTED }}>Spies to send:</span>
                  <input type="number" min={1} value={spiesToSend} onChange={(e) => setSpiesToSend(Math.max(1, Number(e.target.value)))} style={{ ...INPUT_STYLE, width: 80, fontSize: 14 }} />
                </div>
                <button type="submit" disabled={busy} style={{ ...BTN_STYLE, width: "fit-content", fontSize: 13 }}>{busy ? "Sending..." : "Send Spies"}</button>
              </form>
            ) : null}
          </div>

          {reports.length > 0 ? (
            <div style={CARD}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Recent Spy Reports</div>
              {reports.map((rep: any) => (
                <div key={rep.id} style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 6, background: "rgba(0,0,0,.25)", border: "1px solid rgba(216,176,117,.15)", fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: ACCENT }}>{String(rep.report_type || "Spy Report")}</div>
                  <div style={{ color: TEXT_MUTED, marginTop: 2 }}>vs {String(rep.defender_name || rep.target || "Unknown")} — {String(rep.outcome || rep.result || "")}</div>
                  <div style={{ fontSize: 12, color: TEXT_MUTED }}>{rep.created_at ? new Date(String(rep.created_at)).toLocaleString() : ""}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Embassy View ──────────────────────────────────────────────────────────────

function EmbassyView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!kingdom.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/war-room/${encodeURIComponent(kingdom)}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const diplomats = (data?.troops || []).find((t: any) => String(t.troop_code || t.code) === "diplomats");
  const incomingDiplomats = (data?.diplomats || []) as Array<any>;
  const rankNum = Number(data?.kingdom?.rank || 0);
  const allianceTag = String(data?.kingdom?.allianceTag || "").trim();

  const TH: React.CSSProperties = { padding: "6px 10px", textAlign: "left", color: ACCENT, fontSize: 12, borderBottom: "1px solid rgba(216,176,117,.2)" };
  const TD: React.CSSProperties = { padding: "6px 10px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,.05)" };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, color: "#fff7ec" }}>
            Embassy — {allianceTag ? `[${allianceTag}] ` : ""}{kingdom || "..."}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 14 }} placeholder="Kingdom name" />
            <button onClick={() => void load()} style={{ ...BTN_STYLE, fontSize: 13 }}>Load</button>
          </div>
        </div>
        {loading ? <div style={{ marginTop: 8, color: TEXT_MUTED }}>Loading...</div> : null}
        {error ? <div style={{ marginTop: 8, color: "#ffae9a" }}>{error}</div> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Left panel */}
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div style={CARD}>
            <div style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 6 }}>Rank: <span style={{ color: TEXT_MAIN, fontWeight: 600 }}>#{rankNum || "N/A"}</span></div>
            <div style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 12 }}>Religion: <span style={{ color: TEXT_MAIN, fontWeight: 600 }}>Nastfuru</span></div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Kingdom Diplomats</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Location</th>
                  <th style={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={TD}>Home</td>
                  <td style={TD}>{Number(diplomats?.home || 0).toLocaleString()} diplomats</td>
                </tr>
                <tr>
                  <td style={TD}>Training</td>
                  <td style={TD}>{Number(diplomats?.train || 0).toLocaleString()} diplomats</td>
                </tr>
                <tr>
                  <td style={TD}>Away (missions)</td>
                  <td style={TD}>{Number(diplomats?.away || 0).toLocaleString()} diplomats</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Foreign Diplomats</div>
            {incomingDiplomats.length === 0 ? (
              <div style={{ color: TEXT_MUTED, fontSize: 14 }}>No diplomats currently deployed to this kingdom.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Kingdom</th>
                    <th style={TH}>Status</th>
                    <th style={TH}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {incomingDiplomats.map((d: any, i: number) => (
                    <tr key={i}>
                      <td style={TD}>{String(d.from_kingdom || d.kingdom || "Unknown")}</td>
                      <td style={{ ...TD, color: d.status === "war" ? "#ff7f7f" : d.status === "peace" ? "#a8e6a3" : TEXT_MUTED }}>
                        {d.status === "war" ? "At War" : d.status === "peace" ? "At Peace" : "Neutral"}
                      </td>
                      <td style={TD}>{Number(d.count || d.quantity || 1).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Account View ──────────────────────────────────────────────────────────────

function AccountView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "");
  const [shieldData, setShieldData] = useState<any>(null);
  const [gemsData, setGemsData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [shieldBusy, setShieldBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  async function load() {
    if (!kingdom.trim()) return;
    setLoading(true);
    try {
      const [kRes] = await Promise.all([
        fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}`),
      ]);
      const kJson = await kRes.json();
      if (kRes.ok && kJson?.ok) {
        setShieldData(kJson?.shield || kJson?.kingdom?.shield || null);
        setGemsData({ blue_gems: kJson?.kingdom?.blue_gems, green_gems: kJson?.kingdom?.green_gems });
      }
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function activateShield() {
    setShieldBusy(true);
    setStatusMsg("");
    try {
      const r = await fetch(`${API_BASE}/api/kingdom/${encodeURIComponent(kingdom)}/shield/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setStatusMsg("Shield queued. It will activate in 24 hours.");
      await load();
    } catch (e: any) {
      setStatusMsg(`Shield failed: ${String(e?.message || e)}`);
    } finally {
      setShieldBusy(false);
    }
  }

  function logout() {
    if (!window.confirm("Log out of all web sessions?")) return;
    localStorage.removeItem("gg:auth");
    localStorage.removeItem("gg:kingdom");
    window.location.reload();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, color: "#fff7ec", marginBottom: 12 }}>Account</div>
        {loading ? <div style={{ color: TEXT_MUTED }}>Loading...</div> : null}
        {statusMsg ? <div style={{ color: "#c8e7b1", marginBottom: 8 }}>{statusMsg}</div> : null}
      </div>

      <div style={CARD}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Kingdom Shield</div>
        <div style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 12, lineHeight: 1.6 }}>
          A shield protects your kingdom from attacks. Activating a shield takes 24 hours to come into effect.
          While shielded, your kingdom cannot be attacked. Retaliation attacks are still allowed during cooldown.
          You can only have one shield active at a time.
        </div>
        <div style={{ marginBottom: 10, fontSize: 14 }}>
          Status:{" "}
          <span style={{ fontWeight: 600, color: shieldData?.status === "active" ? "#a8e6a3" : TEXT_MUTED }}>
            {shieldData?.status === "active" ? `Active (${formatDuration(Number(shieldData?.remainingSeconds || 0))} remaining)` :
             shieldData?.status === "pending" ? `Pending (${formatDuration(Number(shieldData?.remainingSeconds || 0))} until active)` :
             shieldData?.status === "cooldown" ? `Cooldown (${formatDuration(Number(shieldData?.remainingSeconds || 0))} remaining)` :
             "None"}
          </span>
        </div>
        <button
          style={{ ...BTN_STYLE, fontSize: 13 }}
          disabled={shieldBusy || (shieldData && String(shieldData.status || "none") !== "none")}
          onClick={() => void activateShield()}
        >
          {shieldBusy ? "..." : "Activate Shield"}
        </button>
      </div>

      <div style={CARD}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Gems</div>
        <div style={{ display: "flex", gap: 24, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 16 }}>Blue Gems: <span style={{ color: "#7eb8ff", fontWeight: 700 }}>{Number(gemsData?.blue_gems || 0).toLocaleString()}</span></div>
          <div style={{ fontSize: 16 }}>Green Gems: <span style={{ color: "#7fdb8a", fontWeight: 700 }}>{Number(gemsData?.green_gems || 0).toLocaleString()}</span></div>
        </div>
        <div style={{ fontSize: 14, color: TEXT_MUTED, lineHeight: 1.6 }}>
          Blue Gems are the premium currency of Crownforge. They can be earned through gameplay milestones,
          special events, and purchases. Use them to unlock premium features and bonuses.
          Green Gems are earned through alliance contributions and special missions.
        </div>
      </div>

      <div style={CARD}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Referrals</div>
        <div style={{ fontSize: 14, color: TEXT_MUTED, lineHeight: 1.6 }}>
          Share Crownforge with friends to earn bonus gems. When a friend registers using your referral link
          and reaches a certain milestone, you will both receive blue gem rewards.
          <br /><br />
          Referral system coming soon.
        </div>
      </div>

      <div style={CARD}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, marginBottom: 10, color: "#ffab9c" }}>Logout</div>
        <div style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 12 }}>
          This will clear all stored login credentials from this browser and log you out.
        </div>
        <button onClick={logout} style={{ ...BTN_STYLE, background: "rgba(180,60,60,.5)", border: "1px solid rgba(255,100,100,.4)", fontSize: 13 }}>
          Logout All Web Access
        </button>
      </div>
    </div>
  );
}

// ── How To Play View ──────────────────────────────────────────────────────────

function HowToPlayView() {
  const [openSection, setOpenSection] = useState<string | null>("introduction");

  const sections = [
    {
      id: "introduction",
      title: "Introduction",
      content: (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: TEXT_MUTED }}>
          <p>Welcome to Crownforge, a medieval kingdom strategy game. Build and grow your kingdom, train armies,
          forge alliances, and conquer your rivals. The game runs in real time — resources are generated and
          queues advance on each tick (every 5 minutes).</p>
          <p style={{ marginTop: 8 }}>Your goal is to increase your kingdom's Networth, which is calculated from
          all your assets: land, resources, troops, and buildings.</p>
        </div>
      ),
    },
    {
      id: "networth",
      title: "Networth",
      content: (
        <div>
          <p style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 10 }}>Your networth is the sum of all your assets multiplied by their respective values:</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 10px", textAlign: "left", color: ACCENT, borderBottom: "1px solid rgba(216,176,117,.25)" }}>Asset</th>
                <th style={{ padding: "6px 10px", textAlign: "right", color: ACCENT, borderBottom: "1px solid rgba(216,176,117,.25)" }}>Value per Unit</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Land", "0.04"],
                ["Food", "0.0001"],
                ["Gold", "0.0005"],
                ["Stone", "0.0002"],
                ["Wood", "0.0002"],
                ["Horses", "0.00025"],
              ].map(([asset, val]) => (
                <tr key={asset}>
                  <td style={{ padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>{asset}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: FONT_DISPLAY, color: ACCENT, borderBottom: "1px solid rgba(255,255,255,.06)" }}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: "early-game",
      title: "The Early Game",
      content: (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: TEXT_MUTED }}>
          <p><strong style={{ color: TEXT_MAIN }}>Exploring:</strong> Use the Explore action in the War Room to gain land. Land is the foundation of your economy — more land means more buildings and more resources.</p>
          <p style={{ marginTop: 8 }}><strong style={{ color: TEXT_MAIN }}>Food:</strong> Build Farms early and often. If your kingdom runs out of food, your population will decrease. Keep food production well above your population's consumption.</p>
          <p style={{ marginTop: 8 }}><strong style={{ color: TEXT_MAIN }}>Gold:</strong> Gold is used for everything — building, training, research. Build Markets and set a reasonable tax rate (20-30% is typical). Keep your population happy to maximize tax income.</p>
        </div>
      ),
    },
    {
      id: "buildings",
      title: "Buildings",
      content: (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: TEXT_MUTED }}>
          <p>Buildings are constructed from the Buildings tab. Each building has a level and provides different bonuses:</p>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            <li><strong style={{ color: TEXT_MAIN }}>Farms</strong> — Generate food (+120/hr each)</li>
            <li><strong style={{ color: TEXT_MAIN }}>Lumberyards</strong> — Generate wood (+80/hr each)</li>
            <li><strong style={{ color: TEXT_MAIN }}>Quarries</strong> — Generate stone (+80/hr each)</li>
            <li><strong style={{ color: TEXT_MAIN }}>Houses</strong> — Expand population capacity</li>
            <li><strong style={{ color: TEXT_MAIN }}>Barracks</strong> — Required to train infantry</li>
            <li><strong style={{ color: TEXT_MAIN }}>Castles</strong> — Defensive bonus + population cap</li>
            <li><strong style={{ color: TEXT_MAIN }}>Guildhalls</strong> — Required for spy operations</li>
            <li><strong style={{ color: TEXT_MAIN }}>Temples</strong> — Generate mana for prayers</li>
          </ul>
        </div>
      ),
    },
    {
      id: "troops",
      title: "Troops",
      content: (
        <div>
          <p style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 10 }}>Train troops from the Train Troops or War Room tab. Different troops serve different roles:</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 8px", textAlign: "left", color: ACCENT, borderBottom: "1px solid rgba(216,176,117,.25)" }}>Troop</th>
                <th style={{ padding: "6px 8px", textAlign: "left", color: ACCENT, borderBottom: "1px solid rgba(216,176,117,.25)" }}>Role</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(TROOP_META).map(([code, meta]) => (
                <tr key={code}>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid rgba(255,255,255,.06)", textTransform: "capitalize" }}>{code.replace(/_/g, " ")}</td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid rgba(255,255,255,.06)", color: TEXT_MUTED }}>{meta.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: "diplomacy",
      title: "Diplomacy & Alliances",
      content: (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: TEXT_MUTED }}>
          <p><strong style={{ color: TEXT_MAIN }}>Alliances:</strong> Join or create an alliance from the Alliance tab. Alliances provide mutual protection, shared resources, and coordinated attacks.</p>
          <p style={{ marginTop: 8 }}><strong style={{ color: TEXT_MAIN }}>Diplomacy:</strong> Use Diplomats (trained at Embassies) to send diplomatic missions to other kingdoms. Establish trade agreements, peace treaties, or declare war.</p>
          <p style={{ marginTop: 8 }}><strong style={{ color: TEXT_MAIN }}>Pigeons:</strong> Send messages to other kingdoms using the Pigeons tab. Coordinate with allies or negotiate with rivals.</p>
        </div>
      ),
    },
    {
      id: "research",
      title: "Research",
      content: (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: TEXT_MUTED }}>
          <p>Research technologies from the Research tab. Each technology has multiple levels and provides compounding percentage bonuses to your kingdom.</p>
          <p style={{ marginTop: 8 }}>Technologies are organized into categories: Economy, Military, Espionage, and more. Focus on technologies that support your playstyle.</p>
          <p style={{ marginTop: 8 }}>Some technologies have prerequisites — you must reach a certain level in one tech before unlocking another.</p>
        </div>
      ),
    },
    {
      id: "seasons",
      title: "Seasons",
      content: (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: TEXT_MUTED }}>
          <p>Crownforge has four seasons that rotate over time. Each season provides different bonuses and penalties to resource production, troop effectiveness, and more.</p>
          <p style={{ marginTop: 8 }}>Plan your economy and military actions around the current season for maximum efficiency.</p>
        </div>
      ),
    },
    {
      id: "settlements",
      title: "Settlements",
      content: (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: TEXT_MUTED }}>
          <p>As your kingdom grows, you can establish settlements — smaller colonies that provide additional resources and population.</p>
          <p style={{ marginTop: 8 }}>Settlements unlock at certain land milestones. Each settlement can be upgraded with buildings independently of your main kingdom.</p>
          <p style={{ marginTop: 8 }}>Keep your settlement wellbeing high to maximize their productivity.</p>
        </div>
      ),
    },
    {
      id: "gems",
      title: "Gems",
      content: (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: TEXT_MUTED }}>
          <p><strong style={{ color: "#7eb8ff" }}>Blue Gems</strong> are the premium currency. Earn them through achievements, special events, and purchases. Use them for premium bonuses.</p>
          <p style={{ marginTop: 8 }}><strong style={{ color: "#7fdb8a" }}>Green Gems</strong> are earned through gameplay — alliance contributions, daily bonuses, and completing missions.</p>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={CARD}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, color: "#fff7ec" }}>How To Play</div>
        <div style={{ color: TEXT_MUTED, marginTop: 4, fontSize: 14 }}>A guide to Crownforge — click a section to expand it.</div>
      </div>
      {sections.map((sec) => {
        const isOpen = openSection === sec.id;
        return (
          <div key={sec.id} style={CARD}>
            <button
              onClick={() => setOpenSection(isOpen ? null : sec.id)}
              style={{ background: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: isOpen ? ACCENT : TEXT_MAIN }}>{sec.title}</span>
              <span style={{ color: ACCENT, fontSize: 18 }}>{isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen ? <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(216,176,117,.2)" }}>{sec.content}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const [activeId, setActiveId] = useState("overview");
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 980 : false));
  const [auth, setAuth] = useState<AuthState | null>(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthState) : null;
    } catch {
      return null;
    }
  });

  const active = useMemo(() => NAV_ITEMS.find((x) => x.id === activeId) || NAV_ITEMS[0], [activeId]);
  const topNav = NAV_ITEMS.filter((x) => x.group === "top");
  const kingdomNav = NAV_ITEMS.filter((x) => x.group === "kingdom" && (x.id !== "admin" || auth?.user?.isAdmin));
  const headerQuickNav = [topNav[0], topNav[1], topNav[2], NAV_ITEMS.find((x) => x.id === "overview"), NAV_ITEMS.find((x) => x.id === "logout")].filter(Boolean) as NavItem[];

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 980);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id && NAV_ITEMS.some((x) => x.id === id)) setActiveId(id);
    };
    window.addEventListener("gg:navigate", handler);
    return () => window.removeEventListener("gg:navigate", handler);
  }, []);

  useEffect(() => {
    const token = auth?.token;
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || !j?.ok) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuth(null);
          return;
        }
        if (j?.kingdom?.name) localStorage.setItem(KINGDOM_STORAGE_KEY, String(j.kingdom.name));
      } catch {
        if (cancelled) return;
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setAuth(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth?.token]);

  if (!auth) {
    return <AuthGate onAuthenticated={(a) => setAuth(a)} />;
  }

  if (active.id === "logout") {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuth(null);
    setActiveId("overview");
    return null;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        color: TEXT_MAIN,
        background: `
          radial-gradient(1200px 700px at 85% 20%, rgba(92,76,58,0.45), rgba(23,23,25,0.92)),
          linear-gradient(180deg, #2b2b2f 0%, #1a1a1d 48%, #161515 100%)
        `,
        fontFamily: FONT_BODY,
      }}
    >
      <header style={{ borderBottom: "1px solid rgba(217,182,118,.22)", padding: isMobile ? "12px 14px" : "14px 26px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto", alignItems: "center", gap: 14, background: "rgba(24,24,27,0.85)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              border: "1px solid rgba(216,176,117,.5)",
              background: "linear-gradient(180deg, rgba(130,16,16,.75), rgba(80,12,12,.75))",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
              <path
                d="M7 45h50v8H7zM12 43l4-20 16 10 16-10 4 20z"
                fill="#f4d79e"
                stroke="#5f451f"
                strokeWidth="2"
              />
              <circle cx="16" cy="21" r="4" fill="#f4d79e" stroke="#5f451f" strokeWidth="2" />
              <circle cx="32" cy="13" r="4" fill="#f4d79e" stroke="#5f451f" strokeWidth="2" />
              <circle cx="48" cy="21" r="4" fill="#f4d79e" stroke="#5f451f" strokeWidth="2" />
            </svg>
          </div>
          <button onClick={() => setActiveId("overview")} style={{ fontSize: isMobile ? 28 : 34, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY, letterSpacing: 0.8, background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
            Crownforge
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#f7eee0", fontFamily: FONT_DISPLAY, fontSize: 16, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
          {headerQuickNav.map((item) => (
            <button
              key={`quick-${item.id}`}
              onClick={() => setActiveId(item.id)}
              style={{
                border: "1px solid rgba(216,176,117,.45)",
                borderRadius: 999,
                background: item.id === active.id ? "rgba(216,176,117,.26)" : "rgba(8,8,10,.45)",
                color: TEXT_MAIN,
                fontFamily: FONT_DISPLAY,
                fontSize: 15,
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "300px 1fr",
          gap: 16,
          padding: isMobile ? 10 : 16,
          background:
            "linear-gradient(180deg, rgba(36,29,24,0.35), rgba(24,22,23,0.75))",
        }}
      >
        <aside style={{ ...CARD, height: "fit-content", position: isMobile ? "relative" : "sticky", top: 16, background: "linear-gradient(180deg, rgba(29,29,33,0.86), rgba(19,19,22,0.88))" }}>
          <div style={{ fontWeight: 800, marginBottom: 8, fontSize: isMobile ? 24 : 28, fontFamily: FONT_DISPLAY }}>Top Menu</div>
          <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
            {topNav.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveId(item.id)}
                style={{
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(216,176,117,.5)",
                  background: item.id === active.id ? "rgba(216,176,117,.3)" : "rgba(8,8,10,.62)",
                  color: TEXT_MAIN,
                  cursor: "pointer",
                  fontSize: 17,
                  fontWeight: 700,
                }}
              >
                <span style={{ width: 18, height: 18, border: "1px solid rgba(216,176,117,.55)", borderRadius: 4, background: "rgba(216,176,117,.18)" }} />
                {item.label}
              </button>
            ))}
          </div>

          <div style={{ fontWeight: 800, marginBottom: 8, fontSize: isMobile ? 24 : 28, fontFamily: FONT_DISPLAY }}>Kingdom Menu</div>
          <div style={{ display: "grid", gap: 6, gridTemplateColumns: isMobile ? "repeat(auto-fit,minmax(145px,1fr))" : "1fr" }}>
            {kingdomNav.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveId(item.id)}
                style={{
                  textAlign: "left",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(216,176,117,.5)",
                  background: item.id === active.id ? "rgba(216,176,117,.3)" : "rgba(8,8,10,.62)",
                  color: TEXT_MAIN,
                  cursor: "pointer",
                  fontSize: 17,
                  fontWeight: 700,
                }}
              >
                <span style={{ width: 26, height: 26, border: "1px solid rgba(216,176,117,.6)", borderRadius: 4, background: "linear-gradient(180deg, rgba(216,176,117,.3), rgba(87,61,31,.3))" }} />
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <section style={{ display: "grid", gap: 12 }}>
          {/* Unverified email banner */}
          {auth.user.emailVerified === false && (
            <EmailVerifyBanner token={auth.token} onVerified={() => setAuth({ ...auth, user: { ...auth.user, emailVerified: true } })} />
          )}
          {active.id === "home" ? <HomeView /> : null}
          {active.id === "forums" ? <ForumsView /> : null}
          {active.id === "alliance-forums" ? <AllianceForumsView /> : null}
          {active.id === "overview" ? <OverviewView /> : null}
          {active.id === "buildings" ? <BuildingsView /> : null}
          {active.id === "alliance" ? <AllianceView /> : null}
          {active.id === "research" ? <ResearchView /> : null}
          {active.id === "settlements" ? <SettlementsView /> : null}
          {active.id === "war-room" ? <WarRoomView /> : null}
          {active.id === "train-troops" ? <TrainTroopsView /> : null}
          {active.id === "attack-kingdom" ? <AttackKingdomView /> : null}
          {active.id === "marketplace" ? <MarketplaceView /> : null}
          {active.id === "holy-circle" ? <PrayView /> : null}
          {active.id === "admin" ? <AdminView /> : null}
          {active.id === "rankings" ? <RankingsView /> : null}
          {active.id === "pigeons" ? <PigeonsView /> : null}
          {active.id === "guildhall" ? <GuildhallView /> : null}
          {active.id === "embassy" ? <EmbassyView /> : null}
          {active.id === "account" ? <AccountView /> : null}
          {active.id === "how-to-play" ? <HowToPlayView /> : null}
          {active.id !== "home" && active.id !== "forums" && active.id !== "alliance-forums" && active.id !== "overview" && active.id !== "buildings" && active.id !== "alliance" && active.id !== "research" && active.id !== "settlements" && active.id !== "war-room" && active.id !== "train-troops" && active.id !== "attack-kingdom" && active.id !== "marketplace" && active.id !== "holy-circle" && active.id !== "admin" && active.id !== "rankings" && active.id !== "pigeons" && active.id !== "guildhall" && active.id !== "embassy" && active.id !== "account" && active.id !== "how-to-play" ? <Placeholder label={active.label} /> : null}
        </section>
      </div>
      <footer
        style={{
          marginTop: 8,
          borderTop: "1px solid rgba(217,182,118,.18)",
          background: "rgba(15,15,18,0.72)",
          padding: "10px 16px",
          fontSize: 13,
          color: TEXT_MUTED,
          display: "flex",
          gap: 16,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <span>Build: {BUILD_SHA}</span>
        <span>Mode: {BUILD_MODE}</span>
        <span>Fast Demo: {FAST_FLAG}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
