import dotenv from "dotenv";
import { ensureSchemaLite, pool, withTx } from "./db.js";

dotenv.config();

const LOCAL_DEMO_FAST = String(process.env.LOCAL_DEMO_FAST || "").trim() === "1";
const TICK_INTERVAL_SECONDS = Number(process.env.TICK_INTERVAL_SECONDS || (LOCAL_DEMO_FAST ? 5 : 300));
const TICK_ALIGN_SECONDS = Number(process.env.TICK_ALIGN_SECONDS || (LOCAL_DEMO_FAST ? 5 : 300));
const TICK_HOURS = Math.max(1, TICK_INTERVAL_SECONDS) / 3600;

const ECON_BUILDING_HOURLY = {
  farmFood: 120,
  lumberWood: 80,
  quarryStone: 80,
  baseGoldPerLand: 3,
  baseFoodPerLand: 2,
};

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
      await c.query(
        `
        INSERT INTO settlement_buildings(settlement_id, building_code, level)
        VALUES ($1,$2,$3)
        ON CONFLICT (settlement_id, building_code) DO UPDATE
        SET level = GREATEST(settlement_buildings.level, EXCLUDED.level)
        `,
        [row.settlement_id, row.building_code, row.target_level],
      );
      await c.query(`UPDATE settlement_build_queue SET status='completed', completed_at=now() WHERE id=$1`, [row.id]);
      await c.query(`UPDATE kingdoms SET last_tick_at=now() WHERE id=$1`, [row.kingdom_id]);
    }
    return due.rowCount;
  });
}

async function processEconomyTick(): Promise<number> {
  return withTx(async (c) => {
    const kingdoms = await c.query(`SELECT id, land, gold, food, wood, stone FROM kingdoms ORDER BY id ASC`);
    if (!kingdoms.rowCount) return 0;

    let updated = 0;
    for (const k of kingdoms.rows) {
      const b = await c.query(
        `
        SELECT
          COALESCE(MAX(CASE WHEN building_code='farm' THEN level END),0) AS farm,
          COALESCE(MAX(CASE WHEN building_code='lumberyard' THEN level END),0) AS lumberyard,
          COALESCE(MAX(CASE WHEN building_code='quarry' THEN level END),0) AS quarry
        FROM kingdom_buildings
        WHERE kingdom_id = $1
        `,
        [k.id],
      );
      const t = await c.query(
        `
        SELECT kt.troop_code, kt.amount, tt.upkeep_food, tt.upkeep_gold
        FROM kingdom_troops kt
        JOIN troop_types tt ON tt.code = kt.troop_code
        WHERE kingdom_id = $1
        `,
        [k.id],
      );

      const farm = Number(b.rows[0]?.farm || 0);
      const lumber = Number(b.rows[0]?.lumberyard || 0);
      const quarry = Number(b.rows[0]?.quarry || 0);

      const foodIncomePerHour = Number(k.land || 0) * ECON_BUILDING_HOURLY.baseFoodPerLand + farm * ECON_BUILDING_HOURLY.farmFood;
      const goldIncomePerHour = Number(k.land || 0) * ECON_BUILDING_HOURLY.baseGoldPerLand;
      const woodIncomePerHour = lumber * ECON_BUILDING_HOURLY.lumberWood;
      const stoneIncomePerHour = quarry * ECON_BUILDING_HOURLY.quarryStone;

      let foodUpkeepPerHour = 0;
      let goldUpkeepPerHour = 0;
      for (const row of t.rows) {
        const amount = Number(row.amount || 0);
        foodUpkeepPerHour += amount * Number(row.upkeep_food || 0);
        goldUpkeepPerHour += amount * Number(row.upkeep_gold || 0);
      }

      const foodDelta = Math.floor((foodIncomePerHour - foodUpkeepPerHour) * TICK_HOURS);
      const goldDelta = Math.floor((goldIncomePerHour - goldUpkeepPerHour) * TICK_HOURS);
      const woodDelta = Math.floor(woodIncomePerHour * TICK_HOURS);
      const stoneDelta = Math.floor(stoneIncomePerHour * TICK_HOURS);

      await c.query(
        `
        UPDATE kingdoms
        SET
          food = GREATEST(0, food + $2),
          gold = GREATEST(0, gold + $3),
          wood = GREATEST(0, wood + $4),
          stone = GREATEST(0, stone + $5),
          last_tick_at = now()
        WHERE id = $1
        `,
        [k.id, foodDelta, goldDelta, woodDelta, stoneDelta],
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
    const builds = await processBuildQueueTick();
    const trains = await processTrainQueueTick();
    const research = await processResearchQueueTick();
    const settlementBuilds = await processSettlementBuildQueueTick();
    const returns = await processTroopReturnsTick();
    const economies = await processEconomyTick();
    if (builds > 0 || trains > 0 || research > 0 || settlementBuilds > 0 || returns > 0 || economies > 0) {
      console.log(
        `[tick] ${new Date().toISOString()} completed builds=${builds}, trainings=${trains}, research=${research}, settlement_builds=${settlementBuilds}, returns=${returns}, economy=${economies}`,
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
