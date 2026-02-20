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

const attackBody = z.object({
  defenderKingdom: z.string().min(2),
  sentTroops: z.record(z.string(), z.number().int().min(0)).refine((v) => Object.values(v).some((n) => n > 0), {
    message: "At least one troop amount must be > 0",
  }),
});

const TROOP_STATS: Record<string, { att: number; def: number }> = {
  footmen: { att: 1, def: 1 },
  pikemen: { att: 2, def: 2 },
  archers: { att: 1, def: 4 },
  light_cavalry: { att: 5, def: 4 },
  heavy_cavalry: { att: 7, def: 5 },
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function combatResultFromRatio(ratio: number): string {
  if (ratio < 0.25) return "FLEE";
  if (ratio < 0.75) return "MAJOR LOSS";
  if (ratio < 0.95) return "MINOR LOSS";
  if (ratio < 1.15) return "STALEMATE";
  if (ratio < 1.4) return "MINOR VICTORY";
  if (ratio < 2.5) return "VICTORY";
  if (ratio < 5.0) return "MAJOR VICTORY";
  return "OVERWHELMING VICTORY";
}

function landPctForResult(result: string): number {
  if (result === "STALEMATE") return 0.0075;
  if (result === "MINOR VICTORY") return 0.015;
  if (result === "VICTORY") return 0.025;
  if (result === "MAJOR VICTORY") return 0.0375;
  if (result === "OVERWHELMING VICTORY") return 0.05;
  return 0;
}

function attackerLossPct(result: string): number {
  if (result === "FLEE") return 0.7;
  if (result === "MAJOR LOSS") return 0.5;
  if (result === "MINOR LOSS") return 0.35;
  if (result === "STALEMATE") return 0.25;
  if (result === "MINOR VICTORY") return 0.18;
  if (result === "VICTORY") return 0.12;
  if (result === "MAJOR VICTORY") return 0.08;
  return 0.04;
}

function defenderLossPct(result: string): number {
  if (result === "FLEE") return 0.05;
  if (result === "MAJOR LOSS") return 0.12;
  if (result === "MINOR LOSS") return 0.18;
  if (result === "STALEMATE") return 0.25;
  if (result === "MINOR VICTORY") return 0.35;
  if (result === "VICTORY") return 0.45;
  if (result === "MAJOR VICTORY") return 0.55;
  return 0.65;
}

function applyLosses(units: Record<string, number>, pct: number, scope?: Record<string, number>) {
  const losses: Record<string, number> = {};
  const result: Record<string, number> = { ...units };
  const keys = Object.keys(scope || units);
  for (const k of keys) {
    const base = Number(scope ? scope[k] || 0 : units[k] || 0);
    const cur = Number(result[k] || 0);
    if (base <= 0 || cur <= 0) continue;
    const loss = clamp(Math.floor(base * pct), 0, cur);
    losses[k] = loss;
    result[k] = cur - loss;
  }
  return { losses, remaining: result };
}

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

app.post("/api/war-room/:attacker/attack", async (req, res) => {
  const attackerName = String(req.params.attacker || "").trim();
  const parsed = attackBody.safeParse(req.body);
  if (!attackerName) return res.status(400).json({ ok: false, error: "attacker kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const defenderName = parsed.data.defenderKingdom.trim();
  const sentTroopsRaw = Object.fromEntries(
    Object.entries(parsed.data.sentTroops).map(([k, v]) => [String(k).toLowerCase(), Number(v || 0)]),
  );

  try {
    const out = await withTx(async (c) => {
      const a = await c.query(`SELECT id, name, land FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [attackerName]);
      if (!a.rowCount) throw new Error("attacker kingdom not found");
      const d = await c.query(`SELECT id, name, land FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [defenderName]);
      if (!d.rowCount) throw new Error("defender kingdom not found");

      const atk = a.rows[0];
      const def = d.rows[0];
      if (Number(atk.id) === Number(def.id)) throw new Error("cannot attack self");

      const atkRows = await c.query(`SELECT troop_code, amount FROM kingdom_troops WHERE kingdom_id=$1`, [atk.id]);
      const defRows = await c.query(`SELECT troop_code, amount FROM kingdom_troops WHERE kingdom_id=$1`, [def.id]);
      const defCastle = await c.query(
        `SELECT COALESCE(level,0) AS lvl FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code='castles' LIMIT 1`,
        [def.id],
      );

      const attackerTroops: Record<string, number> = {};
      const defenderTroops: Record<string, number> = {};
      for (const r of atkRows.rows) attackerTroops[String(r.troop_code)] = Number(r.amount || 0);
      for (const r of defRows.rows) defenderTroops[String(r.troop_code)] = Number(r.amount || 0);

      for (const [code, sent] of Object.entries(sentTroopsRaw)) {
        if (sent <= 0) continue;
        const have = Number(attackerTroops[code] || 0);
        if (have < sent) throw new Error(`not enough ${code} (have ${have}, need ${sent})`);
      }

      let attackerPower = 0;
      for (const [code, sent] of Object.entries(sentTroopsRaw)) {
        if (sent <= 0) continue;
        attackerPower += Number(sent) * Number(TROOP_STATS[code]?.att || 0);
      }

      let defenderPowerRaw = 0;
      for (const [code, amount] of Object.entries(defenderTroops)) {
        defenderPowerRaw += Number(amount) * Number(TROOP_STATS[code]?.def || 0);
      }
      const castles = Number(defCastle.rows[0]?.lvl || 0);
      const castleBonus = castles > 0 ? Math.sqrt(castles) / 100 : 0;
      const defenderPower = defenderPowerRaw * (1 + castleBonus);

      const ratio = attackerPower <= 0 ? 0 : attackerPower / Math.max(1, defenderPower);
      const result = combatResultFromRatio(ratio);

      const aLossPct = attackerLossPct(result);
      const dLossPct = defenderLossPct(result);

      const sentOnly = Object.fromEntries(Object.entries(sentTroopsRaw).filter(([, v]) => v > 0));
      const attackerAfterSend: Record<string, number> = { ...attackerTroops };
      for (const [code, sent] of Object.entries(sentOnly)) {
        attackerAfterSend[code] = Number(attackerAfterSend[code] || 0) - Number(sent);
      }
      const attackerBattle = applyLosses(sentOnly, aLossPct, sentOnly);
      for (const [code, sent] of Object.entries(sentOnly)) {
        const survivors = Number(sent) - Number(attackerBattle.losses[code] || 0);
        attackerAfterSend[code] = Number(attackerAfterSend[code] || 0) + Math.max(0, survivors);
      }

      const defenderBattle = applyLosses(defenderTroops, dLossPct);

      const landPct = landPctForResult(result);
      const defenderLand = Number(def.land || 0);
      const landTaken = Math.max(0, Math.floor(defenderLand * landPct));
      const attackerLandNew = Number(atk.land || 0) + landTaken;
      const defenderLandNew = Math.max(0, defenderLand - landTaken);

      for (const [code, amount] of Object.entries(attackerAfterSend)) {
        await c.query(`UPDATE kingdom_troops SET amount=$3 WHERE kingdom_id=$1 AND troop_code=$2`, [atk.id, code, Math.max(0, Math.floor(amount))]);
      }
      for (const [code, amount] of Object.entries(defenderBattle.remaining)) {
        await c.query(`UPDATE kingdom_troops SET amount=$3 WHERE kingdom_id=$1 AND troop_code=$2`, [def.id, code, Math.max(0, Math.floor(amount))]);
      }

      await c.query(`UPDATE kingdoms SET land=$2 WHERE id=$1`, [atk.id, attackerLandNew]);
      await c.query(`UPDATE kingdoms SET land=$2 WHERE id=$1`, [def.id, defenderLandNew]);

      const rep = await c.query(
        `INSERT INTO attack_reports(attacker_kingdom_id, defender_kingdom_id, attacker_name, defender_name, result, ratio, land_taken, attacker_power, defender_power, sent_troops, attacker_losses, defender_losses)\n         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb)\n         RETURNING id, created_at`,
        [
          atk.id,
          def.id,
          atk.name,
          def.name,
          result,
          ratio,
          landTaken,
          attackerPower,
          defenderPower,
          JSON.stringify(sentOnly),
          JSON.stringify(attackerBattle.losses),
          JSON.stringify(defenderBattle.losses),
        ],
      );

      return {
        report: rep.rows[0],
        result,
        ratio: Number(ratio.toFixed(4)),
        attackerPower: Number(attackerPower.toFixed(2)),
        defenderPower: Number(defenderPower.toFixed(2)),
        landTaken,
        attackerLosses: attackerBattle.losses,
        defenderLosses: defenderBattle.losses,
      };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/war-room/reports/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const limit = clamp(Number(req.query.limit || 25), 1, 200);
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  try {
    const rows = await pool.query(
      `SELECT id, attacker_name, defender_name, result, ratio, land_taken, attacker_power, defender_power, sent_troops, attacker_losses, defender_losses, created_at\n       FROM attack_reports\n       WHERE LOWER(attacker_name)=LOWER($1) OR LOWER(defender_name)=LOWER($1)\n       ORDER BY created_at DESC\n       LIMIT $2`,
      [kingdom, limit],
    );
    return res.json({ ok: true, items: rows.rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
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
