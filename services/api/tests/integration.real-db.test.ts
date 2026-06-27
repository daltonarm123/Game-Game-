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