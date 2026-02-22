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

function OverviewMock() {
  const metricCard = (label: string, value: string) => (
    <div style={CARD}>
      <div style={{ fontSize: 12, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 34, lineHeight: 1.05, fontWeight: 800, color: "#fff7ec" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ fontSize: 38, fontWeight: 800, color: "#fff7ec", lineHeight: 1.05, fontFamily: FONT_DISPLAY }}>Overview - [KG] Elixer</div>
        <div style={{ color: TEXT_MUTED, marginTop: 8, fontSize: 18, fontWeight: 700 }}>Rank #13 / Duke • Religion: Nastfuru • Spring season</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {metricCard("Networth", "39,049")}
        {metricCard("Land", "43,459 / 43,460")}
        {metricCard("Population", "280,233 / 409,865")}
        {metricCard("Tax Rate", "24%")}
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 800, fontSize: 24, color: "#fff7ec", marginBottom: 12 }}>Resources (example layout)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Food: 747,550 / 10,211,752 <span style={{ color: "#9ddb8f" }}>(+901,296/h)</span></div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Gold: 117,267 / 4,822,440 <span style={{ color: "#9ddb8f" }}>(+145,500/h)</span></div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Stone: 30,359 / 328,755 <span style={{ color: "#ffab9c" }}>(-144/h)</span></div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Wood: 34,514 / 357,918 <span style={{ color: "#9ddb8f" }}>(+132/h)</span></div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Blue Gems: 3</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Green Gems: 19</div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 800, fontSize: 24, color: "#fff7ec", marginBottom: 10 }}>Queues</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Training: 6,000 x Pikemen • 03:10:14</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>Building: 300 x Stone Quarries • 01:03:59</div>
      </div>
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
  const troopCodeOptions = troops.map((t) => String(t.troopCode || ""));

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
        {error ? <div style={{ marginTop: 8, color: "#ffae9a" }}>{error}</div> : null}
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
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Home</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Train</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid rgba(216,176,117,.4)" }}>Away</th>
                  </tr>
                </thead>
                <tbody>
                  {troops.map((t) => (
                    <tr key={t.troopCode}>
                      <td style={{ padding: 8, borderBottom: "1px solid rgba(216,176,117,.15)" }}>{t.troopName}</td>
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
  const troopCodeOptions = troops.map((t) => String(t.troopCode || ""));

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
        {error ? <div style={{ marginTop: 8, color: "#ffae9a" }}>{error}</div> : null}
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
        {error ? <div style={{ marginTop: 8, color: "#ffae9a" }}>{error}</div> : null}
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
          <div style={{ width: 56, height: 56, borderRadius: 12, border: "1px solid rgba(216,176,117,.5)", background: "linear-gradient(180deg, rgba(130,16,16,.75), rgba(80,12,12,.75))", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 36, fontFamily: FONT_DISPLAY }}>K</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#fff7ec", fontFamily: FONT_DISPLAY, letterSpacing: 0.8 }}>Kingdom Game</div>
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
          {active.id === "overview" ? <OverviewMock /> : null}
          {active.id === "war-room" ? <WarRoomView /> : null}
          {active.id === "train-troops" ? <TrainTroopsView /> : null}
          {active.id === "attack-kingdom" ? <AttackKingdomView /> : null}
          {active.id !== "overview" && active.id !== "war-room" && active.id !== "train-troops" && active.id !== "attack-kingdom" ? <Placeholder label={active.label} /> : null}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
