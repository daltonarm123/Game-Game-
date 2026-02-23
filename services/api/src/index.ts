import dotenv from "dotenv";
import express from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { ensureSchema, pool, withTx } from "./db.js";

dotenv.config();

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});
app.use(express.json());

const API_PORT = Number(process.env.API_PORT || 8080);
const ATTACK_RETURN_MINUTES = Number(process.env.ATTACK_RETURN_MINUTES || 20);
const LOCAL_DEMO_FAST = String(process.env.LOCAL_DEMO_FAST || "").trim() === "1";
const FAST_BUILD_SECONDS = Math.max(1, Number(process.env.FAST_BUILD_SECONDS || 5));
const FAST_TRAIN_SECONDS = Math.max(1, Number(process.env.FAST_TRAIN_SECONDS || 5));
const FAST_RESEARCH_SECONDS = Math.max(5, Number(process.env.FAST_RESEARCH_SECONDS || 15));
const ATTACK_RETURN_SECONDS = Math.max(
  1,
  Number(process.env.ATTACK_RETURN_SECONDS || (LOCAL_DEMO_FAST ? 20 : ATTACK_RETURN_MINUTES * 60)),
);
const SEASON_LENGTH_SECONDS = Math.max(30, Number(process.env.SEASON_LENGTH_SECONDS || (LOCAL_DEMO_FAST ? 60 : 7 * 24 * 3600)));

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

const researchStartBody = z.object({
  researchCode: z.string().min(1),
});

const settlementUpgradeBody = z.object({
  settlementId: z.number().int().positive(),
  buildingCode: z.string().min(1),
});

const allianceCreateBody = z.object({
  slug: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional().default(""),
  imageUrl: z.string().optional().default(""),
});

const allianceJoinBody = z.object({
  allianceId: z.number().int().positive(),
});

const allianceRelationBody = z.object({
  relationType: z.enum(["ally", "nap", "enemy", "cease_fire", "joint_ops"]),
  targetName: z.string().min(2),
  note: z.string().optional().default(""),
});

const allianceContribBody = z.object({
  buildingCode: z.string().min(1),
  gold: z.number().int().min(0).optional().default(0),
  stone: z.number().int().min(0).optional().default(0),
  wood: z.number().int().min(0).optional().default(0),
});

const ECON_BUILDING_HOURLY = {
  farmFood: 120,
  lumberWood: 80,
  quarryStone: 80,
  baseGoldPerLand: 3,
  baseFoodPerLand: 2,
};

type SeasonCode = "spring" | "summer" | "autumn" | "winter";

const SEASONS: Array<{
  code: SeasonCode;
  name: string;
  flavor: string;
  modifiers: { food: number; gold: number; wood: number; stone: number };
}> = [
  {
    code: "spring",
    name: "Spring",
    flavor: "A new year dawns. Food growth increases and armies recover momentum.",
    modifiers: { food: 1.25, gold: 1.0, wood: 1.0, stone: 1.0 },
  },
  {
    code: "summer",
    name: "Summer",
    flavor: "Trade roads are clear. Gold, food, and wood all gain momentum.",
    modifiers: { food: 1.1, gold: 1.05, wood: 1.05, stone: 1.0 },
  },
  {
    code: "autumn",
    name: "Autumn",
    flavor: "Harvest season peaks. Food and wood stocks climb quickly.",
    modifiers: { food: 1.2, gold: 1.0, wood: 1.1, stone: 1.0 },
  },
  {
    code: "winter",
    name: "Winter",
    flavor: "Cold strains supply lines. Food and gold soften while stone output rises.",
    modifiers: { food: 0.85, gold: 0.95, wood: 0.95, stone: 1.05 },
  },
];

function seasonByIndex(index: number) {
  return SEASONS[((index % SEASONS.length) + SEASONS.length) % SEASONS.length];
}

async function getSeasonSnapshot() {
  return withTx(async (c) => {
    await c.query(
      `
      INSERT INTO game_state(id, season_index, season_code, season_started_at, season_ends_at, updated_at)
      VALUES (1, 0, 'spring', now(), now() + ($1 || ' seconds')::interval, now())
      ON CONFLICT (id) DO NOTHING
      `,
      [SEASON_LENGTH_SECONDS],
    );
    const q = await c.query(`SELECT season_index, season_started_at, season_ends_at FROM game_state WHERE id=1 FOR UPDATE`);
    const row = q.rows[0];

    let index = Math.max(0, Number(row?.season_index || 0));
    let startsAt = new Date(row?.season_started_at || Date.now());
    let endsAt = new Date(row?.season_ends_at || Date.now() + SEASON_LENGTH_SECONDS * 1000);
    const now = new Date();
    let changed = false;

    while (endsAt.getTime() <= now.getTime()) {
      index += 1;
      startsAt = endsAt;
      endsAt = new Date(startsAt.getTime() + SEASON_LENGTH_SECONDS * 1000);
      changed = true;
    }

    if (changed) {
      const s = seasonByIndex(index);
      await c.query(
        `
        UPDATE game_state
        SET season_index=$2, season_code=$3, season_started_at=$4, season_ends_at=$5, updated_at=now()
        WHERE id=$1
        `,
        [1, index, s.code, startsAt.toISOString(), endsAt.toISOString()],
      );
    } else {
      await c.query(`UPDATE game_state SET updated_at=now() WHERE id=1`);
    }

    const season = seasonByIndex(index);
    const remainingSeconds = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000));
    return {
      index,
      code: season.code,
      name: season.name,
      flavor: season.flavor,
      modifiers: season.modifiers,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      remainingSeconds,
    };
  });
}

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

function toLevelMap(rows: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.building_code)] = Number(r.level || 0);
  return out;
}

function computeEconomyHourly(
  land: number,
  buildingLevels: Record<string, number>,
  troopRows: any[],
  modifiers?: { food?: number; gold?: number; wood?: number; stone?: number },
) {
  const farm = Number(buildingLevels.farm || 0);
  const lumber = Number(buildingLevels.lumberyard || 0);
  const quarry = Number(buildingLevels.quarry || 0);

  const foodIncomeRaw = land * ECON_BUILDING_HOURLY.baseFoodPerLand + farm * ECON_BUILDING_HOURLY.farmFood;
  const goldIncomeRaw = land * ECON_BUILDING_HOURLY.baseGoldPerLand;
  const woodIncomeRaw = lumber * ECON_BUILDING_HOURLY.lumberWood;
  const stoneIncomeRaw = quarry * ECON_BUILDING_HOURLY.quarryStone;

  const foodIncome = foodIncomeRaw * Number(modifiers?.food ?? 1);
  const goldIncome = goldIncomeRaw * Number(modifiers?.gold ?? 1);
  const woodIncome = woodIncomeRaw * Number(modifiers?.wood ?? 1);
  const stoneIncome = stoneIncomeRaw * Number(modifiers?.stone ?? 1);

  let foodUpkeep = 0;
  let goldUpkeep = 0;
  for (const row of troopRows) {
    const amount = Number(row.amount || 0);
    foodUpkeep += amount * Number(row.upkeep_food || 0);
    goldUpkeep += amount * Number(row.upkeep_gold || 0);
  }

  return {
    perHour: {
      food: foodIncome - foodUpkeep,
      gold: goldIncome - goldUpkeep,
      wood: woodIncome,
      stone: stoneIncome,
    },
    raw: {
      foodIncomeRaw,
      goldIncomeRaw,
      woodIncomeRaw,
      stoneIncomeRaw,
      foodIncome,
      foodUpkeep,
      goldIncome,
      goldUpkeep,
      woodIncome,
      stoneIncome,
    },
  };
}

function researchGoldCost(baseGold: number, currentLevel: number) {
  return Math.max(1, Math.floor(baseGold * Math.pow(1.35, Math.max(0, currentLevel))));
}

function researchSeconds(baseSeconds: number, currentLevel: number) {
  const raw = Math.max(300, Math.floor(baseSeconds * Math.pow(1.25, Math.max(0, currentLevel))));
  return LOCAL_DEMO_FAST ? FAST_RESEARCH_SECONDS : raw;
}

const SETTLEMENT_UNLOCKS = [
  { land: 3000, type: "small_town", slots: 3 },
  { land: 8000, type: "medium_town", slots: 5 },
  { land: 14000, type: "large_town", slots: 8 },
  { land: 21000, type: "small_city", slots: 12 },
  { land: 30000, type: "medium_city", slots: 17 },
  { land: 50000, type: "large_city", slots: 25 },
  { land: 100000, type: "large_city", slots: 25 },
  { land: 250000, type: "large_city", slots: 25 },
];

function expectedSettlementSlots(land: number) {
  return SETTLEMENT_UNLOCKS.filter((x) => land >= x.land);
}

async function ensureSettlementsForKingdom(c: PoolClient, kingdomId: number, kingdomName: string, land: number) {
  const current = await c.query(`SELECT id FROM settlements WHERE kingdom_id=$1 ORDER BY id ASC`, [kingdomId]);
  const expected = expectedSettlementSlots(land);
  const currentCount = Number(current.rowCount || 0);
  if (currentCount >= expected.length) return;

  for (let i = currentCount; i < expected.length; i += 1) {
    const spec = expected[i];
    const name = `${kingdomName} ${i + 1}`;
    const ins = await c.query(
      `INSERT INTO settlements(kingdom_id, name, settlement_type, level, slots_total, wellbeing, wall_level)
       VALUES ($1,$2,$3,$4,$5,0,0)
       RETURNING id`,
      [kingdomId, name, spec.type, i + 1, spec.slots],
    );
    const settlementId = Number(ins.rows[0].id);
    await c.query(
      `
      INSERT INTO settlement_buildings(settlement_id, building_code, level)
      SELECT $1::bigint, code, 0 FROM settlement_building_types
      ON CONFLICT (settlement_id, building_code) DO NOTHING
      `,
      [settlementId],
    );
  }
}

function sanitizeAllianceSlug(input: string) {
  const normalized = String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized.length < 2 || normalized.length > 32) throw new Error("slug must be 2-32 chars (a-z, 0-9, -, _)");
  return normalized;
}

function allianceProjectTarget(base: number, level: number) {
  return Math.max(1, Math.floor(Number(base || 0) * Math.max(1, Number(level || 0) + 1)));
}

function allianceMemberCap(hallLevel: number) {
  return 15 + Math.max(0, Math.floor(Number(hallLevel || 0)));
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
  buildingLevels?: Record<string, number>;
  troopAmounts?: Record<string, number>;
  researchLevels?: Record<string, number>;
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
  if (opts.buildingLevels && Object.keys(opts.buildingLevels).length > 0) {
    for (const [code, level] of Object.entries(opts.buildingLevels)) {
      await c.query(
        `UPDATE kingdom_buildings SET level=$3 WHERE kingdom_id=$1 AND building_code=$2`,
        [kingdom.id, code, Math.max(0, Math.floor(Number(level || 0)))],
      );
    }
  }
  if (opts.troopAmounts && Object.keys(opts.troopAmounts).length > 0) {
    for (const [code, amount] of Object.entries(opts.troopAmounts)) {
      await c.query(
        `UPDATE kingdom_troops SET amount=$3 WHERE kingdom_id=$1 AND troop_code=$2`,
        [kingdom.id, code, Math.max(0, Math.floor(Number(amount || 0)))],
      );
    }
  }
  if (opts.researchLevels && Object.keys(opts.researchLevels).length > 0) {
    for (const [code, level] of Object.entries(opts.researchLevels)) {
      await c.query(
        `
        INSERT INTO kingdom_research(kingdom_id, research_code, level)
        VALUES ($1,$2,$3)
        ON CONFLICT (kingdom_id, research_code) DO UPDATE
        SET level = EXCLUDED.level
        `,
        [kingdom.id, code, Math.max(0, Math.floor(Number(level || 0)))],
      );
    }
  }
  await ensureSettlementsForKingdom(c, Number(kingdom.id), opts.kingdomName, Number(opts.land));
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
      await c.query(`TRUNCATE troop_movements, attack_reports, alliance_buildings, alliance_relations, alliance_members, alliances, settlement_capture_log, settlement_build_queue, settlement_buildings, settlements, research_queue, kingdom_research, train_queue, build_queue, kingdom_troops, kingdom_buildings, kingdoms, app_users RESTART IDENTITY CASCADE`);

      const attacker = await seedKingdom(c, {
        userId: body.attackerUserId,
        username: body.attackerUsername,
        kingdomName: body.attackerName,
        gold: 15_000_000,
        food: 30_000_000,
        wood: 2_000_000,
        stone: 2_000_000,
        land: 80_000,
        buildingLevels: {
          farm: 2200,
          lumberyard: 1800,
          quarry: 1800,
          barracks: 300,
          stables: 1200,
          castles: 250,
        },
        troopAmounts: {
          footmen: 45_000,
          pikemen: 32_000,
          archers: 22_000,
          light_cavalry: 38_000,
          heavy_cavalry: 27_000,
        },
        researchLevels: {
          better_farming_methods: 7,
          crop_rotation: 5,
          animal_husbandry: 5,
          winter_crops: 4,
          engineering: 4,
          improved_metal_working: 3,
          improved_tools: 1,
          better_building_maintenance: 4,
          better_barns: 3,
          improved_market_wagons: 5,
          larger_archery_ranges: 6,
          larger_barracks: 6,
          spy_glass: 1,
          mathematics: 5,
          accounting: 4,
          monastery: 5,
          herbalism: 5,
          medicine: 2,
          better_training_methods: 5,
          tactics: 5,
          leadership_training: 4,
          phalanx: 7,
          sharpshooter: 3,
          loose_order_formation: 3,
        },
      });

      const defender = await seedKingdom(c, {
        userId: body.defenderUserId,
        username: body.defenderUsername,
        kingdomName: body.defenderName,
        gold: 800000,
        food: 900000,
        wood: 150000,
        stone: 150000,
        land: 25000,
        buildingLevels: {
          farm: 700,
          lumberyard: 550,
          quarry: 550,
          barracks: 120,
          stables: 350,
          castles: 80,
        },
        troopAmounts: {
          footmen: 11_000,
          pikemen: 8_000,
          archers: 6_500,
          light_cavalry: 9_000,
          heavy_cavalry: 7_000,
        },
      });

      const alliance = await c.query(
        `INSERT INTO alliances(slug, name, description, created_by_kingdom_id)
         VALUES ('kga', 'Kingdom Game Addicts', 'Demo alliance for testing.', $1)
         RETURNING id`,
        [attacker.id],
      );
      await c.query(
        `INSERT INTO alliance_members(alliance_id, kingdom_id, role)
         VALUES ($1,$2,'owner'), ($1,$3,'member')`,
        [alliance.rows[0].id, attacker.id, defender.id],
      );
      await c.query(
        `
        INSERT INTO alliance_buildings(alliance_id, building_code, level, progress_gold, progress_stone, progress_wood)
        SELECT $1::bigint, code, 0, 0, 0, 0 FROM alliance_building_types
        ON CONFLICT (alliance_id, building_code) DO NOTHING
        `,
        [alliance.rows[0].id],
      );

      return { attacker, defender, alliance: alliance.rows[0] };
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
    await withTx(async (c) => {
      await ensureSettlementsForKingdom(c, Number(kingdom.id), String(kingdom.name), Number(kingdom.land || 0));
      return 0;
    });

    const buildings = await pool.query(
      `
      SELECT kb.building_code, bt.name AS building_name, kb.level, bt.land_cost, bt.wood_cost, bt.stone_cost, bt.base_build_seconds
      FROM kingdom_buildings kb
      JOIN building_types bt ON bt.code = kb.building_code
      WHERE kb.kingdom_id = $1
      ORDER BY kb.building_code ASC
      `,
      [kingdom.id],
    );

    const troops = await pool.query(
      `
      SELECT kt.troop_code, tt.name AS troop_name, kt.amount, tt.gold_cost, tt.food_cost, tt.train_seconds,
             tt.upkeep_food, tt.upkeep_gold, tt.att_rating, tt.def_rating, tt.nw_value, tt.housing, tt.notes, tt.is_trainable
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

    const season = await getSeasonSnapshot();
    const buildingLevels = toLevelMap(buildings.rows);
    const queuedTroops = await pool.query(
      `SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
       FROM train_queue
       WHERE kingdom_id=$1 AND status='queued'
       GROUP BY troop_code`,
      [kingdom.id],
    );
    const awayTroops = await pool.query(
      `SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
       FROM troop_movements
       WHERE owner_kingdom_id=$1 AND status='out' AND returns_at > now()
       GROUP BY troop_code`,
      [kingdom.id],
    );
    const queuedMap = new Map<string, number>();
    const awayMap = new Map<string, number>();
    for (const r of queuedTroops.rows) queuedMap.set(String(r.troop_code), Number(r.qty || 0));
    for (const r of awayTroops.rows) awayMap.set(String(r.troop_code), Number(r.qty || 0));
    const economyTroops = troops.rows.map((t) => {
      const code = String(t.troop_code || "");
      const home = Number(t.amount || 0);
      const train = Number(queuedMap.get(code) || 0);
      const away = Number(awayMap.get(code) || 0);
      return { ...t, amount: home + train + away };
    });
    const economy = computeEconomyHourly(Number(kingdom.land || 0), buildingLevels, economyTroops, season.modifiers);

    return res.json({
      ok: true,
      kingdom,
      buildings: buildings.rows,
      troops: troops.rows,
      buildQueue: buildQueue.rows,
      trainQueue: trainQueue.rows,
      economy,
      season,
    });
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
        `SELECT code, name, land_cost, wood_cost, stone_cost, base_build_seconds FROM building_types WHERE code=$1 LIMIT 1`,
        [buildingCode],
      );
      if (!bt.rowCount) throw new Error("unknown building code");
      const def = bt.rows[0];

      const kb = await c.query(`SELECT level FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code=$2 LIMIT 1`, [kingdom.id, buildingCode]);
      const currentLevel = Number(kb.rows[0]?.level || 0);

      const landUse = await c.query(
        `
        SELECT COALESCE(SUM(kb.level * bt.land_cost), 0) AS used_land
        FROM kingdom_buildings kb
        JOIN building_types bt ON bt.code = kb.building_code
        WHERE kb.kingdom_id = $1
        `,
        [kingdom.id],
      );
      const usedLand = Number(landUse.rows[0]?.used_land || 0);
      const availableLand = Number(kingdom.land || 0) - usedLand;

      const q = await c.query(
        `SELECT COALESCE(MAX(target_level), $2::int) AS max_target
         FROM build_queue
         WHERE kingdom_id=$1 AND building_code=$3 AND status='queued'`,
        [kingdom.id, currentLevel, buildingCode],
      );
      const nextLevel = Number(q.rows[0]?.max_target || currentLevel) + 1;

      const woodCost = Number(def.wood_cost) * nextLevel;
      const stoneCost = Number(def.stone_cost) * nextLevel;
      const landCost = Number(def.land_cost || 0);
      if (availableLand < landCost) {
        throw new Error(`not enough land (need ${landCost}, available ${availableLand})`);
      }
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

      return { queue: ins.rows[0], costs: { land: landCost, wood: woodCost, stone: stoneCost } };
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

      const tt = await c.query(`SELECT code, name, gold_cost, food_cost, train_seconds, is_trainable FROM troop_types WHERE code=$1 LIMIT 1`, [troopCode]);
      if (!tt.rowCount) throw new Error("unknown troop code");
      const def = tt.rows[0];
      if (!Boolean(def.is_trainable)) throw new Error(`${troopCode} is not trainable`);

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

      const atkRows = await c.query(
        `SELECT kt.troop_code, kt.amount, tt.att_rating, tt.def_rating
         FROM kingdom_troops kt
         JOIN troop_types tt ON tt.code = kt.troop_code
         WHERE kt.kingdom_id=$1`,
        [atk.id],
      );
      const defRows = await c.query(
        `SELECT kt.troop_code, kt.amount, tt.att_rating, tt.def_rating
         FROM kingdom_troops kt
         JOIN troop_types tt ON tt.code = kt.troop_code
         WHERE kt.kingdom_id=$1`,
        [def.id],
      );
      const defCastle = await c.query(
        `SELECT COALESCE(level,0) AS lvl FROM kingdom_buildings WHERE kingdom_id=$1 AND building_code='castles' LIMIT 1`,
        [def.id],
      );

      const attackerTroops: Record<string, number> = {};
      const defenderTroops: Record<string, number> = {};
      const troopAtt: Record<string, number> = {};
      const troopDef: Record<string, number> = {};
      for (const r of atkRows.rows) attackerTroops[String(r.troop_code)] = Number(r.amount || 0);
      for (const r of atkRows.rows) {
        troopAtt[String(r.troop_code)] = Number(r.att_rating || 0);
        troopDef[String(r.troop_code)] = Number(r.def_rating || 0);
      }
      for (const r of defRows.rows) defenderTroops[String(r.troop_code)] = Number(r.amount || 0);
      for (const r of defRows.rows) {
        troopAtt[String(r.troop_code)] = Number(r.att_rating || troopAtt[String(r.troop_code)] || 0);
        troopDef[String(r.troop_code)] = Number(r.def_rating || troopDef[String(r.troop_code)] || 0);
      }

      for (const [code, sent] of Object.entries(sentTroopsRaw)) {
        if (sent <= 0) continue;
        const have = Number(attackerTroops[code] || 0);
        if (have < sent) throw new Error(`not enough ${code} (have ${have}, need ${sent})`);
      }

      let attackerPower = 0;
      for (const [code, sent] of Object.entries(sentTroopsRaw)) {
        if (sent <= 0) continue;
        attackerPower += Number(sent) * Number(troopAtt[code] || 0);
      }

      let defenderPowerRaw = 0;
      for (const [code, amount] of Object.entries(defenderTroops)) {
        defenderPowerRaw += Number(amount) * Number(troopDef[code] || 0);
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

      // Fair settlement capture rules:
      // - max one settlement capture from same defender per 24h
      // - chance scales with land taken but reduced by target wall level
      // - defenders that hold more settlements than land-unlocked count are more vulnerable
      let capturedSettlement: any = null;
      if (landTaken > 0 && ["MINOR VICTORY", "VICTORY", "MAJOR VICTORY", "OVERWHELMING VICTORY"].includes(result)) {
        const recentCap = await c.query(
          `
          SELECT 1 FROM settlement_capture_log
          WHERE defender_kingdom_id=$1
            AND captured_at >= now() - interval '24 hours'
          LIMIT 1
          `,
          [def.id],
        );
        if (!recentCap.rowCount) {
          const defSetts = await c.query(
            `SELECT id, name, settlement_type, level, slots_total, wall_level
             FROM settlements
             WHERE kingdom_id=$1
             ORDER BY random()
             LIMIT 1`,
            [def.id],
          );
          const allDefSetts = await c.query(`SELECT COUNT(*)::int AS n FROM settlements WHERE kingdom_id=$1`, [def.id]);
          const allowedDef = expectedSettlementSlots(defenderLandNew).length;
          const overflow = Math.max(0, Number(allDefSetts.rows[0]?.n || 0) - allowedDef);
          if (defSetts.rowCount) {
            const s = defSetts.rows[0];
            const wallReduction = Math.min(0.75, Number(s.wall_level || 0) / 100);
            const landFactor = defenderLand > 0 ? landTaken / defenderLand : 0;
            const baseChance = 0.03 + Math.min(0.14, landFactor * 0.7) + (overflow > 0 ? 0.2 : 0);
            const captureChance = Math.max(0, Math.min(0.9, baseChance * (1 - wallReduction)));
            if (Math.random() < captureChance) {
              await c.query(
                `UPDATE settlements
                 SET kingdom_id=$2, captured_from_kingdom_id=$1
                 WHERE id=$3`,
                [def.id, atk.id, s.id],
              );
              await c.query(
                `
                INSERT INTO settlement_capture_log(attacker_kingdom_id, defender_kingdom_id, settlement_id)
                VALUES ($1,$2,$3)
                `,
                [atk.id, def.id, s.id],
              );
              capturedSettlement = {
                id: s.id,
                name: s.name,
                type: s.settlement_type,
                level: s.level,
                wallLevel: s.wall_level,
              };
            }
          }
        }
      }

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
        capturedSettlement,
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
    const season = await getSeasonSnapshot();
    const k = await pool.query(
      `SELECT id, name, land, food, gold, created_at FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`,
      [kingdom],
    );
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const row = k.rows[0];

    const rankQ = await pool.query(
      `WITH nw AS (
         WITH home AS (
           SELECT kingdom_id, troop_code, COALESCE(SUM(amount),0) AS qty
           FROM kingdom_troops
           GROUP BY kingdom_id, troop_code
         ),
         train AS (
           SELECT kingdom_id, troop_code, COALESCE(SUM(quantity),0) AS qty
           FROM train_queue
           WHERE status='queued'
           GROUP BY kingdom_id, troop_code
         ),
         away AS (
           SELECT owner_kingdom_id AS kingdom_id, troop_code, COALESCE(SUM(quantity),0) AS qty
           FROM troop_movements
           WHERE status='out' AND returns_at > now()
           GROUP BY owner_kingdom_id, troop_code
         ),
         troop_totals AS (
           SELECT
             COALESCE(h.kingdom_id, t.kingdom_id, a.kingdom_id) AS kingdom_id,
             COALESCE(h.troop_code, t.troop_code, a.troop_code) AS troop_code,
             COALESCE(h.qty,0) + COALESCE(t.qty,0) + COALESCE(a.qty,0) AS qty
           FROM home h
           FULL OUTER JOIN train t
             ON t.kingdom_id = h.kingdom_id
            AND t.troop_code = h.troop_code
           FULL OUTER JOIN away a
             ON a.kingdom_id = COALESCE(h.kingdom_id, t.kingdom_id)
            AND a.troop_code = COALESCE(h.troop_code, t.troop_code)
         ),
         troop_nw AS (
           SELECT tt.kingdom_id, COALESCE(SUM(tt.qty * ty.nw_value),0) AS troop_nw
           FROM troop_totals tt
           JOIN troop_types ty ON ty.code = tt.troop_code
           GROUP BY tt.kingdom_id
         )
         SELECT k.id,
                (k.land * 0.04 + k.food * 0.0001 + k.gold * 0.0005 + k.stone * 0.0002 + k.wood * 0.0002 + COALESCE(tn.troop_nw, 0)) AS networth
         FROM kingdoms k
         LEFT JOIN troop_nw tn ON tn.kingdom_id = k.id
       ),
       r AS (
         SELECT id, networth, ROW_NUMBER() OVER (ORDER BY networth DESC) AS rank
         FROM nw
       )
       SELECT rank, networth FROM r WHERE id = $1`,
      [row.id],
    );

    const homeRows = await pool.query(
      `SELECT tt.code, tt.name, tt.att_rating, tt.def_rating, tt.upkeep_food, tt.upkeep_gold, tt.nw_value, tt.housing, tt.notes, tt.is_trainable,
              COALESCE(kt.amount,0) AS home
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
      att: Number(t.att_rating || 0),
      def: Number(t.def_rating || 0),
      upkeepFood: Number(t.upkeep_food || 0),
      upkeepGold: Number(t.upkeep_gold || 0),
      nw: Number(t.nw_value || 0),
      housing: String(t.housing || ""),
      notes: String(t.notes || ""),
      isTrainable: Boolean(t.is_trainable),
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
      season,
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

app.get("/api/research/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  try {
    const k = await pool.query(`SELECT id, name, gold FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kingdomRow = k.rows[0];

    const skills = await pool.query(
      `SELECT code, name, category, effect_text, effect_per_level, base_gold, base_seconds, max_level
       FROM research_types
       ORDER BY category, name`,
    );
    const levels = await pool.query(`SELECT research_code, level FROM kingdom_research WHERE kingdom_id=$1`, [kingdomRow.id]);
    const queue = await pool.query(
      `SELECT id, research_code, target_level, started_at, completes_at, status
       FROM research_queue
       WHERE kingdom_id=$1 AND status='queued'
       ORDER BY completes_at ASC`,
      [kingdomRow.id],
    );
    const prereqs = await pool.query(
      `SELECT rp.research_code, rp.prereq_code, rp.required_level, rt.name AS prereq_name
       FROM research_prereqs rp
       JOIN research_types rt ON rt.code = rp.prereq_code`,
    );

    const levelMap = new Map<string, number>();
    for (const l of levels.rows) levelMap.set(String(l.research_code), Number(l.level || 0));
    const queuedSet = new Set(queue.rows.map((q) => String(q.research_code)));
    const prereqMap = new Map<string, any[]>();
    for (const p of prereqs.rows) {
      const key = String(p.research_code);
      if (!prereqMap.has(key)) prereqMap.set(key, []);
      prereqMap.get(key)!.push({
        code: p.prereq_code,
        name: p.prereq_name,
        requiredLevel: Number(p.required_level || 0),
        currentLevel: Number(levelMap.get(String(p.prereq_code)) || 0),
      });
    }

    const items = skills.rows.map((s) => {
      const code = String(s.code);
      const currentLevel = Number(levelMap.get(code) || 0);
      const maxLevel = Number(s.max_level || 10);
      const nextLevel = Math.min(maxLevel, currentLevel + 1);
      const reqs = prereqMap.get(code) || [];
      const missing = reqs.filter((r) => Number(r.currentLevel || 0) < Number(r.requiredLevel || 0));
      const isMaxed = currentLevel >= maxLevel;
      const nextGold = isMaxed ? 0 : researchGoldCost(Number(s.base_gold || 0), currentLevel);
      const nextSeconds = isMaxed ? 0 : researchSeconds(Number(s.base_seconds || 0), currentLevel);
      const queueSlotsUsed = queue.rows.length;
      const canResearch = !isMaxed && missing.length === 0 && !queuedSet.has(code) && queueSlotsUsed < 2 && Number(kingdomRow.gold || 0) >= nextGold;
      return {
        code,
        name: s.name,
        category: s.category,
        effectText: s.effect_text,
        effectPerLevel: Number(s.effect_per_level || 0),
        currentLevel,
        nextLevel,
        maxLevel,
        currentEffect: Number((Number(s.effect_per_level || 0) * currentLevel).toFixed(4)),
        nextEffect: Number((Number(s.effect_per_level || 0) * nextLevel).toFixed(4)),
        nextGold,
        nextSeconds,
        isQueued: queuedSet.has(code),
        missingPrereqs: missing,
        prereqs: reqs,
        canResearch,
      };
    });

    return res.json({
      ok: true,
      kingdom: { id: kingdomRow.id, name: kingdomRow.name, gold: Number(kingdomRow.gold || 0) },
      queueSlotsUsed: queue.rows.length,
      queueSlotsMax: 2,
      queue: queue.rows,
      items,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/research/:kingdom/start", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = researchStartBody.safeParse(req.body);
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  const researchCode = String(parsed.data.researchCode || "").toLowerCase().trim();
  if (!researchCode) return res.status(400).json({ ok: false, error: "researchCode required" });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, name, gold FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];

      const active = await c.query(`SELECT COUNT(*)::int AS n FROM research_queue WHERE kingdom_id=$1 AND status='queued'`, [kr.id]);
      const activeN = Number(active.rows[0]?.n || 0);
      if (activeN >= 2) throw new Error("research queue full (max 2)");

      const r = await c.query(
        `SELECT code, name, base_gold, base_seconds, max_level
         FROM research_types
         WHERE code=$1
         LIMIT 1`,
        [researchCode],
      );
      if (!r.rowCount) throw new Error("unknown research code");
      const def = r.rows[0];

      const cur = await c.query(`SELECT level FROM kingdom_research WHERE kingdom_id=$1 AND research_code=$2 LIMIT 1`, [kr.id, researchCode]);
      const curLevel = Number(cur.rows[0]?.level || 0);
      const maxLevel = Number(def.max_level || 10);
      if (curLevel >= maxLevel) throw new Error("research already maxed");

      const alreadyQueued = await c.query(
        `SELECT 1 FROM research_queue WHERE kingdom_id=$1 AND research_code=$2 AND status='queued' LIMIT 1`,
        [kr.id, researchCode],
      );
      if (alreadyQueued.rowCount) throw new Error("research already queued");

      const prereqs = await c.query(
        `SELECT prereq_code, required_level FROM research_prereqs WHERE research_code=$1`,
        [researchCode],
      );
      for (const p of prereqs.rows) {
        const have = await c.query(
          `SELECT level FROM kingdom_research WHERE kingdom_id=$1 AND research_code=$2 LIMIT 1`,
          [kr.id, p.prereq_code],
        );
        const haveLevel = Number(have.rows[0]?.level || 0);
        const needLevel = Number(p.required_level || 0);
        if (haveLevel < needLevel) {
          throw new Error(`missing prerequisite: ${String(p.prereq_code)} (${haveLevel}/${needLevel})`);
        }
      }

      const goldCost = researchGoldCost(Number(def.base_gold || 0), curLevel);
      if (Number(kr.gold || 0) < goldCost) throw new Error(`not enough gold (need ${goldCost})`);

      await c.query(`UPDATE kingdoms SET gold = gold - $2 WHERE id=$1`, [kr.id, goldCost]);
      const seconds = researchSeconds(Number(def.base_seconds || 3600), curLevel);
      const targetLevel = curLevel + 1;
      const ins = await c.query(
        `
        INSERT INTO research_queue(kingdom_id, research_code, target_level, started_at, completes_at, status)
        VALUES ($1,$2,$3,now(), now() + ($4 || ' seconds')::interval, 'queued')
        RETURNING id, research_code, target_level, started_at, completes_at, status
        `,
        [kr.id, researchCode, targetLevel, seconds],
      );

      return { queue: ins.rows[0], costGold: goldCost };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/settlements/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  try {
    const k = await pool.query(`SELECT id, name, land, gold, wood, stone FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kr = k.rows[0];

    await withTx(async (c) => {
      await ensureSettlementsForKingdom(c, Number(kr.id), String(kr.name), Number(kr.land || 0));
      return 0;
    });

    const settlements = await pool.query(
      `SELECT id, name, settlement_type, level, slots_total, wellbeing, wall_level, captured_from_kingdom_id, created_at
       FROM settlements
       WHERE kingdom_id=$1
       ORDER BY id ASC`,
      [kr.id],
    );
    const buildings = await pool.query(
      `
      SELECT sb.settlement_id, sb.building_code, sb.level, bt.name, bt.effect_text, bt.base_gold, bt.base_stone, bt.base_wood, bt.max_level, bt.city_only
      FROM settlement_buildings sb
      JOIN settlement_building_types bt ON bt.code = sb.building_code
      JOIN settlements s ON s.id = sb.settlement_id
      WHERE s.kingdom_id = $1
      ORDER BY sb.settlement_id, sb.building_code
      `,
      [kr.id],
    );
    const queue = await pool.query(
      `
      SELECT id, settlement_id, building_code, target_level, started_at, completes_at, status
      FROM settlement_build_queue
      WHERE kingdom_id=$1 AND status='queued'
      ORDER BY completes_at ASC
      `,
      [kr.id],
    );
    const catalog = await pool.query(
      `SELECT code, name, effect_text, base_gold, base_stone, base_wood, max_level, city_only
       FROM settlement_building_types
       ORDER BY name`,
    );

    return res.json({
      ok: true,
      kingdom: { id: kr.id, name: kr.name, land: Number(kr.land || 0), gold: Number(kr.gold || 0), wood: Number(kr.wood || 0), stone: Number(kr.stone || 0) },
      settlements: settlements.rows,
      buildings: buildings.rows,
      queue: queue.rows,
      catalog: catalog.rows,
      unlockedByLand: expectedSettlementSlots(Number(kr.land || 0)).length,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/settlements/:kingdom/upgrade-building", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = settlementUpgradeBody.safeParse(req.body);
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  const { settlementId, buildingCode } = parsed.data;

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, name, gold, wood, stone FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];

      const s = await c.query(
        `SELECT id, settlement_type, level FROM settlements WHERE id=$1 AND kingdom_id=$2 FOR UPDATE`,
        [settlementId, kr.id],
      );
      if (!s.rowCount) throw new Error("settlement not found");
      const st = s.rows[0];

      const bt = await c.query(
        `SELECT code, name, base_gold, base_stone, base_wood, max_level, city_only
         FROM settlement_building_types
         WHERE code=$1 LIMIT 1`,
        [String(buildingCode).toLowerCase()],
      );
      if (!bt.rowCount) throw new Error("unknown settlement building");
      const def = bt.rows[0];

      const isCity = String(st.settlement_type || "").includes("city");
      if (Boolean(def.city_only) && !isCity) throw new Error("building requires a city settlement");

      const sb = await c.query(
        `SELECT level FROM settlement_buildings WHERE settlement_id=$1 AND building_code=$2 LIMIT 1`,
        [settlementId, def.code],
      );
      const currentLevel = Number(sb.rows[0]?.level || 0);
      if (currentLevel >= Number(def.max_level || 10)) throw new Error("building already maxed");

      const nextLevel = currentLevel + 1;
      const costGold = Math.floor(Number(def.base_gold || 0) * Math.pow(1.3, currentLevel));
      const costStone = Math.floor(Number(def.base_stone || 0) * Math.pow(1.2, currentLevel));
      const costWood = Math.floor(Number(def.base_wood || 0) * Math.pow(1.2, currentLevel));
      if (Number(kr.gold || 0) < costGold || Number(kr.stone || 0) < costStone || Number(kr.wood || 0) < costWood) {
        throw new Error(`not enough resources (need gold ${costGold}, stone ${costStone}, wood ${costWood})`);
      }

      await c.query(`UPDATE kingdoms SET gold=gold-$2, stone=stone-$3, wood=wood-$4 WHERE id=$1`, [kr.id, costGold, costStone, costWood]);
      const secondsBase = 6 * 3600;
      const seconds = LOCAL_DEMO_FAST ? 20 : Math.floor(secondsBase * Math.pow(1.2, currentLevel));
      const ins = await c.query(
        `
        INSERT INTO settlement_build_queue(kingdom_id, settlement_id, building_code, target_level, started_at, completes_at, status)
        VALUES ($1,$2,$3,$4,now(), now() + ($5 || ' seconds')::interval, 'queued')
        RETURNING id, settlement_id, building_code, target_level, started_at, completes_at, status
        `,
        [kr.id, settlementId, def.code, nextLevel, seconds],
      );

      return { queue: ins.rows[0], costs: { gold: costGold, stone: costStone, wood: costWood } };
    });
    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get("/api/alliance/:kingdom", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  try {
    const k = await pool.query(`SELECT id, name, gold, stone, wood, land FROM kingdoms WHERE LOWER(name)=LOWER($1) LIMIT 1`, [kingdom]);
    if (!k.rowCount) return res.status(404).json({ ok: false, error: "kingdom not found" });
    const kr = k.rows[0];

    const membership = await pool.query(
      `
      SELECT am.role, a.id AS alliance_id, a.slug, a.name, a.description, a.image_url, a.created_by_kingdom_id, a.created_at
      FROM alliance_members am
      JOIN alliances a ON a.id = am.alliance_id
      WHERE am.kingdom_id=$1
      LIMIT 1
      `,
      [kr.id],
    );

    if (!membership.rowCount) {
      const alliances = await pool.query(
        `
        SELECT a.id, a.slug, a.name, a.description, a.image_url, a.created_at, COUNT(am.kingdom_id)::int AS members
        FROM alliances a
        LEFT JOIN alliance_members am ON am.alliance_id = a.id
        GROUP BY a.id
        ORDER BY members DESC, a.created_at DESC
        LIMIT 40
        `,
      );
      return res.json({
        ok: true,
        kingdom: {
          id: kr.id,
          name: kr.name,
          land: Number(kr.land || 0),
          gold: Number(kr.gold || 0),
          stone: Number(kr.stone || 0),
          wood: Number(kr.wood || 0),
        },
        member: null,
        alliance: null,
        alliances: alliances.rows,
      });
    }

    const m = membership.rows[0];
    const allianceId = Number(m.alliance_id);
    const members = await pool.query(
      `
      SELECT am.kingdom_id, am.role, am.joined_at, k.name AS kingdom_name, k.land
      FROM alliance_members am
      JOIN kingdoms k ON k.id = am.kingdom_id
      WHERE am.alliance_id=$1
      ORDER BY CASE am.role WHEN 'owner' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END, k.land DESC, k.name ASC
      `,
      [allianceId],
    );
    const relations = await pool.query(
      `
      SELECT id, relation_type, target_name, note
      FROM alliance_relations
      WHERE alliance_id=$1
      ORDER BY relation_type ASC, target_name ASC
      `,
      [allianceId],
    );
    const projects = await pool.query(
      `
      SELECT ab.building_code, bt.name, bt.effect_text, bt.target_gold, bt.target_stone, bt.target_wood,
             ab.level, ab.progress_gold, ab.progress_stone, ab.progress_wood
      FROM alliance_buildings ab
      JOIN alliance_building_types bt ON bt.code = ab.building_code
      WHERE ab.alliance_id=$1
      ORDER BY bt.name ASC
      `,
      [allianceId],
    );

    let hallLevel = 0;
    const normalizedProjects = projects.rows.map((p) => {
      const level = Number(p.level || 0);
      const targetGold = allianceProjectTarget(Number(p.target_gold || 0), level);
      const targetStone = allianceProjectTarget(Number(p.target_stone || 0), level);
      const targetWood = allianceProjectTarget(Number(p.target_wood || 0), level);
      if (String(p.building_code) === "alliance_hall") hallLevel = level;
      return {
        buildingCode: p.building_code,
        name: p.name,
        effectText: p.effect_text,
        level,
        targetGold,
        targetStone,
        targetWood,
        progressGold: Number(p.progress_gold || 0),
        progressStone: Number(p.progress_stone || 0),
        progressWood: Number(p.progress_wood || 0),
        remainingGold: Math.max(0, targetGold - Number(p.progress_gold || 0)),
        remainingStone: Math.max(0, targetStone - Number(p.progress_stone || 0)),
        remainingWood: Math.max(0, targetWood - Number(p.progress_wood || 0)),
      };
    });

    return res.json({
      ok: true,
      kingdom: {
        id: kr.id,
        name: kr.name,
        land: Number(kr.land || 0),
        gold: Number(kr.gold || 0),
        stone: Number(kr.stone || 0),
        wood: Number(kr.wood || 0),
      },
      member: {
        role: String(m.role || "member"),
      },
      alliance: {
        id: allianceId,
        slug: m.slug,
        name: m.name,
        description: m.description,
        imageUrl: m.image_url,
        createdByKingdomId: m.created_by_kingdom_id,
        createdAt: m.created_at,
        memberCap: allianceMemberCap(hallLevel),
      },
      members: members.rows.map((row) => ({
        kingdomId: Number(row.kingdom_id),
        kingdomName: row.kingdom_name,
        role: row.role,
        land: Number(row.land || 0),
        joinedAt: row.joined_at,
      })),
      relations: relations.rows,
      projects: normalizedProjects,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/create", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = allianceCreateBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);

      const inAlliance = await c.query(`SELECT alliance_id FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
      if (inAlliance.rowCount) throw new Error("kingdom already in an alliance");

      const slug = sanitizeAllianceSlug(parsed.data.slug);
      const name = String(parsed.data.name || "").trim();
      if (name.length < 2 || name.length > 64) throw new Error("name must be 2-64 chars");
      const description = String(parsed.data.description || "").trim().slice(0, 240);
      const imageUrl = String(parsed.data.imageUrl || "").trim().slice(0, 260);

      const ins = await c.query(
        `
        INSERT INTO alliances(slug, name, description, image_url, created_by_kingdom_id)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id, slug, name, description, image_url, created_at
        `,
        [slug, name, description, imageUrl, kingdomId],
      );
      const alliance = ins.rows[0];

      await c.query(
        `INSERT INTO alliance_members(alliance_id, kingdom_id, role) VALUES ($1,$2,'owner')`,
        [alliance.id, kingdomId],
      );
      await c.query(
        `
        INSERT INTO alliance_buildings(alliance_id, building_code, level, progress_gold, progress_stone, progress_wood)
        SELECT $1::bigint, code, 0, 0, 0, 0
        FROM alliance_building_types
        ON CONFLICT (alliance_id, building_code) DO NOTHING
        `,
        [alliance.id],
      );

      return alliance;
    });

    return res.json({ ok: true, alliance: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/join", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = allianceJoinBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);
      const allianceId = Number(parsed.data.allianceId);

      const existing = await c.query(`SELECT alliance_id FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
      if (existing.rowCount) throw new Error("kingdom already in an alliance");

      const a = await c.query(`SELECT id, name FROM alliances WHERE id=$1 LIMIT 1`, [allianceId]);
      if (!a.rowCount) throw new Error("alliance not found");

      const hall = await c.query(
        `SELECT level FROM alliance_buildings WHERE alliance_id=$1 AND building_code='alliance_hall' LIMIT 1`,
        [allianceId],
      );
      const memberCountQ = await c.query(`SELECT COUNT(*)::int AS n FROM alliance_members WHERE alliance_id=$1`, [allianceId]);
      const cap = allianceMemberCap(Number(hall.rows[0]?.level || 0));
      const memberCount = Number(memberCountQ.rows[0]?.n || 0);
      if (memberCount >= cap) throw new Error(`alliance member cap reached (${memberCount}/${cap})`);

      await c.query(`INSERT INTO alliance_members(alliance_id, kingdom_id, role) VALUES ($1,$2,'member')`, [allianceId, kingdomId]);
      return { allianceId, allianceName: a.rows[0].name, memberCount: memberCount + 1, memberCap: cap };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/leave", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);

      const m = await c.query(`SELECT alliance_id, role FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
      if (!m.rowCount) throw new Error("kingdom is not in an alliance");
      const allianceId = Number(m.rows[0].alliance_id);
      const role = String(m.rows[0].role || "member");
      let disbanded = false;

      if (role === "owner") {
        const others = await c.query(`SELECT kingdom_id FROM alliance_members WHERE alliance_id=$1 AND kingdom_id<>$2 ORDER BY joined_at ASC`, [allianceId, kingdomId]);
        if (others.rowCount) throw new Error("owner cannot leave while members remain (promote another leader first)");
        await c.query(`DELETE FROM alliances WHERE id=$1`, [allianceId]);
        disbanded = true;
      } else {
        await c.query(`DELETE FROM alliance_members WHERE alliance_id=$1 AND kingdom_id=$2`, [allianceId, kingdomId]);
      }
      return { allianceId, disbanded };
    });

    return res.json({ ok: true, ...out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/relation", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = allianceRelationBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kingdomId = Number(k.rows[0].id);

      const m = await c.query(`SELECT alliance_id, role FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kingdomId]);
      if (!m.rowCount) throw new Error("kingdom is not in an alliance");
      const allianceId = Number(m.rows[0].alliance_id);
      const role = String(m.rows[0].role || "member");
      if (role !== "owner" && role !== "officer") throw new Error("only owner/officers can update relations");

      const targetName = String(parsed.data.targetName || "").trim();
      if (!targetName) throw new Error("targetName required");
      const relationType = parsed.data.relationType;
      const note = String(parsed.data.note || "").trim().slice(0, 180);

      await c.query(
        `DELETE FROM alliance_relations WHERE alliance_id=$1 AND relation_type=$2 AND LOWER(target_name)=LOWER($3)`,
        [allianceId, relationType, targetName],
      );
      const ins = await c.query(
        `
        INSERT INTO alliance_relations(alliance_id, relation_type, target_name, note)
        VALUES ($1,$2,$3,$4)
        RETURNING id, relation_type, target_name, note
        `,
        [allianceId, relationType, targetName, note],
      );
      return ins.rows[0];
    });

    return res.json({ ok: true, relation: out });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/api/alliance/:kingdom/contribute", async (req, res) => {
  const kingdom = String(req.params.kingdom || "").trim();
  const parsed = allianceContribBody.safeParse(req.body || {});
  if (!kingdom) return res.status(400).json({ ok: false, error: "kingdom required" });
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });

  try {
    const out = await withTx(async (c) => {
      const k = await c.query(`SELECT id, gold, stone, wood FROM kingdoms WHERE LOWER(name)=LOWER($1) FOR UPDATE`, [kingdom]);
      if (!k.rowCount) throw new Error("kingdom not found");
      const kr = k.rows[0];

      const m = await c.query(`SELECT alliance_id FROM alliance_members WHERE kingdom_id=$1 LIMIT 1`, [kr.id]);
      if (!m.rowCount) throw new Error("kingdom is not in an alliance");
      const allianceId = Number(m.rows[0].alliance_id);
      const buildingCode = String(parsed.data.buildingCode || "").toLowerCase().trim();
      if (!buildingCode) throw new Error("buildingCode required");

      const reqGold = Math.max(0, Math.floor(Number(parsed.data.gold || 0)));
      const reqStone = Math.max(0, Math.floor(Number(parsed.data.stone || 0)));
      const reqWood = Math.max(0, Math.floor(Number(parsed.data.wood || 0)));
      if (reqGold <= 0 && reqStone <= 0 && reqWood <= 0) throw new Error("set at least one contribution amount > 0");

      const project = await c.query(
        `
        SELECT ab.level, ab.progress_gold, ab.progress_stone, ab.progress_wood, bt.target_gold, bt.target_stone, bt.target_wood
        FROM alliance_buildings ab
        JOIN alliance_building_types bt ON bt.code = ab.building_code
        WHERE ab.alliance_id=$1 AND ab.building_code=$2
        LIMIT 1
        FOR UPDATE
        `,
        [allianceId, buildingCode],
      );
      if (!project.rowCount) throw new Error("alliance project not found");
      const p = project.rows[0];

      const level = Number(p.level || 0);
      const targetGold = allianceProjectTarget(Number(p.target_gold || 0), level);
      const targetStone = allianceProjectTarget(Number(p.target_stone || 0), level);
      const targetWood = allianceProjectTarget(Number(p.target_wood || 0), level);

      const progressGold = Number(p.progress_gold || 0);
      const progressStone = Number(p.progress_stone || 0);
      const progressWood = Number(p.progress_wood || 0);

      const remGold = Math.max(0, targetGold - progressGold);
      const remStone = Math.max(0, targetStone - progressStone);
      const remWood = Math.max(0, targetWood - progressWood);

      const spendGold = Math.min(reqGold, remGold, Number(kr.gold || 0));
      const spendStone = Math.min(reqStone, remStone, Number(kr.stone || 0));
      const spendWood = Math.min(reqWood, remWood, Number(kr.wood || 0));
      if (spendGold <= 0 && spendStone <= 0 && spendWood <= 0) throw new Error("nothing to contribute (insufficient resources or project already complete)");

      await c.query(`UPDATE kingdoms SET gold=gold-$2, stone=stone-$3, wood=wood-$4 WHERE id=$1`, [kr.id, spendGold, spendStone, spendWood]);

      let nextLevel = level;
      let nextProgressGold = progressGold + spendGold;
      let nextProgressStone = progressStone + spendStone;
      let nextProgressWood = progressWood + spendWood;
      let leveledUp = false;

      if (nextProgressGold >= targetGold && nextProgressStone >= targetStone && nextProgressWood >= targetWood) {
        nextLevel = level + 1;
        nextProgressGold = 0;
        nextProgressStone = 0;
        nextProgressWood = 0;
        leveledUp = true;
      }

      await c.query(
        `
        UPDATE alliance_buildings
        SET level=$3, progress_gold=$4, progress_stone=$5, progress_wood=$6
        WHERE alliance_id=$1 AND building_code=$2
        `,
        [allianceId, buildingCode, nextLevel, nextProgressGold, nextProgressStone, nextProgressWood],
      );

      return {
        allianceId,
        buildingCode,
        contribution: { gold: spendGold, stone: spendStone, wood: spendWood },
        project: {
          level: nextLevel,
          progressGold: nextProgressGold,
          progressStone: nextProgressStone,
          progressWood: nextProgressWood,
          targetGold: leveledUp ? allianceProjectTarget(Number(p.target_gold || 0), nextLevel) : targetGold,
          targetStone: leveledUp ? allianceProjectTarget(Number(p.target_stone || 0), nextLevel) : targetStone,
          targetWood: leveledUp ? allianceProjectTarget(Number(p.target_wood || 0), nextLevel) : targetWood,
          leveledUp,
        },
      };
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
