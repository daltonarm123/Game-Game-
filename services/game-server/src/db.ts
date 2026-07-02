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
      desertion_alert_active BOOLEAN NOT NULL DEFAULT FALSE,
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

    CREATE TABLE IF NOT EXISTS boat_types (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'economy',
      shipyard_level INT NOT NULL DEFAULT 1,
      travel_seconds INT NOT NULL DEFAULT 1800,
      fishing_food_per_hour INT NOT NULL DEFAULT 0,
      cargo_capacity INT NOT NULL DEFAULT 0,
      port_attack INT NOT NULL DEFAULT 0,
      port_defense INT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS kingdom_boats (
      kingdom_id BIGINT NOT NULL,
      boat_code TEXT NOT NULL,
      amount BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (kingdom_id, boat_code)
    );

    CREATE TABLE IF NOT EXISTS boat_queue (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL,
      boat_code TEXT NOT NULL,
      quantity INT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completes_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      completed_at TIMESTAMPTZ,
      CHECK (status IN ('queued','completed','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS kingdom_colonies (
      id BIGSERIAL PRIMARY KEY,
      owner_kingdom_id BIGINT NOT NULL,
      colony_name TEXT NOT NULL,
      world_code TEXT NOT NULL,
      gold BIGINT NOT NULL DEFAULT 0,
      wood BIGINT NOT NULL DEFAULT 0,
      stone BIGINT NOT NULL DEFAULT 0,
      food BIGINT NOT NULL DEFAULT 0,
      horses BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (owner_kingdom_id, colony_name),
      UNIQUE (owner_kingdom_id, world_code)
    );

    CREATE TABLE IF NOT EXISTS kingdom_shipments (
      id BIGSERIAL PRIMARY KEY,
      owner_kingdom_id BIGINT NOT NULL,
      colony_id BIGINT NOT NULL,
      direction TEXT NOT NULL,
      ship_code TEXT NOT NULL,
      ship_quantity INT NOT NULL DEFAULT 1,
      gold BIGINT NOT NULL DEFAULT 0,
      wood BIGINT NOT NULL DEFAULT 0,
      stone BIGINT NOT NULL DEFAULT 0,
      food BIGINT NOT NULL DEFAULT 0,
      horses BIGINT NOT NULL DEFAULT 0,
      departed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      arrives_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'transit',
      completed_at TIMESTAMPTZ,
      CHECK (direction IN ('main_to_colony','colony_to_main')),
      CHECK (status IN ('transit','delivered','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS sea_channels (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      required_navy_power INT NOT NULL DEFAULT 500,
      base_traffic INT NOT NULL DEFAULT 5,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS kingdom_channel_control (
      channel_code TEXT PRIMARY KEY,
      kingdom_id BIGINT,
      toll_percent INT NOT NULL DEFAULT 8,
      is_closed BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'neutral',
      captured_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS pirate_raid_reports (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL,
      kingdom_name TEXT NOT NULL,
      result TEXT NOT NULL,
      pirate_power NUMERIC(18,2) NOT NULL,
      defense_power NUMERIC(18,2) NOT NULL,
      ships_lost INT NOT NULL DEFAULT 0,
      loot JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS naval_barter_offers (
      id BIGSERIAL PRIMARY KEY,
      owner_kingdom_id BIGINT NOT NULL,
      ship_code TEXT NOT NULL,
      give_resource TEXT NOT NULL,
      give_amount BIGINT NOT NULL,
      want_resource TEXT NOT NULL,
      want_amount BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      accepted_by_kingdom_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      accepted_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 days')
    );

    CREATE TABLE IF NOT EXISTS kingdom_status_effects (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL,
      effect_code TEXT NOT NULL,
      source_kind TEXT NOT NULL DEFAULT 'system',
      source_ref BIGINT,
      magnitude NUMERIC(12,4) NOT NULL DEFAULT 0,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ends_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

    CREATE TABLE IF NOT EXISTS explore_missions (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL,
      soldiers_sent INT NOT NULL,
      land_gained INT NOT NULL DEFAULT 0,
      departed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      returns_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'out'
    );

    CREATE INDEX IF NOT EXISTS explore_missions_due_idx ON explore_missions(status, returns_at);
    CREATE INDEX IF NOT EXISTS explore_missions_kingdom_idx ON explore_missions(kingdom_id, status);
    CREATE INDEX IF NOT EXISTS build_queue_due_idx ON build_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS build_queue_kingdom_due_idx ON build_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS train_queue_due_idx ON train_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS train_queue_kingdom_due_idx ON train_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS boat_queue_due_idx ON boat_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS boat_queue_kingdom_due_idx ON boat_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS kingdom_shipments_due_idx ON kingdom_shipments(status, arrives_at);
    CREATE INDEX IF NOT EXISTS kingdom_shipments_owner_due_idx ON kingdom_shipments(owner_kingdom_id, status, arrives_at);
    CREATE INDEX IF NOT EXISTS kingdom_channel_control_kingdom_due_idx ON kingdom_channel_control(kingdom_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS pirate_raid_reports_kingdom_idx ON pirate_raid_reports(kingdom_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS naval_barter_offers_open_due_idx ON naval_barter_offers(status, expires_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS kingdom_status_effects_kingdom_due_idx ON kingdom_status_effects(kingdom_id, effect_code, ends_at DESC);
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
  // Migrate settlement_buildings to allow multiple buildings of same type per settlement
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='settlement_buildings' AND column_name='id'
      ) THEN
        ALTER TABLE settlement_buildings ADD COLUMN id BIGSERIAL;
        ALTER TABLE settlement_buildings DROP CONSTRAINT IF EXISTS settlement_buildings_pkey;
        ALTER TABLE settlement_buildings ADD PRIMARY KEY (id);
        DELETE FROM settlement_buildings WHERE level = 0;
      END IF;
    END $$
  `);
  await pool.query(`ALTER TABLE settlement_build_queue ADD COLUMN IF NOT EXISTS settlement_building_id BIGINT`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS tax_rate INT NOT NULL DEFAULT 25`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_status TEXT NOT NULL DEFAULT 'none'`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_requested_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_starts_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_ends_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_cooldown_ends_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS desertion_alert_active BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS horses BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS sea_world_code TEXT NOT NULL DEFAULT 'main_sea'`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS pirate_last_raid_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'economy'`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS shipyard_level INT NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS wood_cost INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS stone_cost INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS gold_cost INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS horses_cost INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS build_seconds INT NOT NULL DEFAULT 3600`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS travel_seconds INT NOT NULL DEFAULT 1800`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS fishing_food_per_hour INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS cargo_capacity INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS port_attack INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS port_defense INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boat_types ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`);
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
