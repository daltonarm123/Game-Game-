import dotenv from "dotenv";
import express from "express";
import { z } from "zod";
import { ensureSchema, pool, withTx } from "./db.js";

dotenv.config();

const app = express();
app.use(express.json());

const API_PORT = Number(process.env.API_PORT || 8080);

const registerBody = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  kingdomName: z.string().min(2),
});

const buildBody = z.object({
  buildingCode: z.string().min(1),
});

const trainBody = z.object({
  troopCode: z.string().min(1),
  quantity: z.number().int().min(1).max(50000),
});

app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "api", db: "up", ts: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ ok: false, service: "api", db: "down", error: String(e?.message || e) });
  }
});

app.post("/api/dev/register", async (req, res) => {
  const parsed = registerBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  }

  const body = parsed.data;

  try {
    const out = await withTx(async (c) => {
      await c.query(
        `INSERT INTO app_users(id, username) VALUES ($1,$2)
         ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
        [body.userId, body.username],
      );

      const k = await c.query(
        `INSERT INTO kingdoms(user_id, name) VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING id, user_id, name, gold, wood, stone, food, land, created_at`,
        [body.userId, body.kingdomName],
      );
      const kingdom = k.rows[0];

      await c.query(
        `
        INSERT INTO kingdom_buildings(kingdom_id, building_code, level)
        SELECT $1::bigint, bt.code, 0
        FROM building_types bt
        ON CONFLICT (kingdom_id, building_code) DO NOTHING
        `,
        [kingdom.id],
      );

      await c.query(
        `
        INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
        SELECT $1::bigint, tt.code, 0
        FROM troop_types tt
        ON CONFLICT (kingdom_id, troop_code) DO NOTHING
        `,
        [kingdom.id],
      );

      return kingdom;
    });

    return res.json({ ok: true, kingdom: out });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/kingdom/:name", async (req, res) => {
  const name = String(req.params.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });

  try {
    const k = await pool.query(
      `SELECT id, user_id, name, gold, wood, stone, food, land, created_at, last_tick_at
       FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`,
      [name],
    );
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });

    const kingdom = k.rows[0];

    const buildings = await pool.query(
      `
      SELECT kb.building_code, bt.name AS building_name, kb.level, bt.wood_cost, bt.stone_cost, bt.base_build_seconds
      FROM kingdom_buildings kb
      JOIN building_types bt ON bt.code = kb.building_code
      WHERE kb.kingdom_id = $1
      ORDER BY kb.building_code ASC
      `,
      [kingdom.id],
    );

    const troops = await pool.query(
      `
      SELECT kt.troop_code, tt.name AS troop_name, kt.amount, tt.gold_cost, tt.food_cost, tt.train_seconds
      FROM kingdom_troops kt
      JOIN troop_types tt ON tt.code = kt.troop_code
      WHERE kt.kingdom_id = $1
      ORDER BY kt.troop_code ASC
      `,
      [kingdom.id],
    );

    const buildQueue = await pool.query(
      `
      SELECT id, building_code, target_level, started_at, completes_at, status
      FROM build_queue
      WHERE kingdom_id = $1
      ORDER BY started_at DESC
      LIMIT 20
      `,
      [kingdom.id],
    );

    const trainQueue = await pool.query(
      `
      SELECT id, troop_code, quantity, started_at, completes_at, status
      FROM train_queue
      WHERE kingdom_id = $1
      ORDER BY started_at DESC
      LIMIT 20
      `,
      [kingdom.id],
    );

    return res.json({ ok: true, kingdom, buildings: buildings.rows, troops: troops.rows, buildQueue: buildQueue.rows, trainQueue: trainQueue.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/build", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const parsed = buildBody.safeParse(req.body);
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const buildingCode = parsed.data.buildingCode.toLowerCase();

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, name, wood, stone FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [name]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdom = k.rows[0];

      const bt = await c.query(
        `SELECT code, name, wood_cost, stone_cost, base_build_seconds FROM building_types WHERE code=$1 LIMIT 1`,
        [buildingCode],
      );
      if (!bt.rowCount) throw new Error("unknown building code");
      const def = bt.rows[0];

      const kb = await c.query(`SELECT level FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code=$2 LIMIT 1`, [kingdom.id, buildingCode]);
      const currentLevel = Number(kb.rows[0]?.level || 0);

      const q = await c.query(
        `SELECT COALESCE(MAX(target_level), $2::int) AS max_target
         FROM build_queue
         WHERE kingdom_id=$1 AND building_code=$3 AND status='queued'`,
        [kingdom.id, currentLevel, buildingCode],
      );
      const nextLevel = Number(q.rows[0]?.max_target || currentLevel) + 1;

      const woodCost = Number(def.wood_cost) * nextLevel;
      const stoneCost = Number(def.stone_cost) * nextLevel;
      if (Number(kingdom.wood) < woodCost || Number(kingdom.stone) < stoneCost) {
        throw new Error(`not enough resources (need wood ${woodCost}, stone ${stoneCost})`);
      }

      await c.query(`UPDATE kingdoms SET wood = wood - $2, stone = stone - $3 WHERE id=$1`, [kingdom.id, woodCost, stoneCost]);

      const seconds = Number(def.base_build_seconds) * nextLevel;
      const ins = await c.query(
        `INSERT INTO build_queue(kingdom_id, building_code, target_level, started_at, completes_at, status)
         VALUES ($1,$2,$3, now(), now() + ($4 || ' seconds')::interval, 'queued')
         RETURNING id, kingdom_id, building_code, target_level, started_at, completes_at, status`,
        [kingdom.id, buildingCode, nextLevel, seconds],
      );

      return { queue: ins.rows[0], costs: { wood: woodCost, stone: stoneCost } };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/kingdom/:name/train", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const parsed = trainBody.safeParse(req.body);
  if (!name) return res.status(400).json({ ok: false, error: "kingdom name required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const troopCode = parsed.data.troopCode.toLowerCase();
  const qty = parsed.data.quantity;

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, gold, food FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [name]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdom = k.rows[0];

      const tt = await c.query(`SELECT code, name, gold_cost, food_cost, train_seconds FROM troop_types WHERE code=$1 LIMIT 1`, [troopCode]);
      if (!tt.rowCount) throw new Error("unknown troop code");
      const def = tt.rows[0];

      const totalGold = Number(def.gold_cost) * qty;
      const totalFood = Number(def.food_cost) * qty;

      if (Number(kingdom.gold) < totalGold || Number(kingdom.food) < totalFood) {
        throw new Error(`not enough resources (need gold ${totalGold}, food ${totalFood})`);
      }

      await c.query(`UPDATE kingdoms SET gold = gold - $2, food = food - $3 WHERE id=$1`, [kingdom.id, totalGold, totalFood]);

      const totalSeconds = Math.max(1, Number(def.train_seconds) * qty);
      const ins = await c.query(
        `INSERT INTO train_queue(kingdom_id, troop_code, quantity, started_at, completes_at, status)
         VALUES ($1,$2,$3, now(), now() + ($4 || ' seconds')::interval, 'queued')
         RETURNING id, kingdom_id, troop_code, quantity, started_at, completes_at, status`,
        [kingdom.id, troopCode, qty, totalSeconds],
      );

      return { queue: ins.rows[0], costs: { gold: totalGold, food: totalFood } };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

async function bootstrap() {
  await ensureSchema();
  app.listen(API_PORT, () => {
    console.log(`API listening on :${API_PORT}`);
  });
}

bootstrap().catch((e) => {
  console.error("API bootstrap failed", e);
  process.exit(1);
});
