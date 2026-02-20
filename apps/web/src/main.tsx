import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type NavItem = { id: string; label: string; group: "top" | "kingdom" };

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", group: "top" },
  { id: "forums", label: "Forums", group: "top" },
  { id: "how-to-play", label: "How To Play", group: "top" },
  { id: "overview", label: "Overview", group: "kingdom" },
  { id: "buildings", label: "Buildings", group: "kingdom" },
  { id: "war-room", label: "War Room", group: "kingdom" },
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

const CARD: React.CSSProperties = {
  background: "rgba(32, 20, 10, 0.75)",
  border: "1px solid rgba(217, 182, 118, 0.35)",
  borderRadius: 12,
  padding: 12,
};

function OverviewMock() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Overview - [KG] Elixer</div>
        <div style={{ opacity: 0.8, marginTop: 4 }}>Rank #13 / Duke • Religion: Nastfuru • Spring season</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <div style={CARD}>Networth: 39,049</div>
        <div style={CARD}>Land: 43,459 / 43,460 Acres</div>
        <div style={CARD}>Population: 280,233 / 409,865</div>
        <div style={CARD}>Tax Rate: 24%</div>
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Resources (example layout)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
          <div>Food: 747,550 / 10,211,752 (+901,296/h)</div>
          <div>Gold: 117,267 / 4,822,440 (+145,500/h)</div>
          <div>Stone: 30,359 / 328,755 (-144/h)</div>
          <div>Wood: 34,514 / 357,918 (+132/h)</div>
          <div>Blue Gems: 3</div>
          <div>Green Gems: 19</div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Queues</div>
        <div>Training: 6,000 x Pikemen • 03:10:14</div>
        <div>Building: 300 x Stone Quarries • 01:03:59</div>
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{label}</div>
      <div style={{ opacity: 0.8, marginTop: 8 }}>
        This tab is scaffolded and ready for feature implementation.
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
        color: "#f2e5cf",
        background: "radial-gradient(circle at top, #3c2d18 0%, #1b1209 50%, #0c0804 100%)",
        fontFamily: "Georgia, serif",
      }}
    >
      <header style={{ borderBottom: "1px solid rgba(217,182,118,.35)", padding: "14px 18px" }}>
        <div style={{ fontSize: 26, fontWeight: 700 }}>KingdomGame 2</div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, padding: 16 }}>
        <aside style={{ ...CARD, height: "fit-content", position: "sticky", top: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Top Menu</div>
          <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
            {topNav.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveId(item.id)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(217,182,118,.35)",
                  background: item.id === active.id ? "rgba(205,169,105,.28)" : "rgba(0,0,0,.2)",
                  color: "#f2e5cf",
                  cursor: "pointer",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div style={{ fontWeight: 700, marginBottom: 8 }}>Kingdom Menu</div>
          <div style={{ display: "grid", gap: 6 }}>
            {kingdomNav.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveId(item.id)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(217,182,118,.35)",
                  background: item.id === active.id ? "rgba(205,169,105,.28)" : "rgba(0,0,0,.2)",
                  color: "#f2e5cf",
                  cursor: "pointer",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <section style={{ display: "grid", gap: 12 }}>
          {active.id === "overview" ? <OverviewMock /> : <Placeholder label={active.label} />}
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
