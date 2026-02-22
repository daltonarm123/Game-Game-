import dotenv from "dotenv";
import express from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { ensureSchema, pool, withTx } from "./db.js";

dotenv.config();

const app = express();
app.use(express.json());

const API_PORT = Number(process.env.API_PORT || 8080);
const ATTACK_RETURN_MINUTES = Number(process.env.ATTACK_RETURN_MINUTES || 20);
const LOCAL_DEMO_FAST = String(process.env.LOCAL_DEMO_FAST || "").trim() === "1";
const FAST_BUILD_SECONDS = Math.max(1, Number(process.env.FAST_BUILD_SECONDS || 5));
const FAST_TRAIN_SECONDS = Math.max(1, Number(process.env.FAST_TRAIN_SECONDS || 5));
const ATTACK_RETURN_SECONDS = Math.max(
  1,
  Number(process.env.ATTACK_RETURN_SECONDS || (LOCAL_DEMO_FAST ? 20 : ATTACK_RETURN_MINUTES * 60)),
);

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

const demoResetBody = z.object({
  attackerName: z.string().min(2).optional().default("Elixer"),
  defenderName: z.string().min(2).optional().default("Galileo"),
  attackerUserId: z.string().min(1).optional().default("u1"),
  defenderUserId: z.string().min(1).optional().default("u2"),
  attackerUsername: z.string().min(1).optional().default("envy90"),
  defenderUsername: z.string().min(1).optional().default("zoo"),
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

async function seedKingdom(c: PoolClient, opts: {
  userId: string;
  username: string;
  kingdomName: string;
  gold: number;
  food: number;
  wood: number;
  stone: number;
  land: number;
}) {
  await c.query(`INSERT INTO app_users(id, username) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username`, [
    opts.userId,
    opts.username,
  ]);
  const k = await c.query(
    `INSERT INTO kingdoms(user_id, name, gold, food, wood, stone, land)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, name`,
    [opts.userId, opts.kingdomName, opts.gold, opts.food, opts.wood, opts.stone, opts.land],
  );
  const kingdom = k.rows[0];
  await c.query(
    `INSERT INTO kingdom_buildings(kingdom_id, building_code, level)
     SELECT $1::bigint, code, 0 FROM building_types
     ON CONFLICT (kingdom_id, building_code) DO NOTHING`,
    [kingdom.id],
  );
  await c.query(
    `INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
     SELECT $1::bigint, code, 0 FROM troop_types
     ON CONFLICT (kingdom_id, troop_code) DO NOTHING`,
    [kingdom.id],
  );
  return kingdom;
}

app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "api", db: "up", ts: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ ok: false, service: "api", db: "down", error: String(e?.message || e) });
  }
});

app.post("/api/dev/demo-reset", async (req, res) => {
  const parsed = demoResetBody.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  const body = parsed.data;

  try {
    const out = await withTx(async (c) => {
      await c.query(`TRUNCATE troop_movements, attack_reports, train_queue, build_queue, kingdom_troops, kingdom_buildings, kingdoms, app_users RESTART IDENTITY CASCADE`);

      const attacker = await seedKingdom(c, {
        userId: body.attackerUserId,
        username: body.attackerUsername,
        kingdomName: body.attackerName,
        gold: 200000,
        food: 200000,
        wood: 50000,
        stone: 50000,
        land: 1000,
      });

      const defender = await seedKingdom(c, {
        userId: body.defenderUserId,
        username: body.defenderUsername,
        kingdomName: body.defenderName,
        gold: 200000,
        food: 200000,
        wood: 50000,
        stone: 50000,
        land: 1000,
      });

      return { attacker, defender };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
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

      const seconds = LOCAL_DEMO_FAST ? FAST_BUILD_SECONDS : Number(def.base_build_seconds) * nextLevel;
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

      const totalSeconds = LOCAL_DEMO_FAST ? FAST_TRAIN_SECONDS : Math.max(1, Number(def.train_seconds) * qty);
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
      const attackerSurvivors: Record<string, number> = {};
      for (const [code, sent] of Object.entries(sentOnly)) {
        const survivors = Math.max(0, Number(sent) - Number(attackerBattle.losses[code] || 0));
        attackerSurvivors[code] = survivors;
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

      for (const [code, survivors] of Object.entries(attackerSurvivors)) {
        if (Number(survivors) <= 0) continue;
        await c.query(
          `INSERT INTO troop_movements(owner_kingdom_id, owner_kingdom_name, target_kingdom_id, target_kingdom_name, troop_code, quantity, departed_at, returns_at, status, source_attack_report_id)
           VALUES ($1,$2,$3,$4,$5,$6,now(), now() + ($7 || ' seconds')::interval, 'out', $8)`,
          [atk.id, atk.name, def.id, def.name, code, Math.floor(survivors), ATTACK_RETURN_SECONDS, rep.rows[0].id],
        );
      }

      return {
        report: rep.rows[0],
        result,
        ratio: Number(ratio.toFixed(4)),
        attackerPower: Number(attackerPower.toFixed(2)),
        defenderPower: Number(defenderPower.toFixed(2)),
        landTaken,
        attackerLosses: attackerBattle.losses,
        defenderLosses: defenderBattle.losses,
        attackerSurvivorsAway: attackerSurvivors,
      };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/war-room/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  try {
    const k = await pool.query(
      `SELECT id, name, land, food, gold, created_at FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`,
      [kingdom],
    );
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const row = k.rows[0];

    const rankQ = await pool.query(
      `WITH nw AS (
         SELECT id,
                (land * 0.04 + food * 0.0001 + gold * 0.0005 + stone * 0.0002 + wood * 0.0002) AS networth
         FROM kingdoms
       ),
       r AS (
         SELECT id, networth, ROW_NUMBER() OVER (ORDER BY networth DESC) AS rank
         FROM nw
       )
       SELECT rank, networth FROM r WHERE id = $1`,
      [row.id],
    );

    const homeRows = await pool.query(
      `SELECT tt.code, tt.name, COALESCE(kt.amount,0) AS home
       FROM troop_types tt
       LEFT JOIN kingdom_troops kt ON kt.troop_code = tt.code AND kt.kingdom_id = $1
       ORDER BY tt.code`,
      [row.id],
    );

    const trainRows = await pool.query(
      `SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
       FROM train_queue
       WHERE kingdom_id = $1 AND status='queued'
       GROUP BY troop_code`,
      [row.id],
    );
    const awayRows = await pool.query(
      `SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
       FROM troop_movements
       WHERE owner_kingdom_id = $1 AND status='out' AND returns_at > now()
       GROUP BY troop_code`,
      [row.id],
    );

    const trainMap = new Map<string, number>();
    const awayMap = new Map<string, number>();
    for (const tr of trainRows.rows) trainMap.set(String(tr.troop_code), Number(tr.qty || 0));
    for (const aw of awayRows.rows) awayMap.set(String(aw.troop_code), Number(aw.qty || 0));

    const troops = homeRows.rows.map((t) => ({
      troopCode: t.code,
      troopName: t.name,
      home: Number(t.home || 0),
      train: Number(trainMap.get(String(t.code)) || 0),
      away: Number(awayMap.get(String(t.code)) || 0),
    }));

    const training = await pool.query(
      `SELECT id, troop_code, quantity, started_at, completes_at
       FROM train_queue
       WHERE kingdom_id = $1 AND status='queued'
       ORDER BY completes_at ASC
       LIMIT 50`,
      [row.id],
    );

    return res.json({
      ok: true,
      kingdom: {
        id: row.id,
        name: row.name,
        rank: Number(rankQ.rows[0]?.rank || 0),
        networth: Number(rankQ.rows[0]?.networth || 0),
        populationHome: troops.reduce((a, b) => a + Number(b.home || 0), 0),
        populationTrain: troops.reduce((a, b) => a + Number(b.train || 0), 0),
        populationAway: troops.reduce((a, b) => a + Number(b.away || 0), 0),
        food: Number(row.food || 0),
        gold: Number(row.gold || 0),
      },
      troops,
      training: training.rows,
      actions: ["Train Troops", "Attack Kingdom"],
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
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
