import dotenv from "dotenv";
import { Pool, PoolClient } from "pg";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://gamegame:gamegame@localhost:5432/gamegame";

export const pool = new Pool({ connectionString: DATABASE_URL });

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

export async function ensureSchemaLite(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS build_queue (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL,
      building_code TEXT NOT NULL,
      target_level INT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completes_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      completed_at TIMESTAMPTZ,
      CHECK (status IN ('queued','completed','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS kingdom_buildings (
      kingdom_id BIGINT NOT NULL,
      building_code TEXT NOT NULL,
      level INT NOT NULL DEFAULT 0,
      PRIMARY KEY (kingdom_id, building_code)
    );

    CREATE TABLE IF NOT EXISTS kingdoms (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      gold BIGINT NOT NULL DEFAULT 50000,
      wood BIGINT NOT NULL DEFAULT 5000,
      stone BIGINT NOT NULL DEFAULT 5000,
      land BIGINT NOT NULL DEFAULT 1000,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_tick_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS build_queue_due_idx ON build_queue(status, completes_at);
  `);
}
