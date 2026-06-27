import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { app } = await import("../src/index.js");
const { ensureSchema, pool } = await import("../src/db.js");

function qident(name: string) {
  return `"${String(name || "").replace(/"/g, '""')}"`;
}

async function resetPublicSchemaData() {
  const tables = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'spatial_ref_sys'`,
  );
  const names = tables.rows.map((r) => String(r.tablename || "")).filter(Boolean);
  if (!names.length) return;
  const list = names.map((n) => qident(n)).join(", ");
  await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

async function postJson(url: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as any };
}

async function getJson(url: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: "GET", headers });
  return { status: res.status, body: await res.json() as any };
}

test(
  "real-db: shield cooldown blocks immediate reactivation",
  { skip: !process.env.DATABASE_URL },
  async () => {
    await ensureSchema();
    await resetPublicSchemaData();

    const server = app.listen(0);
    try {
      const addr = server.address();
      assert.ok(addr && typeof addr === "object");
      const base = `http://127.0.0.1:${addr.port}`;
      const stamp = Date.now();

      const reg = await postJson(`${base}/api/auth/register`, {
        email: `itest_${stamp}@example.com`,
        username: `itest_${stamp}`,
        password: "passphrase123",
        kingdomName: `ITest-${stamp}`,
      });
      assert.equal(reg.status, 200);
      assert.equal(reg.body.ok, true);

      const token = String(reg.body?.session?.token || "");
      const kingdom = String(reg.body?.kingdom?.name || "");
      assert.ok(token.length > 0);
      assert.ok(kingdom.length > 0);

      await pool.query(`UPDATE kingdoms SET green_gems=100 WHERE LOWER(name)=LOWER($1)`, [kingdom]);

      const activate1 = await postJson(`${base}/api/kingdom/${encodeURIComponent(kingdom)}/shield/activate`, { days: 1 }, token);
      assert.equal(activate1.status, 200);
      assert.equal(activate1.body.ok, true);

      const cancel = await postJson(`${base}/api/kingdom/${encodeURIComponent(kingdom)}/shield/cancel`, {}, token);
      assert.equal(cancel.status, 200);
      assert.equal(cancel.body.ok, true);
      assert.equal(String(cancel.body?.shield?.status || ""), "cooldown");

      const activate2 = await postJson(`${base}/api/kingdom/${encodeURIComponent(kingdom)}/shield/activate`, { days: 1 }, token);
      assert.equal(activate2.status, 400);
      assert.equal(activate2.body.ok, false);
      assert.match(String(activate2.body.error || ""), /cooldown/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await resetPublicSchemaData();
    }
  },
);

test(
  "real-db: marketplace listing can be bought by another kingdom",
  { skip: !process.env.DATABASE_URL },
  async () => {
    await ensureSchema();
    await resetPublicSchemaData();

    const server = app.listen(0);
    try {
      const addr = server.address();
      assert.ok(addr && typeof addr === "object");
      const base = `http://127.0.0.1:${addr.port}`;
      const stamp = Date.now();

      const seller = await postJson(`${base}/api/auth/register`, {
        email: `seller_${stamp}@example.com`,
        username: `seller_${stamp}`,
        password: "passphrase123",
        kingdomName: `Seller-${stamp}`,
      });
      assert.equal(seller.status, 200);
      assert.equal(seller.body.ok, true);

      const buyer = await postJson(`${base}/api/auth/register`, {
        email: `buyer_${stamp}@example.com`,
        username: `buyer_${stamp}`,
        password: "passphrase123",
        kingdomName: `Buyer-${stamp}`,
      });
      assert.equal(buyer.status, 200);
      assert.equal(buyer.body.ok, true);

      const sellerToken = String(seller.body?.session?.token || "");
      const sellerKingdom = String(seller.body?.kingdom?.name || "");
      const buyerToken = String(buyer.body?.session?.token || "");
      const buyerKingdom = String(buyer.body?.kingdom?.name || "");

      assert.ok(sellerToken.length > 0);
      assert.ok(buyerToken.length > 0);

      const list = await postJson(
        `${base}/api/market/${encodeURIComponent(sellerKingdom)}/list`,
        { resource: "food", quantity: 1000, pricePerUnit: 2 },
        sellerToken,
      );
      assert.equal(list.status, 200);
      assert.equal(list.body.ok, true);
      const listingId = Number(list.body?.listingId || 0);
      assert.ok(listingId > 0);

      const marketBefore = await getJson(`${base}/api/market`);
      assert.equal(marketBefore.status, 200);
      assert.equal(marketBefore.body.ok, true);
      const activeBefore = (marketBefore.body?.listings || []).find((l: any) => Number(l.id) === listingId);
      assert.ok(activeBefore);
      assert.equal(Number(activeBefore.quantity_remaining || 0), 1000);

      const buy = await postJson(
        `${base}/api/market/${encodeURIComponent(buyerKingdom)}/buy`,
        { listingId, quantity: 400 },
        buyerToken,
      );
      assert.equal(buy.status, 200);
      assert.equal(buy.body.ok, true);
      assert.equal(Number(buy.body?.quantity || 0), 400);

      const marketAfter = await getJson(`${base}/api/market`);
      assert.equal(marketAfter.status, 200);
      assert.equal(marketAfter.body.ok, true);
      const activeAfter = (marketAfter.body?.listings || []).find((l: any) => Number(l.id) === listingId);
      assert.ok(activeAfter);
      assert.equal(Number(activeAfter.quantity_remaining || 0), 600);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await resetPublicSchemaData();
    }
  },
);

test(
  "real-db: alliance create and join succeeds",
  { skip: !process.env.DATABASE_URL },
  async () => {
    await ensureSchema();
    await resetPublicSchemaData();

    const server = app.listen(0);
    try {
      const addr = server.address();
      assert.ok(addr && typeof addr === "object");
      const base = `http://127.0.0.1:${addr.port}`;
      const stamp = Date.now();

      const owner = await postJson(`${base}/api/auth/register`, {
        email: `alliance_owner_${stamp}@example.com`,
        username: `alliance_owner_${stamp}`,
        password: "passphrase123",
        kingdomName: `AllianceOwner-${stamp}`,
      });
      assert.equal(owner.status, 200);
      assert.equal(owner.body.ok, true);

      const joiner = await postJson(`${base}/api/auth/register`, {
        email: `alliance_joiner_${stamp}@example.com`,
        username: `alliance_joiner_${stamp}`,
        password: "passphrase123",
        kingdomName: `AllianceJoiner-${stamp}`,
      });
      assert.equal(joiner.status, 200);
      assert.equal(joiner.body.ok, true);

      const ownerToken = String(owner.body?.session?.token || "");
      const ownerKingdom = String(owner.body?.kingdom?.name || "");
      const joinerToken = String(joiner.body?.session?.token || "");
      const joinerKingdom = String(joiner.body?.kingdom?.name || "");
      assert.ok(ownerToken.length > 0);
      assert.ok(joinerToken.length > 0);

      const slug = `all-${stamp}`;
      const create = await postJson(
        `${base}/api/alliance/${encodeURIComponent(ownerKingdom)}/create`,
        { slug, name: `Alliance ${stamp}`, description: "Integration test alliance" },
        ownerToken,
      );
      assert.equal(create.status, 200);
      assert.equal(create.body.ok, true);

      const join = await postJson(
        `${base}/api/alliance/${encodeURIComponent(joinerKingdom)}/join`,
        { slug },
        joinerToken,
      );
      assert.equal(join.status, 200);
      assert.equal(join.body.ok, true);
      assert.equal(Number(join.body?.memberCount || 0), 2);

      const memberCountQ = await pool.query(
        `
        SELECT COUNT(*)::int AS n
        FROM alliance_members am
        JOIN alliances a ON a.id = am.alliance_id
        WHERE LOWER(a.slug)=LOWER($1)
        `,
        [slug],
      );
      assert.equal(Number(memberCountQ.rows[0]?.n || 0), 2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await resetPublicSchemaData();
    }
  },
);

test(
  "real-db: settlements can be founded and renamed",
  { skip: !process.env.DATABASE_URL },
  async () => {
    await ensureSchema();
    await resetPublicSchemaData();

    const server = app.listen(0);
    try {
      const addr = server.address();
      assert.ok(addr && typeof addr === "object");
      const base = `http://127.0.0.1:${addr.port}`;
      const stamp = Date.now();

      const reg = await postJson(`${base}/api/auth/register`, {
        email: `settlement_${stamp}@example.com`,
        username: `settlement_${stamp}`,
        password: "passphrase123",
        kingdomName: `Settlement-${stamp}`,
      });
      assert.equal(reg.status, 200);
      assert.equal(reg.body.ok, true);

      const token = String(reg.body?.session?.token || "");
      const kingdom = String(reg.body?.kingdom?.name || "");
      assert.ok(token.length > 0);
      assert.ok(kingdom.length > 0);

      await pool.query(`UPDATE kingdoms SET land=5000 WHERE LOWER(name)=LOWER($1)`, [kingdom]);

      const foundedName = `Test Hold ${stamp}`;
      const found = await postJson(
        `${base}/api/settlements/${encodeURIComponent(kingdom)}/found`,
        { name: foundedName },
        token,
      );
      assert.equal(found.status, 200);
      assert.equal(found.body.ok, true);
      const settlementId = Number(found.body?.settlement?.id || 0);
      assert.ok(settlementId > 0);
      assert.equal(String(found.body?.settlement?.name || ""), foundedName);

      const renamedName = `Renamed Hold ${stamp}`;
      const rename = await postJson(
        `${base}/api/settlements/${encodeURIComponent(kingdom)}/rename`,
        { settlementId, name: renamedName },
        token,
      );
      assert.equal(rename.status, 200);
      assert.equal(rename.body.ok, true);
      assert.equal(String(rename.body?.settlement?.name || ""), renamedName);

      const row = await pool.query(`SELECT name FROM settlements WHERE id=$1`, [settlementId]);
      assert.equal(String(row.rows[0]?.name || ""), renamedName);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await resetPublicSchemaData();
    }
  },
);

test(
  "real-db: war explore sends troops and gains land",
  { skip: !process.env.DATABASE_URL },
  async () => {
    await ensureSchema();
    await resetPublicSchemaData();

    const server = app.listen(0);
    try {
      const addr = server.address();
      assert.ok(addr && typeof addr === "object");
      const base = `http://127.0.0.1:${addr.port}`;
      const stamp = Date.now();

      const reg = await postJson(`${base}/api/auth/register`, {
        email: `war_${stamp}@example.com`,
        username: `war_${stamp}`,
        password: "passphrase123",
        kingdomName: `War-${stamp}`,
      });
      assert.equal(reg.status, 200);
      assert.equal(reg.body.ok, true);

      const token = String(reg.body?.session?.token || "");
      const kingdom = String(reg.body?.kingdom?.name || "");
      assert.ok(token.length > 0);
      assert.ok(kingdom.length > 0);

      const before = await pool.query(`SELECT id, land FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
      const kingdomId = Number(before.rows[0]?.id || 0);
      const landBefore = Number(before.rows[0]?.land || 0);
      assert.ok(kingdomId > 0);

      await pool.query(
        `
        INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
        VALUES ($1,'footmen',12000)
        ON CONFLICT (kingdom_id, troop_code) DO UPDATE SET amount=EXCLUDED.amount
        `,
        [kingdomId],
      );

      const explore = await postJson(
        `${base}/api/war-room/${encodeURIComponent(kingdom)}/explore`,
        { sentTroops: { footmen: 3000 } },
        token,
      );
      assert.equal(explore.status, 200);
      assert.equal(explore.body.ok, true);
      assert.ok(Number(explore.body?.landFound || 0) > 0);

      const after = await pool.query(`SELECT land FROM kingdoms WHERE id=$1`, [kingdomId]);
      const landAfter = Number(after.rows[0]?.land || 0);
      assert.ok(landAfter > landBefore);

      const movementCount = await pool.query(
        `SELECT COUNT(*)::int AS n FROM troop_movements WHERE owner_kingdom_id=$1 AND status='out'`,
        [kingdomId],
      );
      assert.ok(Number(movementCount.rows[0]?.n || 0) >= 1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await resetPublicSchemaData();
    }
  },
);