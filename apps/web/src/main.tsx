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

function OverviewView() {
  const [kingdom, setKingdom] = useState("Elixer");
  const [details, setDetails] = useState<any>(null);
  const [war, setWar] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const metricCard = (label: string, value: string) => (
    <div style={CARD}>
      <div style={{ fontSize: 12, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 34, lineHeight: 1.05, fontWeight: 800, color: "#fff7ec" }}>{value}</div>
    </div>
  );

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
  const econ = details?.economy?.perHour || {};
  const bq = (details?.buildQueue || []).filter((x: any) => x.status === "queued").slice(0, 8);
  const tq = (details?.trainQueue || []).filter((x: any) => x.status === "queued").slice(0, 8);
  const populationTotal = Number(war?.kingdom?.populationHome || 0) + Number(war?.kingdom?.populationTrain || 0) + Number(war?.kingdom?.populationAway || 0);
  const fmtRate = (v: number) => `${v >= 0 ? "+" : ""}${Number(v || 0).toLocaleString()}/h`;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 38, fontWeight: 800, color: "#fff7ec", lineHeight: 1.05, fontFamily: FONT_DISPLAY }}>
              Overview - {k ? k.name : kingdom}
            </div>
            <div style={{ color: TEXT_MUTED, marginTop: 8, fontSize: 18, fontWeight: 700 }}>
              Rank #{war?.kingdom?.rank || "N/A"} • Networth {Math.floor(Number(war?.kingdom?.networth || 0)).toLocaleString()}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={kingdom} onChange={(e) => setKingdom(e.target.value)} style={INPUT_STYLE} />
            <button onClick={() => void load()} style={BTN_STYLE}>
              Load
            </button>
          </div>
        </div>
        {loading ? <div style={{ marginTop: 10, color: TEXT_MUTED }}>Loading overview...</div> : null}
        {error ? (
          <div style={{ marginTop: 10, color: "#ffae9a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{error}</span>
            <button onClick={() => void load()} style={BTN_STYLE}>Retry</button>
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {metricCard("Networth", Math.floor(Number(war?.kingdom?.networth || 0)).toLocaleString())}
        {metricCard("Land", `${Number(k?.land || 0).toLocaleString()}`)}
        {metricCard("Population", `${Number(war?.kingdom?.populationHome || 0).toLocaleString()} / ${populationTotal.toLocaleString()}`)}
        {metricCard("Gold", `${Number(k?.gold || 0).toLocaleString()}`)}
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 800, fontSize: 24, color: "#fff7ec", marginBottom: 12 }}>Resources</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            Food: {Number(k?.food || 0).toLocaleString()}{" "}
            <span style={{ color: Number(econ.food || 0) >= 0 ? "#9ddb8f" : "#ffab9c", fontSize: 18 }}>
              ({fmtRate(Number(econ.food || 0))})
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            Gold: {Number(k?.gold || 0).toLocaleString()}{" "}
            <span style={{ color: Number(econ.gold || 0) >= 0 ? "#9ddb8f" : "#ffab9c", fontSize: 18 }}>
              ({fmtRate(Number(econ.gold || 0))})
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            Stone: {Number(k?.stone || 0).toLocaleString()}{" "}
            <span style={{ color: "#9ddb8f", fontSize: 18 }}>({fmtRate(Number(econ.stone || 0))})</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            Wood: {Number(k?.wood || 0).toLocaleString()}{" "}
            <span style={{ color: "#9ddb8f", fontSize: 18 }}>({fmtRate(Number(econ.wood || 0))})</span>
          </div>
        </div>
      </div>

      <div style={{ ...CARD, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 24, color: "#fff7ec", marginBottom: 10 }}>Queues</div>
        <div style={{ fontWeight: 800, fontSize: 20, color: "#fff7ec" }}> </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Training</div>
          {tq.length === 0 ? <div style={{ color: TEXT_MUTED }}>No active training queue.</div> : null}
          {tq.map((q: any) => (
            <div key={`tq-${q.id}`} style={{ marginBottom: 6, fontSize: 16 }}>
              {Number(q.quantity || 0).toLocaleString()} x {q.troop_code} • {String(q.completes_at).replace("T", " ").slice(0, 19)}
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Building</div>
          {bq.length === 0 ? <div style={{ color: TEXT_MUTED }}>No active building queue.</div> : null}
          {bq.map((q: any) => (
            <div key={`bq-${q.id}`} style={{ marginBottom: 6, fontSize: 16 }}>
              {q.building_code} lvl {q.target_level} • {String(q.completes_at).replace("T", " ").slice(0, 19)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BuildingsView() {
  const [kingdom, setKingdom] = useState("Elixer");
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
          Here you can see your kingdom buildings. It only shows what is built or queued in this game environment.
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
                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Built</th>
                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Bldg</th>
                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((b) => {
                const code = String(b.building_code);
                const built = Number(b.level || 0);
                const bldg = Number(queueCounts[code] || 0);
                const total = built + bldg;
                return (
                  <tr key={code}>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(216,176,117,.15)" }}>{String(b.building_name || code)}</td>
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
  const [kingdom, setKingdom] = useState("Elixer");
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
  const [kingdom, setKingdom] = useState("Elixer");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [trainTroop, setTrainTroop] = useState("pikemen");
  const [trainQty, setTrainQty] = useState(1000);
  const [attackTarget, setAttackTarget] = useState("");
  const [sentTroops, setSentTroops] = useState<Record<string, number>>({});
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

  function updateSent(code: string, value: number) {
    setSentTroops((prev) => ({ ...prev, [code]: Math.max(0, Math.floor(value || 0)) }));
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
      setActionMsg(
        `Attack result: ${j.result} | Ratio ${Number(j.ratio || 0).toFixed(2)} | Land ${Number(j.landTaken || 0).toLocaleString()}`,
      );
      await load();
    } catch (e: any) {
      setActionMsg(`Attack failed: ${String(e?.message || e)}`);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...CARD, background: "linear-gradient(180deg, rgba(52,32,16,0.96), rgba(28,18,10,0.94))" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#fff7ec" }}>War Room</div>
          <input
            value={kingdom}
            onChange={(e) => setKingdom(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(217,182,118,.35)",
              background: "rgba(0,0,0,.2)",
              color: "#f2e5cf",
            }}
            placeholder="Kingdom name"
          />
          <button
            onClick={() => void load()}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(217,182,118,.35)",
              background: "rgba(205,169,105,.28)",
              color: "#f2e5cf",
              cursor: "pointer",
            }}
          >
            Load
          </button>
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
            <div style={{ fontSize: 34, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY }}>War Room - {k.name}</div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 20, fontWeight: 700 }}>
              Rank: #{k.rank || "N/A"} • Networth: {Math.floor(Number(k.networth || 0)).toLocaleString()}
            </div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 20, fontWeight: 700 }}>
              Population: {Number(k.populationHome || 0).toLocaleString()} / {Number((k.populationHome || 0) + (k.populationTrain || 0) + (k.populationAway || 0)).toLocaleString()}
            </div>
            <div style={{ marginTop: 6, color: TEXT_MUTED, fontSize: 20, fontWeight: 700 }}>
              Food: {Number(k.food || 0).toLocaleString()} • Gold: {Number(k.gold || 0).toLocaleString()}
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 24 }}>Kingdom Troops</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Troop</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Att</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Def</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Food</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Gold</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>NW</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Home</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Train</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Away</th>
                  </tr>
                </thead>
                <tbody>
                  {troops.map((t) => (
                    <tr key={t.troopCode}>
                      <td style={{ padding: 8, borderBottom: "1px solid rgba(216,176,117,.15)" }}>{t.troopName}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{Number(t.att || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{Number(t.def || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{Number(t.upkeepFood || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{Number(t.upkeepGold || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{Number(t.nw || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{Number(t.home || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{Number(t.train || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid rgba(216,176,117,.15)" }}>{Number(t.away || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={CARD}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Actions</div>
            <div style={{ display: "grid", gap: 10 }}>
              <form onSubmit={submitTrain} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ minWidth: 110, opacity: 0.9 }}>Train Troops</div>
                <select
                  value={trainTroop}
                  onChange={(e) => setTrainTroop(e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(217,182,118,.35)", background: "rgba(0,0,0,.2)", color: "#f2e5cf" }}
                >
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
                  style={{ width: 130, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(217,182,118,.35)", background: "rgba(0,0,0,.2)", color: "#f2e5cf" }}
                />
                <button type="submit" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(217,182,118,.35)", background: "rgba(205,169,105,.28)", color: "#f2e5cf", cursor: "pointer" }}>
                  Queue Training
                </button>
              </form>

              <form onSubmit={submitAttack} style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ minWidth: 110, opacity: 0.9 }}>Attack Kingdom</div>
                  <input
                    value={attackTarget}
                    onChange={(e) => setAttackTarget(e.target.value)}
                    placeholder="Defender kingdom"
                    style={{ minWidth: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(217,182,118,.35)", background: "rgba(0,0,0,.2)", color: "#f2e5cf" }}
                  />
                </div>
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
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(217,182,118,.35)", background: "rgba(0,0,0,.2)", color: "#f2e5cf" }}
                      />
                    </label>
                  ))}
                </div>
                <div>
                  <button type="submit" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(217,182,118,.35)", background: "rgba(205,169,105,.28)", color: "#f2e5cf", cursor: "pointer" }}>
                    Launch Attack
                  </button>
                </div>
              </form>
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
  const [kingdom, setKingdom] = useState("Elixer");
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
  const [kingdom, setKingdom] = useState("Elixer");
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

function App() {
  const [activeId, setActiveId] = useState("overview");

  const active = useMemo(() => NAV_ITEMS.find((x) => x.id === activeId) || NAV_ITEMS[0], [activeId]);
  const topNav = NAV_ITEMS.filter((x) => x.group === "top");
  const kingdomNav = NAV_ITEMS.filter((x) => x.group === "kingdom");

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
      <header style={{ borderBottom: "1px solid rgba(217,182,118,.22)", padding: "14px 26px", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 16, background: "rgba(24,24,27,0.85)" }}>
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
          <div style={{ fontSize: 34, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY, letterSpacing: 0.8 }}>Crownforge</div>
        </div>
        <div style={{ display: "flex", gap: 26, alignItems: "center", color: "#f7eee0", fontFamily: FONT_DISPLAY, fontSize: 17 }}>
          <span>Home</span>
          <span>Forums</span>
          <span>How To Play</span>
          <span>Overview</span>
          <span>Logout</span>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          gap: 16,
          padding: 16,
          background:
            "linear-gradient(180deg, rgba(36,29,24,0.35), rgba(24,22,23,0.75))",
        }}
      >
        <aside style={{ ...CARD, height: "fit-content", position: "sticky", top: 16, background: "linear-gradient(180deg, rgba(29,29,33,0.86), rgba(19,19,22,0.88))" }}>
          <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 28, fontFamily: FONT_DISPLAY }}>Top Menu</div>
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

          <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 28, fontFamily: FONT_DISPLAY }}>Kingdom Menu</div>
          <div style={{ display: "grid", gap: 6 }}>
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
          {active.id === "research" ? <ResearchView /> : null}
          {active.id === "war-room" ? <WarRoomView /> : null}
          {active.id === "train-troops" ? <TrainTroopsView /> : null}
          {active.id === "attack-kingdom" ? <AttackKingdomView /> : null}
          {active.id !== "overview" && active.id !== "buildings" && active.id !== "research" && active.id !== "war-room" && active.id !== "train-troops" && active.id !== "attack-kingdom" ? <Placeholder label={active.label} /> : null}
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
