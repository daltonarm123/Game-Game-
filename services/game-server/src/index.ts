import dotenv from "dotenv";
import { ensureSchemaLite, pool, withTx } from "./db.js";

dotenv.config();

const LOCAL_DEMO_FAST = String(process.env.LOCAL_DEMO_FAST || "").trim() === "1";
const TICK_INTERVAL_SECONDS = Number(process.env.TICK_INTERVAL_SECONDS || (LOCAL_DEMO_FAST ? 5 : 300));
const TICK_ALIGN_SECONDS = Number(process.env.TICK_ALIGN_SECONDS || (LOCAL_DEMO_FAST ? 5 : 300));
const TICK_HOURS = Math.max(1, TICK_INTERVAL_SECONDS) / 3600;
const SEASON_LENGTH_SECONDS = Math.max(30, Number(process.env.SEASON_LENGTH_SECONDS || (LOCAL_DEMO_FAST ? 60 : 7 * 24 * 3600)));
const TAX_MIN = 0;
const TAX_MAX = 40;

const ECON_BUILDING_HOURLY = {
  farmFood: 120,
  lumberWood: 80,
  quarryStone: 80,
  horseFarmHorses: 60,
  baseGoldPerLand: 3,
  baseFoodPerLand: 2,
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function peasantDeltaPerHour(taxRate: number) {
  if (taxRate < 25) return (25 - taxRate) * 50;
  if (taxRate > 27) return -1 * (taxRate - 27) * 60;
  return 0;
}

function taxGoldMultiplier(taxRate: number) {
  return clamp(1 + (taxRate - 25) * 0.04, 0.2, 2.2);
}

type SeasonCode = "spring" | "summer" | "autumn" | "winter";
type SeasonState = {
  index: number;
  code: SeasonCode;
  startedAt: Date;
  endsAt: Date;
  remainingSeconds: number;
  modifiers: {
    food: number;
    gold: number;
    wood: number;
    stone: number;
  };
};

const SEASONS: Array<{
  code: SeasonCode;
  name: string;
  modifiers: { food: number; gold: number; wood: number; stone: number };
}> = [
  { code: "spring", name: "Spring", modifiers: { food: 1.25, gold: 1.0, wood: 1.0, stone: 1.0 } },
  { code: "summer", name: "Summer", modifiers: { food: 1.1, gold: 1.05, wood: 1.05, stone: 1.0 } },
  { code: "autumn", name: "Autumn", modifiers: { food: 1.2, gold: 1.0, wood: 1.1, stone: 1.0 } },
  { code: "winter", name: "Winter", modifiers: { food: 0.85, gold: 0.95, wood: 0.95, stone: 1.05 } },
];

function seasonByIndex(index: number) {
  return SEASONS[((index % SEASONS.length) + SEASONS.length) % SEASONS.length];
}

function toSeasonState(row: any, now = new Date()): SeasonState {
  const index = Math.max(0, Number(row.season_index || 0));
  const season = seasonByIndex(index);
  const startedAt = new Date(row.season_started_at);
  const endsAt = new Date(row.season_ends_at);
  const remainingSeconds = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000));
  return {
    index,
    code: season.code,
    startedAt,
    endsAt,
    remainingSeconds,
    modifiers: { ...season.modifiers },
  };
}

async function processSeasonTick(): Promise<SeasonState> {
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
    let index = Math.max(0, Number(row.season_index || 0));
    let startedAt = new Date(row.season_started_at);
    let endsAt = new Date(row.season_ends_at);
    const now = new Date();
    let changed = false;

    while (endsAt.getTime() <= now.getTime()) {
      index += 1;
      startedAt = endsAt;
      endsAt = new Date(startedAt.getTime() + SEASON_LENGTH_SECONDS * 1000);
      changed = true;
    }

    if (changed) {
      const season = seasonByIndex(index);
      await c.query(
        `
        UPDATE game_state
        SET season_index=$2, season_code=$3, season_started_at=$4, season_ends_at=$5, updated_at=now()
        WHERE id=$1
        `,
        [1, index, season.code, startedAt.toISOString(), endsAt.toISOString()],
      );
    } else {
      await c.query(`UPDATE game_state SET updated_at=now() WHERE id=1`);
    }

    return toSeasonState({ season_index: index, season_started_at: startedAt, season_ends_at: endsAt }, now);
  });
}

async function processBuildQueueTick(): Promise<number> {
  return withTx(async (c) => {
    const due = await c.query(
      `
      SELECT id, kingdom_id, building_code, target_level
      FROM build_queue
      WHERE status = 'queued'
        AND completes_at <= now()
      ORDER BY completes_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 200
      `,
    );

    if (!due.rowCount) return 0;

    for (const row of due.rows) {
      await c.query(
        `UPDATE kingdom_buildings
         SET level = GREATEST(level, $3)
         WHERE kingdom_id = $1 AND building_code = $2`,
        [row.kingdom_id, row.building_code, row.target_level],
      );

      await c.query(`UPDATE build_queue SET status = 'completed', completed_at = now() WHERE id = $1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at = now() WHERE id = $1`, [row.kingdom_id]);
    }

    return due.rowCount;
  });
}

async function processTrainQueueTick(): Promise<number> {
  return withTx(async (c) => {
    const due = await c.query(
      `
      SELECT id, kingdom_id, troop_code, quantity
      FROM train_queue
      WHERE status = 'queued'
        AND completes_at <= now()
      ORDER BY completes_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 200
      `,
    );

    if (!due.rowCount) return 0;

    for (const row of due.rows) {
      await c.query(
        `UPDATE kingdom_troops
         SET amount = amount + $3
         WHERE kingdom_id = $1 AND troop_code = $2`,
        [row.kingdom_id, row.troop_code, row.quantity],
      );

      await c.query(`UPDATE train_queue SET status = 'completed', completed_at = now() WHERE id = $1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at = now() WHERE id = $1`, [row.kingdom_id]);
    }

    return due.rowCount;
  });
}

async function processTroopReturnsTick(): Promise<number> {
  return withTx(async (c) => {
    const due = await c.query(
      `
      SELECT id, owner_kingdom_id, troop_code, quantity
      FROM troop_movements
      WHERE status = 'out'
        AND returns_at <= now()
      ORDER BY returns_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 500
      `,
    );

    if (!due.rowCount) return 0;

    for (const row of due.rows) {
      await c.query(
        `UPDATE kingdom_troops
         SET amount = amount + $3
         WHERE kingdom_id = $1 AND troop_code = $2`,
        [row.owner_kingdom_id, row.troop_code, row.quantity],
      );

      await c.query(`UPDATE troop_movements SET status='returned' WHERE id = $1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at = now() WHERE id = $1`, [row.owner_kingdom_id]);
    }

    return due.rowCount;
  });
}

async function processResearchQueueTick(): Promise<number> {
  return withTx(async (c) => {
    const due = await c.query(
      `
      SELECT id, kingdom_id, research_code, target_level
      FROM research_queue
      WHERE status = 'queued'
        AND completes_at <= now()
      ORDER BY completes_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 200
      `,
    );

    if (!due.rowCount) return 0;

    for (const row of due.rows) {
      await c.query(
        `
        INSERT INTO kingdom_research(kingdom_id, research_code, level)
        VALUES ($1,$2,$3)
        ON CONFLICT (kingdom_id, research_code) DO UPDATE
        SET level = GREATEST(kingdom_research.level, EXCLUDED.level)
        `,
        [row.kingdom_id, row.research_code, row.target_level],
      );
      await c.query(`UPDATE research_queue SET status='completed', completed_at=now() WHERE id=$1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at = now() WHERE id = $1`, [row.kingdom_id]);
    }

    return due.rowCount;
  });
}

async function processSettlementBuildQueueTick(): Promise<number> {
  return withTx(async (c) => {
    const due = await c.query(
      `
      SELECT id, kingdom_id, settlement_id, building_code, target_level
      FROM settlement_build_queue
      WHERE status='queued'
        AND completes_at <= now()
      ORDER BY completes_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 200
      `,
    );
    if (!due.rowCount) return 0;

    for (const row of due.rows) {
      const prevQ = await c.query(`SELECT level FROM settlement_buildings WHERE settlement_id=$1 AND building_code=$2 LIMIT 1`, [
        row.settlement_id,
        row.building_code,
      ]);
      const prevLevel = Number(prevQ.rows[0]?.level || 0);
      await c.query(
        `
        INSERT INTO settlement_buildings(settlement_id, building_code, level)
        VALUES ($1,$2,$3)
        ON CONFLICT (settlement_id, building_code) DO UPDATE
        SET level = GREATEST(settlement_buildings.level, EXCLUDED.level)
        `,
        [row.settlement_id, row.building_code, row.target_level],
      );
      const action = prevLevel > 0 ? "upgrading" : "building";
      await c.query(
        `INSERT INTO settlement_history(settlement_id, item, datetime) VALUES ($1,$2,now())`,
        [row.settlement_id, `Finished ${action} ${String(row.building_code).replaceAll("_", " ")} to level ${row.target_level}`],
      );
      await c.query(`UPDATE settlement_build_queue SET status='completed', completed_at=now() WHERE id=$1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at=now() WHERE id=$1`, [row.kingdom_id]);
    }
    return due.rowCount;
  });
}

async function processShieldStateTick(): Promise<number> {
  return withTx(async (c) => {
    const pendingToActive = await c.query(
      `
      UPDATE kingdoms
      SET shield_status='active', last_tick_at=now()
      WHERE shield_status='pending'
        AND shield_starts_at IS NOT NULL
        AND shield_starts_at <= now()
      `,
    );
    const activeToCooldown = await c.query(
      `
      UPDATE kingdoms
      SET shield_status='cooldown', last_tick_at=now()
      WHERE shield_status='active'
        AND shield_ends_at IS NOT NULL
        AND shield_ends_at <= now()
      `,
    );
    const cooldownToNone = await c.query(
      `
      UPDATE kingdoms
      SET shield_status='none',
          shield_requested_at=NULL,
          shield_starts_at=NULL,
          shield_ends_at=NULL,
          shield_cooldown_ends_at=NULL,
          last_tick_at=now()
      WHERE shield_status='cooldown'
        AND shield_cooldown_ends_at IS NOT NULL
        AND shield_cooldown_ends_at <= now()
      `,
    );
    return Number(pendingToActive.rowCount || 0) + Number(activeToCooldown.rowCount || 0) + Number(cooldownToNone.rowCount || 0);
  });
}

async function processEconomyTick(season: SeasonState): Promise<number> {
  return withTx(async (c) => {
    const kingdoms = await c.query(`SELECT id, land, gold, food, wood, stone, tax_rate FROM kingdoms ORDER BY id ASC`);
    if (!kingdoms.rowCount) return 0;

    let updated = 0;
    for (const k of kingdoms.rows) {
      const b = await c.query(
        `
        SELECT
          COALESCE(MAX(CASE WHEN building_code='farm' THEN level END),0) AS farm,
          COALESCE(MAX(CASE WHEN building_code='lumberyard' THEN level END),0) AS lumberyard,
          COALESCE(MAX(CASE WHEN building_code='quarry' THEN level END),0) AS quarry,
          COALESCE(MAX(CASE WHEN building_code='horse_farms' THEN level END),0) AS horse_farms
        FROM kingdom_buildings
        WHERE kingdom_id = $1
        `,
        [k.id],
      );
      const t = await c.query(
        `
        WITH home AS (
          SELECT troop_code, COALESCE(SUM(amount),0) AS qty
          FROM kingdom_troops
          WHERE kingdom_id = $1
          GROUP BY troop_code
        ),
        train AS (
          SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
          FROM train_queue
          WHERE kingdom_id = $1 AND status='queued'
          GROUP BY troop_code
        ),
        away AS (
          SELECT troop_code, COALESCE(SUM(quantity),0) AS qty
          FROM troop_movements
          WHERE owner_kingdom_id = $1 AND status='out' AND returns_at > now()
          GROUP BY troop_code
        ),
        totals AS (
          SELECT
            COALESCE(h.troop_code, t.troop_code, a.troop_code) AS troop_code,
            COALESCE(h.qty,0) + COALESCE(t.qty,0) + COALESCE(a.qty,0) AS amount
          FROM home h
          FULL OUTER JOIN train t ON t.troop_code = h.troop_code
          FULL OUTER JOIN away a ON a.troop_code = COALESCE(h.troop_code, t.troop_code)
        )
        SELECT totals.troop_code, totals.amount, tt.upkeep_food, tt.upkeep_gold, tt.nw_value
        FROM totals
        JOIN troop_types tt ON tt.code = totals.troop_code
        `,
        [k.id],
      );

      const farm = Number(b.rows[0]?.farm || 0);
      const lumber = Number(b.rows[0]?.lumberyard || 0);
      const quarry = Number(b.rows[0]?.quarry || 0);
      const horseFarms = Number(b.rows[0]?.horse_farms || 0);

      const foodIncomePerHour = Number(k.land || 0) * ECON_BUILDING_HOURLY.baseFoodPerLand + farm * ECON_BUILDING_HOURLY.farmFood;
      const goldIncomePerHour = Number(k.land || 0) * ECON_BUILDING_HOURLY.baseGoldPerLand;
      const woodIncomePerHour = lumber * ECON_BUILDING_HOURLY.lumberWood;
      const stoneIncomePerHour = quarry * ECON_BUILDING_HOURLY.quarryStone;
      const horseIncomePerHour = horseFarms * ECON_BUILDING_HOURLY.horseFarmHorses;

      let foodUpkeepPerHour = 0;
      let goldUpkeepPerHour = 0;
      let troopNetworth = 0;
      for (const row of t.rows) {
        const amount = Number(row.amount || 0);
        foodUpkeepPerHour += amount * Number(row.upkeep_food || 0);
        goldUpkeepPerHour += amount * Number(row.upkeep_gold || 0);
        troopNetworth += amount * Number(row.nw_value || 0);
      }

      const seasonFoodIncome = foodIncomePerHour * Number(season.modifiers.food || 1);
      const taxRate = clamp(Math.floor(Number(k.tax_rate || 25)), TAX_MIN, TAX_MAX);
      const seasonGoldIncome = goldIncomePerHour * Number(season.modifiers.gold || 1) * taxGoldMultiplier(taxRate);
      const seasonWoodIncome = woodIncomePerHour * Number(season.modifiers.wood || 1);
      const seasonStoneIncome = stoneIncomePerHour * Number(season.modifiers.stone || 1);

      const foodDelta = Math.floor((seasonFoodIncome - foodUpkeepPerHour) * TICK_HOURS);
      const goldDelta = Math.floor((seasonGoldIncome - goldUpkeepPerHour) * TICK_HOURS);
      const woodDelta = Math.floor(seasonWoodIncome * TICK_HOURS);
      const stoneDelta = Math.floor(seasonStoneIncome * TICK_HOURS);
      const horsesDelta = Math.floor(horseIncomePerHour * TICK_HOURS);
      const newFood = Math.max(0, Number(k.food || 0) + foodDelta);
      const newGold = Math.max(0, Number(k.gold || 0) + goldDelta);
      const newWood = Math.max(0, Number(k.wood || 0) + woodDelta);
      const newStone = Math.max(0, Number(k.stone || 0) + stoneDelta);

      await c.query(
        `
        UPDATE kingdoms
        SET
          food = GREATEST(0, food + $2),
          gold = GREATEST(0, gold + $3),
          wood = GREATEST(0, wood + $4),
          stone = GREATEST(0, stone + $5),
          horses = GREATEST(0, horses + $6),
          last_tick_at = now()
        WHERE id = $1
        `,
        [k.id, foodDelta, goldDelta, woodDelta, stoneDelta, horsesDelta],
      );

      const peasPerHour = peasantDeltaPerHour(taxRate);
      const peasDelta = Math.floor(peasPerHour * TICK_HOURS);
      if (peasDelta !== 0) {
        await c.query(
          `
          INSERT INTO kingdom_troops(kingdom_id, troop_code, amount)
          VALUES ($1,'peasants',$2)
          ON CONFLICT (kingdom_id, troop_code) DO UPDATE
          SET amount = GREATEST(0, kingdom_troops.amount + $2)
          `,
          [k.id, peasDelta],
        );
      }

      const networth = Number(k.land || 0) * 0.04 + newFood * 0.0001 + newGold * 0.0005 + newStone * 0.0002 + newWood * 0.0002 + troopNetworth;
      await c.query(
        `INSERT INTO kingdom_networth_history(kingdom_id, networth, recorded_at) VALUES ($1,$2,now())`,
        [k.id, Number(networth.toFixed(2))],
      );
      updated += 1;
    }

    return updated;
  });
}

function nextAlignedDelayMs(nowMs: number, alignSeconds: number): number {
  const step = Math.max(1, alignSeconds) * 1000;
  const next = Math.ceil(nowMs / step) * step;
  return Math.max(1, next - nowMs);
}

async function runTick() {
  try {
    const season = await processSeasonTick();
    const builds = await processBuildQueueTick();
    const trains = await processTrainQueueTick();
    const research = await processResearchQueueTick();
    const settlementBuilds = await processSettlementBuildQueueTick();
    const shieldTransitions = await processShieldStateTick();
    const returns = await processTroopReturnsTick();
    const economies = await processEconomyTick(season);
    if (builds > 0 || trains > 0 || research > 0 || settlementBuilds > 0 || shieldTransitions > 0 || returns > 0 || economies > 0) {
      console.log(
        `[tick] ${new Date().toISOString()} season=${season.code}(${season.remainingSeconds}s) completed builds=${builds}, trainings=${trains}, research=${research}, settlement_builds=${settlementBuilds}, shields=${shieldTransitions}, returns=${returns}, economy=${economies}`,
      );
    }
  } catch (e) {
    console.error("[tick] error", e);
  }
}

async function main() {
  await ensureSchemaLite();
  console.log(
    `Game server worker started. Tick interval=${TICK_INTERVAL_SECONDS}s align=${TICK_ALIGN_SECONDS}s`,
  );

  const schedule = async () => {
    await runTick();
    const delay = nextAlignedDelayMs(Date.now(), TICK_ALIGN_SECONDS);
    setTimeout(schedule, delay);
  };

  const firstDelay = nextAlignedDelayMs(Date.now(), TICK_ALIGN_SECONDS);
  setTimeout(schedule, firstDelay);

  process.on("SIGINT", async () => {
    await pool.end();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("Worker bootstrap failed", e);
  process.exit(1);
});
