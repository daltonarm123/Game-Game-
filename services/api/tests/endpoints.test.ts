import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { app } = await import("../src/index.js");
const { pool } = await import("../src/db.js");

type MockResult = { rows: any[]; rowCount: number };

function rows(rows: any[] = []): MockResult {
  return { rows, rowCount: rows.length };
}

async function post(path: string, body: unknown) {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const res = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as any };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function installMockDb(clientQuery: (sql: string, params?: any[]) => Promise<MockResult>) {
  const originalQuery = (pool as any).query;
  const originalConnect = (pool as any).connect;
  const client = {
    query: clientQuery,
    release() {},
  };
  (pool as any).query = async (sql: string, params?: any[]) => {
    if (sql.includes("FROM auth_sessions")) {
      return rows([{
        token: "test-token",
        user_id: "user-1",
        username: "tester",
        email: "tester@example.com",
        email_verified: true,
        is_admin: false,
        is_banned: false,
      }]);
    }
    if (sql.includes("AND user_id=$2")) return rows([{ id: 1 }]);
    return rows([]);
  };
  (pool as any).connect = async () => client;
  return () => {
    (pool as any).query = originalQuery;
    (pool as any).connect = originalConnect;
  };
}

test("shield blocks spy endpoint against protected defender", async () => {
  const restore = installMockDb(async (sql, params) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return rows([]);
    if (sql.includes("SELECT id, name FROM kingdoms") && String(params?.[0]).toLowerCase() === "attacker") {
      return rows([{ id: 1, name: "Attacker" }]);
    }
    if (sql.includes("SELECT id, name, land, gold") && String(params?.[0]).toLowerCase() === "defender") {
      return rows([{ id: 2, name: "Defender", land: 1000, gold: 50000, food: 50000, wood: 5000, stone: 5000, horses: 0, blue_gems: 0, green_gems: 0 }]);
    }
    if (sql.includes("vacation_started_at")) return rows([{ id: params?.[0], vacation_mode: false }]);
    if (sql.includes("SELECT vacation_mode")) return rows([{ vacation_mode: false }]);
    if (sql.includes("SELECT id, shield_status")) {
      return rows([{
        id: params?.[0],
        shield_status: Number(params?.[0]) === 2 ? "active" : "none",
        shield_requested_at: null,
        shield_starts_at: Number(params?.[0]) === 2 ? new Date().toISOString() : null,
        shield_ends_at: Number(params?.[0]) === 2 ? new Date(Date.now() + 86_400_000).toISOString() : null,
        shield_cooldown_ends_at: null,
      }]);
    }
    return rows([]);
  });
  try {
    const res = await post("/api/war-room/Attacker/spy", { defenderKingdom: "Defender", spiesToSend: 10 });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /defender is shielded/i);
  } finally {
    restore();
  }
});

test("successful sabotage sends surviving spies on a return timer and grants rewards", async () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  const movements: any[][] = [];
  const rewardUpdates: any[][] = [];
  const restore = installMockDb(async (sql, params) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return rows([]);
    if (sql.includes("SELECT id, name FROM kingdoms") && String(params?.[0]).toLowerCase() === "attacker") {
      return rows([{ id: 1, name: "Attacker" }]);
    }
    if (sql.includes("SELECT id, name FROM kingdoms") && String(params?.[0]).toLowerCase() === "defender") {
      return rows([{ id: 2, name: "Defender" }]);
    }
    if (sql.startsWith("DELETE FROM kingdom_status_effects")) return rows([]);
    if (sql.includes("vacation_started_at")) return rows([{ id: params?.[0], vacation_mode: false }]);
    if (sql.includes("SELECT vacation_mode")) return rows([{ vacation_mode: false }]);
    if (sql.includes("SELECT id, shield_status")) {
      return rows([{ id: params?.[0], shield_status: "none", shield_requested_at: null, shield_starts_at: null, shield_ends_at: null, shield_cooldown_ends_at: null }]);
    }
    if (sql.includes("troop_code='spies' FOR UPDATE")) {
      return rows([{ amount: Number(params?.[0]) === 1 ? 100 : 0 }]);
    }
    if (sql.includes("activeEffects")) return rows([{ mag: 0 }]);
    if (sql.includes("COALESCE(SUM(magnitude),0)")) return rows([{ mag: 0 }]);
    if (sql.startsWith("UPDATE kingdom_troops SET amount=amount-$2")) return rows([]);
    if (sql.startsWith("INSERT INTO troop_movements")) {
      movements.push(params || []);
      return rows([{ id: 1 }]);
    }
    if (sql.includes("SELECT gold AS amount")) return rows([{ amount: 100_000 }]);
    if (sql.startsWith("UPDATE kingdoms SET gold = gold -")) return rows([]);
    if (sql.startsWith("UPDATE kingdoms SET gold = gold +")) return rows([]);
    if (sql.startsWith("UPDATE kingdoms SET gold=gold+$2, green_gems")) {
      rewardUpdates.push(params || []);
      return rows([]);
    }
    if (sql.startsWith("INSERT INTO kingdom_notifications")) return rows([{ id: 1 }]);
    return rows([]);
  });
  try {
    const res = await post("/api/guildhall/Attacker/sabotage", {
      defenderKingdom: "Defender",
      spiesToSend: 100,
      resource: "gold",
      operation: "resource_heist",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.success, true);
    assert.equal(res.body.survivors, 92);
    assert.equal(res.body.returnSeconds, 30 * 60);
    assert.equal(res.body.successBonusGreenGems, 1);
    assert.equal(movements.length, 1);
    assert.deepEqual(movements[0].slice(0, 5), [1, "Attacker", 2, "Defender", 92]);
    assert.equal(movements[0][5], 30 * 60);
    assert.equal(rewardUpdates.length, 1);
  } finally {
    Math.random = originalRandom;
    restore();
  }
});
