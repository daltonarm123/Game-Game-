import dotenv from "dotenv";
import { ensureSchemaLite, pool, withTx } from "./db.js";

dotenv.config();

const TICK_INTERVAL_SECONDS = Number(process.env.TICK_INTERVAL_SECONDS || 300);
const TICK_ALIGN_SECONDS = Number(process.env.TICK_ALIGN_SECONDS || 300);

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

function nextAlignedDelayMs(nowMs: number, alignSeconds: number): number {
  const step = Math.max(1, alignSeconds) * 1000;
  const next = Math.ceil(nowMs / step) * step;
  return Math.max(1, next - nowMs);
}

async function runTick() {
  try {
    const builds = await processBuildQueueTick();
    const trains = await processTrainQueueTick();
    const returns = await processTroopReturnsTick();
    if (builds > 0 || trains > 0 || returns > 0) {
      console.log(`[tick] ${new Date().toISOString()} completed builds=${builds}, trainings=${trains}, returns=${returns}`);
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
