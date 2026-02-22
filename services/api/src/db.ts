import dotenv from "dotenv";
import { Pool, PoolClient } from "pg";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://gamegame:gamegame@localhost:5432/gamegame";

export const pool = new Pool({ connectionString: DATABASE_URL });

const BUILDINGS = [
  { code: "archery_ranges", name: "Archery Ranges", landCost: 5, woodCost: 20, stoneCost: 5, baseBuildSeconds: 4 * 3600 },
  { code: "barns", name: "Barns", landCost: 2, woodCost: 15, stoneCost: 15, baseBuildSeconds: 2 * 3600 },
  { code: "barracks", name: "Barracks", landCost: 5, woodCost: 20, stoneCost: 20, baseBuildSeconds: 6 * 3600 },
  { code: "castles", name: "Castles", landCost: 40, woodCost: 800, stoneCost: 1500, baseBuildSeconds: 7 * 24 * 3600 },
  { code: "embassies", name: "Embassies", landCost: 2, woodCost: 50, stoneCost: 50, baseBuildSeconds: 4 * 3600 },
  { code: "farm", name: "Grain Farms", landCost: 10, woodCost: 20, stoneCost: 10, baseBuildSeconds: 5 * 3600 },
  { code: "guildhalls", name: "Guildhalls", landCost: 2, woodCost: 5, stoneCost: 5, baseBuildSeconds: 10 * 3600 },
  { code: "horse_farms", name: "Horse Farms", landCost: 10, woodCost: 20, stoneCost: 10, baseBuildSeconds: 5 * 3600 },
  { code: "houses", name: "Houses", landCost: 1, woodCost: 10, stoneCost: 10, baseBuildSeconds: 2 * 3600 },
  { code: "lumberyard", name: "Lumber Yards", landCost: 3, woodCost: 10, stoneCost: 5, baseBuildSeconds: 2 * 3600 },
  { code: "markets", name: "Markets", landCost: 3, woodCost: 25, stoneCost: 10, baseBuildSeconds: 2 * 3600 },
  { code: "quarry", name: "Stone Quarries", landCost: 3, woodCost: 10, stoneCost: 5, baseBuildSeconds: 2 * 3600 },
  { code: "stables", name: "Stables", landCost: 5, woodCost: 20, stoneCost: 20, baseBuildSeconds: 6 * 3600 },
  { code: "temples", name: "Temples", landCost: 2, woodCost: 5, stoneCost: 15, baseBuildSeconds: 10 * 3600 },
] as const;

const TROOPS = [
  { code: "footmen", name: "Footmen", goldCost: 30, foodCost: 20, trainSeconds: 45 },
  { code: "pikemen", name: "Pikemen", goldCost: 45, foodCost: 35, trainSeconds: 55 },
  { code: "archers", name: "Archers", goldCost: 50, foodCost: 40, trainSeconds: 60 },
  { code: "light_cavalry", name: "Light Cavalry", goldCost: 80, foodCost: 70, trainSeconds: 75 },
  { code: "heavy_cavalry", name: "Heavy Cavalry", goldCost: 120, foodCost: 100, trainSeconds: 90 },
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
      food BIGINT NOT NULL DEFAULT 50000,
      land BIGINT NOT NULL DEFAULT 1000,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_tick_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS building_types (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      land_cost INT NOT NULL DEFAULT 0,
      wood_cost INT NOT NULL,
      stone_cost INT NOT NULL,
      base_build_seconds INT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS troop_types (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gold_cost INT NOT NULL,
      food_cost INT NOT NULL,
      train_seconds INT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kingdom_buildings (
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      building_code TEXT NOT NULL REFERENCES building_types(code),
      level INT NOT NULL DEFAULT 0,
      PRIMARY KEY (kingdom_id, building_code)
    );

    CREATE TABLE IF NOT EXISTS kingdom_troops (
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      troop_code TEXT NOT NULL REFERENCES troop_types(code),
      amount BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (kingdom_id, troop_code)
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

    CREATE TABLE IF NOT EXISTS train_queue (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      troop_code TEXT NOT NULL REFERENCES troop_types(code),
      quantity INT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completes_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      completed_at TIMESTAMPTZ,
      CHECK (status IN ('queued','completed','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS attack_reports (
      id BIGSERIAL PRIMARY KEY,
      attacker_kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      defender_kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      attacker_name TEXT NOT NULL,
      defender_name TEXT NOT NULL,
      result TEXT NOT NULL,
      ratio NUMERIC(12,4) NOT NULL,
      land_taken BIGINT NOT NULL DEFAULT 0,
      attacker_power NUMERIC(18,2) NOT NULL,
      defender_power NUMERIC(18,2) NOT NULL,
      sent_troops JSONB NOT NULL DEFAULT '{}'::jsonb,
      attacker_losses JSONB NOT NULL DEFAULT '{}'::jsonb,
      defender_losses JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS troop_movements (
      id BIGSERIAL PRIMARY KEY,
      owner_kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      owner_kingdom_name TEXT NOT NULL,
      target_kingdom_id BIGINT REFERENCES kingdoms(id) ON DELETE SET NULL,
      target_kingdom_name TEXT,
      troop_code TEXT NOT NULL REFERENCES troop_types(code),
      quantity INT NOT NULL,
      departed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      returns_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'out',
      source_attack_report_id BIGINT REFERENCES attack_reports(id) ON DELETE SET NULL,
      CHECK (status IN ('out','returned','cancelled'))
    );

    CREATE INDEX IF NOT EXISTS build_queue_due_idx ON build_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS train_queue_due_idx ON train_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS attack_reports_defender_idx ON attack_reports(defender_kingdom_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS attack_reports_attacker_idx ON attack_reports(attacker_kingdom_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS troop_movements_due_idx ON troop_movements(status, returns_at);
    CREATE INDEX IF NOT EXISTS troop_movements_owner_idx ON troop_movements(owner_kingdom_id, status, returns_at DESC);
  `);

  await pool.query(`
    ALTER TABLE building_types
    ADD COLUMN IF NOT EXISTS land_cost INT NOT NULL DEFAULT 0
  `);

  for (const b of BUILDINGS) {
    await pool.query(
      `
      INSERT INTO building_types (code, name, land_cost, wood_cost, stone_cost, base_build_seconds)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          land_cost = EXCLUDED.land_cost,
          wood_cost = EXCLUDED.wood_cost,
          stone_cost = EXCLUDED.stone_cost,
          base_build_seconds = EXCLUDED.base_build_seconds;
      `,
      [b.code, b.name, b.landCost, b.woodCost, b.stoneCost, b.baseBuildSeconds],
    );
  }

  for (const t of TROOPS) {
    await pool.query(
      `
      INSERT INTO troop_types (code, name, gold_cost, food_cost, train_seconds)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          gold_cost = EXCLUDED.gold_cost,
          food_cost = EXCLUDED.food_cost,
          train_seconds = EXCLUDED.train_seconds;
      `,
      [t.code, t.name, t.goldCost, t.foodCost, t.trainSeconds],
    );
  }
}
