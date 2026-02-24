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

const API_BASE = (window as any).__GG_API_BASE || "http://localhost:8080";
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
  };
  kingdom: {
    id: number;
    name: string;
  } | null;
  expiresAt?: string;
};

const BUILDING_META: Record<string, { sigil: string; summary: string; unlocks: string }> = {
  archery_ranges: { sigil: "AR", summary: "Ranges for precision military drills and ranged troop capacity.", unlocks: "Used to support archer-focused armies and ranged military growth." },
  barns: { sigil: "BN", summary: "Storage barns that protect surplus grain from loss.", unlocks: "Raises food storage resilience and reduces waste risk." },
  barracks: { sigil: "BK", summary: "Core infantry training grounds for disciplined foot troops.", unlocks: "Required to train Footmen and Pikemen." },
  castles: { sigil: "CT", summary: "Fortified command structures that harden defense and authority.", unlocks: "Required to train Knights and boosts defensive posture." },
  embassies: { sigil: "EM", summary: "Diplomatic hubs for foreign contacts and state relations.", unlocks: "Supports diplomatic units and alliance-facing strategy." },
  farm: { sigil: "FM", summary: "Grain farms that sustain the kingdom's food economy.", unlocks: "Increases food production each tick." },
  guildhalls: { sigil: "GH", summary: "Guild intelligence cells coordinating covert field reports.", unlocks: "Supports spy-oriented operations and utility units." },
  horse_farms: { sigil: "HF", summary: "Breeding fields for war mounts and transport stock.", unlocks: "Increases horse generation for cavalry training." },
  houses: { sigil: "HS", summary: "Civil housing blocks that stabilize growth and labor supply.", unlocks: "Expands peasant capacity and population support." },
  lumberyard: { sigil: "LY", summary: "Timber mills turning forests into usable construction goods.", unlocks: "Increases wood production each tick." },
  markets: { sigil: "MK", summary: "Trade plazas where coin, goods, and supply routes converge.", unlocks: "Improves kingdom-wide economy and logistics flow." },
  quarry: { sigil: "QY", summary: "Stone extraction sites feeding fortification and expansion.", unlocks: "Increases stone production each tick." },
  stables: { sigil: "ST", summary: "Cavalry stables for mounted tactics and horse handling.", unlocks: "Required to train Light Cavalry and Heavy Cavalry." },
  temples: { sigil: "TP", summary: "Sacred institutions that anchor faith and ritual power.", unlocks: "Supports priest-focused progression paths." },
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [taxRate, setTaxRate] = useState(26);
  const [seasonRemainingSec, setSeasonRemainingSec] = useState(0);
  const [taxBusy, setTaxBusy] = useState(false);
  const [shieldBusy, setShieldBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

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
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const k = details?.kingdom;
  const econ = details?.economy?.perHour || {};
  const bq = (details?.buildQueue || []).filter((x: any) => x.status === "queued").slice(0, 8);
  const tq = (details?.trainQueue || []).filter((x: any) => x.status === "queued").slice(0, 8);
  const populationTotal = Number(war?.kingdom?.populationHome || 0) + Number(war?.kingdom?.populationTrain || 0) + Number(war?.kingdom?.populationAway || 0);
  const fmtRate = (v: number) => `${v >= 0 ? "+" : ""}${Number(v || 0).toLocaleString()}/h`;
  const season = details?.season;
  const seasonRemaining = seasonRemainingSec;
  const seasonDays = Math.floor(seasonRemaining / 86400);
  const seasonHours = Math.floor((seasonRemaining % 86400) / 3600);
  const seasonMins = Math.floor((seasonRemaining % 3600) / 60);
  const seasonLabel = String(season?.name || "Spring");
  const shield = details?.shield || war?.shield;

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
  const daysPlayed = Math.max(1, Math.floor((Date.now() - new Date(String(k?.created_at || Date.now())).getTime()) / 86400000));
  const rankNum = Number(war?.kingdom?.rank || 0);
  const rankTitle = rankNum <= 3 ? "Prince" : rankNum <= 10 ? "Duke" : rankNum <= 25 ? "Count" : "Lord";
  const buildingPreview = ((details?.buildings || []) as Array<any>)
    .slice()
    .sort((a: any, b: any) => Number(b.level || 0) - Number(a.level || 0))
    .slice(0, 6);

  const statRows = [
    { icon: "RK", label: "Rank", value: `#${rankNum || "N/A"} / ${rankTitle}` },
    { icon: "RL", label: "Religion", value: "N/A" },
    { icon: "NW", label: "Networth", value: `${Math.floor(Number(war?.kingdom?.networth || 0)).toLocaleString()}` },
    { icon: "LD", label: "Land", value: `${Number(k?.land || 0).toLocaleString()} / ${Number(k?.land || 0).toLocaleString()} Acres` },
    { icon: "PP", label: "Population", value: `${Number(war?.kingdom?.populationHome || 0).toLocaleString()} / ${populationTotal.toLocaleString()}` },
    { icon: "SW", label: "Settlement Wellbeing", value: `${Math.floor(Number(k?.land || 0) * 12.5).toLocaleString()}` },
    { icon: "CD", label: "Consecutive Days", value: `${daysPlayed.toLocaleString()}` },
  ];

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(216,176,117,.24)",
        overflow: "hidden",
        background: `
          linear-gradient(90deg, rgba(18,18,21,.92) 0%, rgba(24,24,27,.83) 46%, rgba(20,20,22,.74) 100%),
          radial-gradient(900px 600px at 76% 50%, rgba(117,83,35,.3), rgba(0,0,0,0)),
          linear-gradient(170deg, #2d2a28, #171719 58%, #111114)
        `,
        boxShadow: "0 22px 50px rgba(0,0,0,.45)",
      }}
    >
      <div style={{ padding: "18px clamp(14px,3vw,28px) 20px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: "clamp(32px,4vw,52px)", fontWeight: 700, color: "#f7efe1", lineHeight: 1.05, fontFamily: FONT_DISPLAY }}>
            Overview - <span style={{ color: "#67b95f" }}>+</span> {k ? k.name : kingdom}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={INPUT_STYLE} />
            <button onClick={() => void load()} style={BTN_STYLE}>Load</button>
          </div>
        </div>

        {loading ? <div style={{ marginTop: 10, color: TEXT_MUTED }}>Loading overview...</div> : null}
        {error ? (
          <div style={{ marginTop: 10, color: "#ffae9a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{error}</span>
            <button onClick={() => void load()} style={BTN_STYLE}>Retry</button>
          </div>
        ) : null}
        {statusMsg ? <div style={{ marginTop: 8, color: "#c8e7b1" }}>{statusMsg}</div> : null}

        <div style={{ display: "grid", gap: 10, maxWidth: 760, marginTop: 12 }}>
          {statRows.map((row) => (
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "40px auto", gap: 12, alignItems: "center" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: "1px solid rgba(216,176,117,.55)",
                  background: "linear-gradient(180deg, rgba(93,66,28,.85), rgba(40,30,16,.86))",
                  color: "#f4dfb8",
                  fontWeight: 800,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 12,
                }}
              >
                {row.icon}
              </div>
              <div style={{ fontSize: "clamp(24px,2.5vw,43px)", lineHeight: 1.08, fontFamily: FONT_DISPLAY, color: "#f5ebdc" }}>
                {row.label}: <span style={{ marginLeft: 8 }}>{row.value}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, maxWidth: 760 }}>
          <div style={{ display: "grid", gridTemplateColumns: "40px auto", gap: 12, alignItems: "center", marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, border: "1px solid rgba(216,176,117,.55)", background: "linear-gradient(180deg, rgba(93,66,28,.85), rgba(40,30,16,.86))", color: "#f4dfb8", fontWeight: 800, borderRadius: 2, display: "grid", placeItems: "center", fontSize: 12 }}>SH</div>
            <div style={{ fontSize: "clamp(24px,2.4vw,41px)", fontFamily: FONT_DISPLAY }}>
              Shield:{" "}
              <button
                style={{ ...BTN_STYLE, marginLeft: 10, padding: "8px 14px" }}
                disabled={shieldBusy || (shield && String(shield.status || "none") !== "none")}
                onClick={() => void activateShield()}
              >
                {shieldBusy ? "..." : "Activate"}
              </button>
              <span style={{ marginLeft: 12, fontSize: 16, color: TEXT_MUTED }}>
                {shield?.status === "pending" ? `Pending: ${formatDuration(Number(shield?.remainingSeconds || 0))}` : null}
                {shield?.status === "active" ? `Active: ${formatDuration(Number(shield?.remainingSeconds || 0))}` : null}
                {shield?.status === "cooldown" ? `Cooldown: ${formatDuration(Number(shield?.remainingSeconds || 0))} (retaliation only)` : null}
                {shield?.status === "none" || !shield ? "None" : null}
              </span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "40px auto", gap: 12, alignItems: "center", marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, border: "1px solid rgba(216,176,117,.55)", background: "linear-gradient(180deg, rgba(93,66,28,.85), rgba(40,30,16,.86))", color: "#f4dfb8", fontWeight: 800, borderRadius: 2, display: "grid", placeItems: "center", fontSize: 12 }}>TX</div>
            <div style={{ fontSize: "clamp(24px,2.4vw,41px)", fontFamily: FONT_DISPLAY }}>
              Tax Rate: {taxRate}%{" "}
              <button disabled={taxBusy} onClick={() => void updateTax(taxRate + 1)} style={{ ...BTN_STYLE, marginLeft: 10, padding: "2px 10px" }}>+</button>
              <button disabled={taxBusy} onClick={() => void updateTax(taxRate - 1)} style={{ ...BTN_STYLE, marginLeft: 6, padding: "2px 10px" }}>-</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "40px auto", gap: 12 }}>
            <div style={{ width: 36, height: 36, border: "1px solid rgba(216,176,117,.55)", background: "linear-gradient(180deg, rgba(93,66,28,.85), rgba(40,30,16,.86))", color: "#f4dfb8", fontWeight: 800, borderRadius: 2, display: "grid", placeItems: "center", fontSize: 12 }}>SP</div>
            <div>
              <div style={{ fontSize: "clamp(24px,2.2vw,39px)", fontFamily: FONT_DISPLAY, lineHeight: 1.1 }}>
                {seasonLabel} ({seasonDays} days {seasonHours} hours {seasonMins} minutes remaining)
              </div>
              <div style={{ marginTop: 5, fontSize: "clamp(23px,2vw,35px)", lineHeight: 1.28, fontStyle: "italic", color: "#f0e3ce" }}>
                {String(season?.flavor || "Season effects are active and will rotate on tick.")}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, marginTop: 20 }}>
          <div style={{ borderTop: "1px solid rgba(216,176,117,.32)", paddingTop: 10 }}>
            <div style={{ fontSize: "clamp(30px,2.9vw,54px)", fontFamily: FONT_DISPLAY, marginBottom: 8 }}>Resources</div>
            <div style={{ display: "grid", gap: 6, fontSize: "clamp(22px,1.9vw,33px)", fontFamily: FONT_DISPLAY, lineHeight: 1.2 }}>
              <div>Food: {Number(k?.food || 0).toLocaleString()} <span style={{ color: Number(econ.food || 0) >= 0 ? "#9ddb8f" : "#ffab9c" }}>({fmtRate(Number(econ.food || 0))})</span></div>
              <div>Gold: {Number(k?.gold || 0).toLocaleString()} <span style={{ color: Number(econ.gold || 0) >= 0 ? "#9ddb8f" : "#ffab9c" }}>({fmtRate(Number(econ.gold || 0))})</span></div>
              <div>Stone: {Number(k?.stone || 0).toLocaleString()} <span style={{ color: "#9ddb8f" }}>({fmtRate(Number(econ.stone || 0))})</span></div>
              <div>Wood: {Number(k?.wood || 0).toLocaleString()} <span style={{ color: "#9ddb8f" }}>({fmtRate(Number(econ.wood || 0))})</span></div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(216,176,117,.32)", paddingTop: 10 }}>
            <div style={{ fontSize: "clamp(30px,2.9vw,54px)", fontFamily: FONT_DISPLAY, marginBottom: 8 }}>Settlement Buildings</div>
            <div style={{ display: "grid", gap: 6, fontSize: "clamp(20px,1.7vw,31px)", fontFamily: FONT_DISPLAY, lineHeight: 1.2 }}>
              {buildingPreview.length === 0 ? <div style={{ color: TEXT_MUTED }}>No building snapshot available.</div> : null}
              {buildingPreview.map((b: any) => (
                <div key={String(b.building_code)}>
                  {String(b.building_name || b.building_code)} {Number(b.level || 0).toLocaleString()}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, borderTop: "1px solid rgba(216,176,117,.22)", paddingTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>Training Queue</div>
            {tq.length === 0 ? <div style={{ color: TEXT_MUTED }}>No active training queue.</div> : null}
            {tq.map((q: any) => (
              <div key={`tq-${q.id}`} style={{ marginBottom: 4, fontSize: 15 }}>
                {Number(q.quantity || 0).toLocaleString()} x {q.troop_code} • {String(q.completes_at).replace("T", " ").slice(0, 19)}
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>Building Queue</div>
            {bq.length === 0 ? <div style={{ color: TEXT_MUTED }}>No active building queue.</div> : null}
            {bq.map((q: any) => (
              <div key={`bq-${q.id}`} style={{ marginBottom: 4, fontSize: 15 }}>
                {q.building_code} lvl {q.target_level} • {String(q.completes_at).replace("T", " ").slice(0, 19)}
              </div>
            ))}
          </div>
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
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Building</th>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Description</th>
                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Built</th>
                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Bldg</th>
                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((b) => {
                const code = String(b.building_code);
                const meta = BUILDING_META[code] || { sigil: code.slice(0, 2).toUpperCase(), summary: "Core kingdom infrastructure.", unlocks: "General growth and economy support." };
                const built = Number(b.level || 0);
                const bldg = Number(queueCounts[code] || 0);
                const total = built + bldg;
                return (
                  <tr key={code}>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(216,176,117,.15)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid rgba(216,176,117,.55)", background: "linear-gradient(180deg, rgba(89,67,37,.82), rgba(35,27,15,.92))", display: "grid", placeItems: "center", fontWeight: 800, color: "#f2dfbf" }}>
                          {meta.sigil}
                        </div>
                        <div>{String(b.building_name || code)}</div>
                      </div>
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(216,176,117,.15)", maxWidth: 520 }}>
                      <div style={{ fontSize: 14 }}>{meta.summary}</div>
                      <div style={{ marginTop: 2, fontSize: 13, color: "#d9c8ad" }}>{meta.unlocks}</div>
                    </td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{built.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{bldg.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{total.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Actions</div>
        <form onSubmit={submitBuild} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ minWidth: 110 }}>Build New</div>
          <select value={buildCode} onChange={(e) => setBuildCode(e.target.value)} style={INPUT_STYLE}>
            {buildOptions.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={500}
            value={buildQty}
            onChange={(e) => setBuildQty(Math.max(1, Number(e.target.value || 1)))}
            style={{ ...INPUT_STYLE, width: 120 }}
          />
          <button type="submit" style={BTN_STYLE} disabled={buildBusy}>
            {buildBusy ? "Queueing..." : "Queue Build"}
          </button>
        </form>
        {buildingMap[buildCode] ? (
          <div style={{ marginTop: 8, color: TEXT_MUTED }}>
            {buildingMap[buildCode].building_name || buildCode} • Time: {Math.floor(Number(buildingMap[buildCode].base_build_seconds || 0) / 3600)}h •
            Cost: Land {Number(buildingMap[buildCode].land_cost || 0)}, Stone {Number(buildingMap[buildCode].stone_cost || 0)}, Wood {Number(buildingMap[buildCode].wood_cost || 0)}
            <br />
            {BUILDING_META[String(buildCode)]?.summary || "Core kingdom infrastructure."}
            <br />
            {BUILDING_META[String(buildCode)]?.unlocks || "General growth and economy support."}
          </div>
        ) : null}
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Building...</div>
        {buildQueue.length === 0 ? <div style={{ color: TEXT_MUTED }}>No active building queue.</div> : null}
        {buildQueue.map((q) => (
          <div key={q.id} style={{ marginBottom: 6 }}>
            {q.building_code} lvl {q.target_level} • {String(q.completes_at).replace("T", " ").slice(0, 19)}
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

function ResearchView() {
  const [kingdom, setKingdom] = useState(() => localStorage.getItem(KINGDOM_STORAGE_KEY) || "Elixer");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [busyCode, setBusyCode] = useState("");

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
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 22 }}>Current Research Queue</div>
        {queue.length === 0 ? <div style={{ color: TEXT_MUTED }}>No active research queue.</div> : null}
        {queue.map((q) => (
          <div key={q.id} style={{ marginBottom: 6 }}>
            {q.research_code} lvl {q.target_level} • {String(q.completes_at).replace("T", " ").slice(0, 19)}
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
              <div key={q.id} style={{ marginBottom: 6 }}>
                {Number(q.quantity || 0).toLocaleString()} x {q.troop_code} • {String(q.completes_at).replace("T", " ").slice(0, 19)}
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

function AuthGate(props: { onAuthenticated: (auth: AuthState) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [kingdomName, setKingdomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const auth: AuthState = {
        token: String(j?.session?.token || ""),
        user: {
          id: String(j?.user?.id || ""),
          username: String(j?.user?.username || ""),
          email: String(j?.user?.email || ""),
        },
        kingdom: j?.kingdom ? { id: Number(j.kingdom.id), name: String(j.kingdom.name) } : null,
        expiresAt: String(j?.session?.expiresAt || ""),
      };
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
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const auth: AuthState = {
        token: String(j?.session?.token || ""),
        user: {
          id: String(j?.user?.id || ""),
          username: String(j?.user?.username || ""),
          email: String(j?.user?.email || ""),
        },
        kingdom: j?.kingdom ? { id: Number(j.kingdom.id), name: String(j.kingdom.name) } : null,
        expiresAt: String(j?.session?.expiresAt || ""),
      };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
      if (auth.kingdom?.name) localStorage.setItem(KINGDOM_STORAGE_KEY, auth.kingdom.name);
      props.onAuthenticated(auth);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        color: TEXT_MAIN,
        fontFamily: FONT_BODY,
        background:
          "radial-gradient(1200px 700px at 85% 20%, rgba(92,76,58,0.45), rgba(23,23,25,0.92)), linear-gradient(180deg, #2b2b2f 0%, #1a1a1d 48%, #161515 100%)",
      }}
    >
      <div style={{ ...CARD, width: "min(560px, 96vw)" }}>
        <div style={{ fontSize: 40, fontFamily: FONT_DISPLAY, fontWeight: 800, marginBottom: 10 }}>Crownforge</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setMode("login")} style={{ ...BTN_STYLE, background: mode === "login" ? "rgba(216,176,117,.35)" : (BTN_STYLE.background as string) }}>Login</button>
          <button onClick={() => setMode("register")} style={{ ...BTN_STYLE, background: mode === "register" ? "rgba(216,176,117,.35)" : (BTN_STYLE.background as string) }}>Register</button>
        </div>
        {mode === "login" ? (
          <form onSubmit={submitLogin} style={{ display: "grid", gap: 8 }}>
            <input value={emailOrUsername} onChange={(e) => setEmailOrUsername(e.target.value)} placeholder="Email or Username" style={INPUT_STYLE} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={INPUT_STYLE} />
            <button type="submit" style={BTN_STYLE} disabled={busy}>{busy ? "Logging in..." : "Login"}</button>
          </form>
        ) : (
          <form onSubmit={submitRegister} style={{ display: "grid", gap: 8 }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={INPUT_STYLE} />
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" style={INPUT_STYLE} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ chars)" style={INPUT_STYLE} />
            <input value={kingdomName} onChange={(e) => setKingdomName(e.target.value)} placeholder="Kingdom Name" style={INPUT_STYLE} />
            <button type="submit" style={BTN_STYLE} disabled={busy}>{busy ? "Creating account..." : "Create Account"}</button>
          </form>
        )}
        {error ? <div style={{ color: "#ffb5a5", marginTop: 8 }}>{error}</div> : null}
      </div>
    </main>
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
  const kingdomNav = NAV_ITEMS.filter((x) => x.group === "kingdom");
  const headerQuickNav = [topNav[0], topNav[1], topNav[2], NAV_ITEMS.find((x) => x.id === "overview"), NAV_ITEMS.find((x) => x.id === "logout")].filter(Boolean) as NavItem[];

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 980);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
          {active.id === "overview" ? <OverviewView /> : null}
          {active.id === "buildings" ? <BuildingsView /> : null}
          {active.id === "alliance" ? <AllianceView /> : null}
          {active.id === "research" ? <ResearchView /> : null}
          {active.id === "settlements" ? <SettlementsView /> : null}
          {active.id === "war-room" ? <WarRoomView /> : null}
          {active.id === "train-troops" ? <TrainTroopsView /> : null}
          {active.id === "attack-kingdom" ? <AttackKingdomView /> : null}
          {active.id !== "overview" && active.id !== "buildings" && active.id !== "alliance" && active.id !== "research" && active.id !== "settlements" && active.id !== "war-room" && active.id !== "train-troops" && active.id !== "attack-kingdom" ? <Placeholder label={active.label} /> : null}
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
