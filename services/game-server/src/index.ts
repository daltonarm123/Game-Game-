import dotenv from "dotenv";
import { ensureSchemaLite, pool, withTx } from "./db.js";

dotenv.config();

const TICK_INTERVAL_SECONDS = Number(process.env.TICK_INTERVAL_SECONDS || 60);

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

    if (!due.rowCount) {
      return 0;
    }

    for (const row of due.rows) {
      await c.query(
        `
        UPDATE kingdom_buildings
        SET level = GREATEST(level, $3)
        WHERE kingdom_id = $1 AND building_code = $2
        `,
        [row.kingdom_id, row.building_code, row.target_level],
      );

      await c.query(
        `
        UPDATE build_queue
        SET status = 'completed', completed_at = now()
        WHERE id = $1
        `,
        [row.id],
      );

      await c.query(`UPDATE kingdoms SET last_tick_at = now() WHERE id = $1`, [row.kingdom_id]);
    }

    return due.rowCount;
  });
}

async function main() {
  await ensureSchemaLite();
  console.log(`Game server worker started. Tick interval: ${TICK_INTERVAL_SECONDS}s`);

  const run = async () => {
    try {
      const completed = await processBuildQueueTick();
      if (completed > 0) {
        console.log(`[tick] ${new Date().toISOString()} completed builds: ${completed}`);
      }
    } catch (e) {
      console.error("[tick] error", e);
    }
  };

  await run();
  setInterval(run, Math.max(5, TICK_INTERVAL_SECONDS) * 1000);

  process.on("SIGINT", async () => {
    await pool.end();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("Worker bootstrap failed", e);
  process.exit(1);
});
