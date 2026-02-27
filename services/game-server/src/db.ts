import dotenv from "dotenv";
import { Pool, PoolClient } from "pg";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://gamegame:gamegame@localhost:5432/gamegame";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

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
    CREATE TABLE IF NOT EXISTS kingdoms (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      gold BIGINT NOT NULL DEFAULT 50000,
      wood BIGINT NOT NULL DEFAULT 5000,
      stone BIGINT NOT NULL DEFAULT 5000,
      food BIGINT NOT NULL DEFAULT 50000,
      land BIGINT NOT NULL DEFAULT 1000,
      horses BIGINT NOT NULL DEFAULT 0,
      tax_rate INT NOT NULL DEFAULT 25,
      shield_status TEXT NOT NULL DEFAULT 'none',
      shield_requested_at TIMESTAMPTZ,
      shield_starts_at TIMESTAMPTZ,
      shield_ends_at TIMESTAMPTZ,
      shield_cooldown_ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_tick_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS game_state (
      id INT PRIMARY KEY,
      season_index INT NOT NULL DEFAULT 0,
      season_code TEXT NOT NULL DEFAULT 'spring',
      season_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      season_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
      worker_last_tick_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

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

    CREATE TABLE IF NOT EXISTS train_queue (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL,
      troop_code TEXT NOT NULL,
      quantity INT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completes_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      completed_at TIMESTAMPTZ,
      CHECK (status IN ('queued','completed','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS kingdom_research (
      kingdom_id BIGINT NOT NULL,
      research_code TEXT NOT NULL,
      level INT NOT NULL DEFAULT 0,
      PRIMARY KEY (kingdom_id, research_code)
    );

    CREATE TABLE IF NOT EXISTS research_queue (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL,
      research_code TEXT NOT NULL,
      target_level INT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completes_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      completed_at TIMESTAMPTZ,
      CHECK (status IN ('queued','completed','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL,
      name TEXT NOT NULL,
      settlement_type TEXT NOT NULL,
      level INT NOT NULL DEFAULT 1,
      slots_total INT NOT NULL DEFAULT 3,
      wellbeing INT NOT NULL DEFAULT 0,
      wall_level INT NOT NULL DEFAULT 0,
      captured_from_kingdom_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS settlement_building_types (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      required_settlement_size INT NOT NULL DEFAULT 1,
      base_build_seconds INT NOT NULL DEFAULT 10800
    );

    CREATE TABLE IF NOT EXISTS settlement_buildings (
      settlement_id BIGINT NOT NULL,
      building_code TEXT NOT NULL,
      level INT NOT NULL DEFAULT 0,
      PRIMARY KEY (settlement_id, building_code)
    );

    CREATE TABLE IF NOT EXISTS settlement_build_queue (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL,
      settlement_id BIGINT NOT NULL,
      building_code TEXT NOT NULL,
      target_level INT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completes_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      completed_at TIMESTAMPTZ,
      CHECK (status IN ('queued','completed','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS settlement_history (
      id BIGSERIAL PRIMARY KEY,
      settlement_id BIGINT NOT NULL,
      item TEXT NOT NULL,
      datetime TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS troop_movements (
      id BIGSERIAL PRIMARY KEY,
      owner_kingdom_id BIGINT NOT NULL,
      owner_kingdom_name TEXT NOT NULL,
      target_kingdom_id BIGINT,
      target_kingdom_name TEXT,
      troop_code TEXT NOT NULL,
      quantity INT NOT NULL,
      departed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      returns_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'out',
      source_attack_report_id BIGINT,
      CHECK (status IN ('out','returned','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS kingdom_networth_history (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL,
      networth NUMERIC(18,2) NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS kingdom_buildings (
      kingdom_id BIGINT NOT NULL,
      building_code TEXT NOT NULL,
      level INT NOT NULL DEFAULT 0,
      PRIMARY KEY (kingdom_id, building_code)
    );

    CREATE TABLE IF NOT EXISTS kingdom_troops (
      kingdom_id BIGINT NOT NULL,
      troop_code TEXT NOT NULL,
      amount BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (kingdom_id, troop_code)
    );

    CREATE TABLE IF NOT EXISTS troop_types (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      horse_cost INT NOT NULL DEFAULT 0,
      upkeep_food INT NOT NULL DEFAULT 0,
      upkeep_gold INT NOT NULL DEFAULT 0,
      nw_value NUMERIC(8,2) NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS build_queue_due_idx ON build_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS build_queue_kingdom_due_idx ON build_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS train_queue_due_idx ON train_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS train_queue_kingdom_due_idx ON train_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS troop_movements_due_idx ON troop_movements(status, returns_at);
    CREATE INDEX IF NOT EXISTS troop_movements_owner_due_idx ON troop_movements(owner_kingdom_id, status, returns_at);
    CREATE INDEX IF NOT EXISTS kingdom_networth_history_kingdom_idx ON kingdom_networth_history(kingdom_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS research_queue_due_idx ON research_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS research_queue_kingdom_due_idx ON research_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS settlement_build_queue_due_idx ON settlement_build_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS settlement_build_queue_kingdom_due_idx ON settlement_build_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS settlement_history_settlement_idx ON settlement_history(settlement_id, datetime DESC);
  `);

  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS upkeep_food INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS upkeep_gold INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS horse_cost INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS nw_value NUMERIC(8,2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE settlement_building_types ADD COLUMN IF NOT EXISTS required_settlement_size INT NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE settlement_building_types ADD COLUMN IF NOT EXISTS base_build_seconds INT NOT NULL DEFAULT 10800`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS tax_rate INT NOT NULL DEFAULT 25`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_status TEXT NOT NULL DEFAULT 'none'`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_requested_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_starts_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_ends_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_cooldown_ends_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS horses BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS season_index INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS season_code TEXT NOT NULL DEFAULT 'spring'`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS season_started_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS season_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS worker_last_tick_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  await pool.query(
    `
    INSERT INTO game_state(id, season_index, season_code, season_started_at, season_ends_at, updated_at)
    VALUES (1, 0, 'spring', now(), now() + interval '7 days', now())
    ON CONFLICT (id) DO NOTHING
    `,
  );
}
