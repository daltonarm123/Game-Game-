import dotenv from "dotenv";
import { Pool, PoolClient } from "pg";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://gamegame:gamegame@localhost:5432/gamegame";

export const pool = new Pool({ connectionString: DATABASE_URL });

const BUILDINGS = [
  { code: "farm", name: "Grain Farm", woodCost: 120, stoneCost: 80, baseBuildSeconds: 90 },
  { code: "lumberyard", name: "Lumber Yard", woodCost: 140, stoneCost: 90, baseBuildSeconds: 100 },
  { code: "quarry", name: "Stone Quarry", woodCost: 100, stoneCost: 140, baseBuildSeconds: 110 },
  { code: "barracks", name: "Barracks", woodCost: 220, stoneCost: 220, baseBuildSeconds: 150 },
  { code: "stables", name: "Stables", woodCost: 260, stoneCost: 180, baseBuildSeconds: 160 },
] as const;

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS kingdoms (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL UNIQUE,
      gold BIGINT NOT NULL DEFAULT 50000,
      wood BIGINT NOT NULL DEFAULT 5000,
      stone BIGINT NOT NULL DEFAULT 5000,
      land BIGINT NOT NULL DEFAULT 1000,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_tick_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS building_types (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      wood_cost INT NOT NULL,
      stone_cost INT NOT NULL,
      base_build_seconds INT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kingdom_buildings (
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      building_code TEXT NOT NULL REFERENCES building_types(code),
      level INT NOT NULL DEFAULT 0,
      PRIMARY KEY (kingdom_id, building_code)
    );

    CREATE TABLE IF NOT EXISTS build_queue (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      building_code TEXT NOT NULL REFERENCES building_types(code),
      target_level INT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completes_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      completed_at TIMESTAMPTZ,
      CHECK (status IN ('queued','completed','cancelled'))
    );

    CREATE INDEX IF NOT EXISTS build_queue_due_idx ON build_queue(status, completes_at);
  `);

  for (const b of BUILDINGS) {
    await pool.query(
      `
      INSERT INTO building_types (code, name, wood_cost, stone_cost, base_build_seconds)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          wood_cost = EXCLUDED.wood_cost,
          stone_cost = EXCLUDED.stone_cost,
          base_build_seconds = EXCLUDED.base_build_seconds;
      `,
      [b.code, b.name, b.woodCost, b.stoneCost, b.baseBuildSeconds],
    );
  }
}
