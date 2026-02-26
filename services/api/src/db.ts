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
  { code: "peasants", name: "Peasants", trainGoldCost: 0, trainFoodCost: 0, trainSeconds: 0, upkeepFood: 2, upkeepGold: 0, att: 0.1, def: 0.1, nw: 0.0, housing: "Infantry, Barracks", notes: "", isTrainable: false },
  { code: "footmen", name: "Footmen", trainGoldCost: 30, trainFoodCost: 20, horseCost: 0, trainSeconds: 45, upkeepFood: 10, upkeepGold: 4, att: 1, def: 1, nw: 0.38, housing: "Infantry, Barracks", notes: "", isTrainable: true },
  { code: "pikemen", name: "Pikemen", trainGoldCost: 45, trainFoodCost: 35, horseCost: 0, trainSeconds: 55, upkeepFood: 25, upkeepGold: 6, att: 2, def: 2, nw: 0.5, housing: "Infantry, Barracks", notes: "", isTrainable: true },
  { code: "elites", name: "Elites", trainGoldCost: 0, trainFoodCost: 0, trainSeconds: 0, upkeepFood: 25, upkeepGold: 13, att: 10, def: 10, nw: 0.8, housing: "Infantry, Barracks", notes: "Only gained in battle.", isTrainable: false },
  { code: "archers", name: "Archers", trainGoldCost: 50, trainFoodCost: 40, horseCost: 0, trainSeconds: 60, upkeepFood: 38, upkeepGold: 6, att: 1, def: 4, nw: 0.5, housing: "Archers, Archery Ranges", notes: "", isTrainable: true },
  { code: "crossbowmen", name: "Crossbowmen", trainGoldCost: 70, trainFoodCost: 50, horseCost: 0, trainSeconds: 70, upkeepFood: 30, upkeepGold: 4, att: 3, def: 2, nw: 0.38, housing: "Archers, Archery Ranges", notes: "", isTrainable: false },
  { code: "light_cavalry", name: "Light Cavalry", trainGoldCost: 80, trainFoodCost: 70, horseCost: 1, trainSeconds: 75, upkeepFood: 50, upkeepGold: 8, att: 5, def: 4, nw: 0.5, housing: "Cavalry, Stables", notes: "", isTrainable: true },
  { code: "heavy_cavalry", name: "Heavy Cavalry", trainGoldCost: 120, trainFoodCost: 100, horseCost: 2, trainSeconds: 90, upkeepFood: 70, upkeepGold: 14, att: 7, def: 5, nw: 0.63, housing: "Cavalry, Stables", notes: "", isTrainable: true },
  { code: "knights", name: "Knights", trainGoldCost: 450, trainFoodCost: 260, horseCost: 3, trainSeconds: 160, upkeepFood: 90, upkeepGold: 50, att: 15, def: 10, nw: 1.63, housing: "Cavalry, Castles", notes: "Requires Castles to train.", isTrainable: true },
  { code: "diplomats", name: "Diplomats", trainGoldCost: 0, trainFoodCost: 0, trainSeconds: 0, upkeepFood: 15, upkeepGold: 15, att: 0.1, def: 0.1, nw: 0.88, housing: "N/A, Embassies", notes: "", isTrainable: false },
  { code: "priests", name: "Priests", trainGoldCost: 400, trainFoodCost: 150, trainSeconds: 3600, upkeepFood: 30, upkeepGold: 20, att: 0.1, def: 0.1, nw: 0.5, housing: "Faith, Temples", notes: "Max 5 per Temple. Each priest generates 4 mana/hr.", isTrainable: true },
  { code: "spies", name: "Spies", trainGoldCost: 300, trainFoodCost: 100, trainSeconds: 2400, upkeepFood: 18, upkeepGold: 10, att: 0.1, def: 0.1, nw: 0.38, housing: "N/A, Guildhalls", notes: "Requires Guildhall to train.", isTrainable: true },
] as const;

const RESEARCH_SKILLS = [
  { code: "animal_breeding", name: "Animal Breeding", category: "Agriculture", effectText: "Enables the Breeding of Animal Types", effectPerLevel: 1, baseGold: 375000, baseSeconds: 9 * 24 * 3600, maxLevel: 10 },
  { code: "animal_husbandry", name: "Animal Husbandry", category: "Agriculture", effectText: "Increased Animal Reproduction Rate", effectPerLevel: 0.5, baseGold: 80000, baseSeconds: 2 * 24 * 3600, maxLevel: 10 },
  { code: "better_farming_methods", name: "Better Farming Methods", category: "Agriculture", effectText: "Increased Grain Production", effectPerLevel: 0.5, baseGold: 130000, baseSeconds: 3 * 24 * 3600, maxLevel: 10 },
  { code: "crop_rotation", name: "Crop Rotation", category: "Agriculture", effectText: "Increased Grain Production", effectPerLevel: 0.5, baseGold: 140000, baseSeconds: 2 * 24 * 3600, maxLevel: 10 },
  { code: "horse_breeding", name: "Horse Breeding", category: "Agriculture", effectText: "Increased Cavalry Attack Stats", effectPerLevel: 0.5, baseGold: 58000, baseSeconds: 38 * 3600, maxLevel: 10 },
  { code: "irrigation", name: "Irrigation", category: "Agriculture", effectText: "Increased Grain Production", effectPerLevel: 0.5, baseGold: 120000, baseSeconds: 3 * 24 * 3600, maxLevel: 10 },
  { code: "manure", name: "Manure", category: "Agriculture", effectText: "Increased Grain Production", effectPerLevel: 0.5, baseGold: 82000, baseSeconds: 36 * 3600, maxLevel: 10 },
  { code: "war_horse", name: "War Horse", category: "Agriculture", effectText: "Increased Cavalry Attack Stats", effectPerLevel: 0.5, baseGold: 105000, baseSeconds: 50 * 3600, maxLevel: 10 },
  { code: "winter_crops", name: "Winter Crops", category: "Agriculture", effectText: "Increased Crop Production During Winter", effectPerLevel: 2, baseGold: 200000, baseSeconds: 4 * 24 * 3600, maxLevel: 10 },

  { code: "advanced_building_maintenance", name: "Advanced Building Maintenance", category: "Construction", effectText: "Decreased Maintenance Costs", effectPerLevel: -1, baseGold: 150000, baseSeconds: 48 * 3600, maxLevel: 10 },
  { code: "better_barns", name: "Better Barns", category: "Construction", effectText: "Increased Food Storage", effectPerLevel: 0.25, baseGold: 152303, baseSeconds: 42 * 3600, maxLevel: 10 },
  { code: "better_building_maintenance", name: "Better Building Maintenance", category: "Construction", effectText: "Decreased Maintenance Costs", effectPerLevel: -1, baseGold: 200000, baseSeconds: 72 * 3600, maxLevel: 10 },
  { code: "better_construction_methods", name: "Better Construction Methods", category: "Construction", effectText: "Decreased Building Construction Time", effectPerLevel: -0.5, baseGold: 64000, baseSeconds: 36 * 3600, maxLevel: 10 },
  { code: "engineering", name: "Engineering", category: "Construction", effectText: "Decreased Building Construction Time", effectPerLevel: -0.25, baseGold: 100000, baseSeconds: 3 * 24 * 3600, maxLevel: 10 },
  { code: "improved_metal_working", name: "Improved Metal Working", category: "Construction", effectText: "Accesses Other Improvements", effectPerLevel: 1, baseGold: 102885, baseSeconds: 82 * 3600, maxLevel: 10 },
  { code: "improved_tools", name: "Improved Tools", category: "Construction", effectText: "Decreased Building Construction Time", effectPerLevel: -0.25, baseGold: 109200, baseSeconds: 82 * 3600, maxLevel: 10 },
  { code: "improved_defences", name: "Improved Defences", category: "Construction", effectText: "Increased Castle Defence Rate", effectPerLevel: 1, baseGold: 24000, baseSeconds: 22 * 3600, maxLevel: 10 },
  { code: "improved_castles_motte_bailey", name: "Improved Castles (Motte and Bailey)", category: "Construction", effectText: "Increased Castle Defence Rate", effectPerLevel: 1, baseGold: 32000, baseSeconds: 33 * 3600, maxLevel: 10 },
  { code: "city_walls", name: "City Walls", category: "Construction", effectText: "Increased Defence Rating of Troops", effectPerLevel: 0.25, baseGold: 31000, baseSeconds: 48 * 3600, maxLevel: 10 },
  { code: "palisades", name: "Palisades", category: "Construction", effectText: "Increased Defence Rating of Troops", effectPerLevel: 0.25, baseGold: 22000, baseSeconds: 24 * 3600, maxLevel: 10 },
  { code: "improved_market_wagons", name: "Improved Market Wagons", category: "Construction", effectText: "Increased Market Wagon Speed", effectPerLevel: -1, baseGold: 54743, baseSeconds: 60 * 3600, maxLevel: 10 },
  { code: "roads", name: "Roads", category: "Construction", effectText: "Decreased Troop Return Time", effectPerLevel: -0.5, baseGold: 48000, baseSeconds: 29 * 3600, maxLevel: 10 },
  { code: "larger_archery_ranges", name: "Larger Archery Ranges", category: "Construction", effectText: "Increased Space Inside Archery Ranges", effectPerLevel: 1, baseGold: 160000, baseSeconds: 4 * 24 * 3600, maxLevel: 10 },
  { code: "larger_barracks", name: "Larger Barracks", category: "Construction", effectText: "Increased Space in Barracks", effectPerLevel: 1, baseGold: 140000, baseSeconds: 3 * 24 * 3600, maxLevel: 10 },
  { code: "larger_stables", name: "Larger Stables", category: "Construction", effectText: "Increased Space in Stables", effectPerLevel: 1, baseGold: 40000, baseSeconds: 22 * 3600, maxLevel: 10 },
  { code: "spy_glass", name: "Spy Glass", category: "Construction", effectText: "Increased Spy Effectiveness", effectPerLevel: 1, baseGold: 136000, baseSeconds: 50 * 3600, maxLevel: 10 },

  { code: "mathematics", name: "Mathematics", category: "Economics", effectText: "Increased Tax Revenue", effectPerLevel: 0.5, baseGold: 939343, baseSeconds: 5 * 24 * 3600, maxLevel: 10 },
  { code: "accounting", name: "Accounting", category: "Economics", effectText: "Increased Tax Revenue", effectPerLevel: 1, baseGold: 419904, baseSeconds: 4 * 24 * 3600, maxLevel: 10 },

  { code: "monastery", name: "Monastery", category: "Religion", effectText: "Increased Mana Generation Rate", effectPerLevel: 1, baseGold: 250000, baseSeconds: 3 * 24 * 3600, maxLevel: 10 },
  { code: "herbalism", name: "Herbalism", category: "Religion", effectText: "Decreased Casualty Rates", effectPerLevel: 0.5, baseGold: 180000, baseSeconds: 3 * 24 * 3600, maxLevel: 10 },
  { code: "medicine", name: "Medicine", category: "Religion", effectText: "Decreased Casualty Rates", effectPerLevel: 0.5, baseGold: 261950, baseSeconds: 3 * 24 * 3600, maxLevel: 10 },
  { code: "supplication", name: "Supplication", category: "Religion", effectText: "Decreased Mana Cost", effectPerLevel: -1, baseGold: 89000, baseSeconds: 28 * 3600, maxLevel: 10 },
  { code: "clergy", name: "Clergy", category: "Religion", effectText: "Increased Mana Generation Rate", effectPerLevel: 1, baseGold: 125000, baseSeconds: 36 * 3600, maxLevel: 10 },
  { code: "good_medical_practice", name: "Good Medical Practice", category: "Religion", effectText: "Decreased Casualty Rates", effectPerLevel: 0.5, baseGold: 200000, baseSeconds: 54 * 3600, maxLevel: 10 },
  { code: "hospitals", name: "Hospitals", category: "Religion", effectText: "Decreased Casualty Rates", effectPerLevel: 0.5, baseGold: 220000, baseSeconds: 68 * 3600, maxLevel: 10 },
  { code: "basilica", name: "Basilica", category: "Religion", effectText: "Decreased Mana Cost and Increased Mana Generation", effectPerLevel: 1, baseGold: 140000, baseSeconds: 36 * 3600, maxLevel: 10 },

  { code: "better_training_methods", name: "Better Training Methods", category: "Warfare", effectText: "Increased Attack / Defence Ratings", effectPerLevel: 0.25, baseGold: 170000, baseSeconds: 4 * 24 * 3600, maxLevel: 10 },
  { code: "tactics", name: "Tactics", category: "Warfare", effectText: "Increased Attack Rating of Troops", effectPerLevel: 0.25, baseGold: 200000, baseSeconds: 4 * 24 * 3600, maxLevel: 10 },
  { code: "leadership_training", name: "Leadership Training", category: "Warfare", effectText: "Increased Defence Rating of Troops", effectPerLevel: 0.25, baseGold: 180000, baseSeconds: 4 * 24 * 3600, maxLevel: 10 },
  { code: "phalanx", name: "Phalanx", category: "Warfare", effectText: "Increased Defence Rating of Infantry", effectPerLevel: 1, baseGold: 220000, baseSeconds: 5 * 24 * 3600, maxLevel: 10 },
  { code: "sharpshooter", name: "Sharpshooter", category: "Warfare", effectText: "Increased Archers Rating", effectPerLevel: 1, baseGold: 220000, baseSeconds: 4 * 24 * 3600, maxLevel: 10 },
  { code: "lance_formation", name: "Lance Formation", category: "Warfare", effectText: "Increased Cavalry Defence Stats", effectPerLevel: 1, baseGold: 65000, baseSeconds: 20 * 3600, maxLevel: 10 },
  { code: "loose_order_formation", name: "Loose Order Formation", category: "Warfare", effectText: "Increased Defence Rating of Troops", effectPerLevel: 1, baseGold: 190000, baseSeconds: 4 * 24 * 3600, maxLevel: 10 },
] as const;

const RESEARCH_PREREQS = [
  { code: "animal_breeding", prereqCode: "animal_husbandry", requiredLevel: 3 },
  { code: "crop_rotation", prereqCode: "better_farming_methods", requiredLevel: 6 },
  { code: "horse_breeding", prereqCode: "animal_breeding", requiredLevel: 3 },
  { code: "manure", prereqCode: "better_farming_methods", requiredLevel: 7 },
  { code: "war_horse", prereqCode: "animal_husbandry", requiredLevel: 5 },
  { code: "war_horse", prereqCode: "horse_breeding", requiredLevel: 5 },
  { code: "winter_crops", prereqCode: "crop_rotation", requiredLevel: 5 },

  { code: "engineering", prereqCode: "improved_metal_working", requiredLevel: 2 },
  { code: "improved_tools", prereqCode: "improved_metal_working", requiredLevel: 3 },
  { code: "improved_defences", prereqCode: "better_training_methods", requiredLevel: 5 },
  { code: "improved_castles_motte_bailey", prereqCode: "improved_defences", requiredLevel: 5 },
  { code: "city_walls", prereqCode: "improved_defences", requiredLevel: 1 },
  { code: "city_walls", prereqCode: "palisades", requiredLevel: 1 },
  { code: "advanced_building_maintenance", prereqCode: "engineering", requiredLevel: 4 },
  { code: "advanced_building_maintenance", prereqCode: "better_building_maintenance", requiredLevel: 4 },
  { code: "improved_market_wagons", prereqCode: "improved_metal_working", requiredLevel: 2 },
  { code: "roads", prereqCode: "improved_tools", requiredLevel: 1 },
  { code: "roads", prereqCode: "better_construction_methods", requiredLevel: 1 },
  { code: "larger_archery_ranges", prereqCode: "better_training_methods", requiredLevel: 4 },
  { code: "larger_barracks", prereqCode: "better_training_methods", requiredLevel: 2 },
  { code: "larger_stables", prereqCode: "better_training_methods", requiredLevel: 5 },
  { code: "spy_glass", prereqCode: "engineering", requiredLevel: 4 },
  { code: "spy_glass", prereqCode: "mathematics", requiredLevel: 2 },

  { code: "accounting", prereqCode: "mathematics", requiredLevel: 5 },

  { code: "herbalism", prereqCode: "monastery", requiredLevel: 5 },
  { code: "medicine", prereqCode: "herbalism", requiredLevel: 5 },
  { code: "supplication", prereqCode: "monastery", requiredLevel: 5 },
  { code: "clergy", prereqCode: "monastery", requiredLevel: 5 },
  { code: "good_medical_practice", prereqCode: "medicine", requiredLevel: 2 },
  { code: "hospitals", prereqCode: "good_medical_practice", requiredLevel: 1 },
  { code: "basilica", prereqCode: "clergy", requiredLevel: 1 },
  { code: "basilica", prereqCode: "supplication", requiredLevel: 1 },

  { code: "tactics", prereqCode: "mathematics", requiredLevel: 3 },
  { code: "tactics", prereqCode: "leadership_training", requiredLevel: 2 },
  { code: "leadership_training", prereqCode: "better_training_methods", requiredLevel: 1 },
  { code: "phalanx", prereqCode: "tactics", requiredLevel: 4 },
  { code: "phalanx", prereqCode: "better_training_methods", requiredLevel: 5 },
  { code: "sharpshooter", prereqCode: "better_training_methods", requiredLevel: 5 },
  { code: "lance_formation", prereqCode: "tactics", requiredLevel: 5 },
  { code: "lance_formation", prereqCode: "better_training_methods", requiredLevel: 5 },
  { code: "loose_order_formation", prereqCode: "tactics", requiredLevel: 3 },
  { code: "loose_order_formation", prereqCode: "better_training_methods", requiredLevel: 3 },
] as const;

const SETTLEMENT_BUILDING_TYPES = [
  { code: "housing", name: "Housing", effectText: "Increased Population for houses/cities", baseGold: 50000, baseStone: 250, baseWood: 250, maxLevel: 12, cityOnly: false, requiredSettlementSize: 1, baseBuildSeconds: 3 * 3600 },
  { code: "church", name: "Church", effectText: "Prayer effect bonus", baseGold: 75000, baseStone: 1250, baseWood: 250, maxLevel: 12, cityOnly: false, requiredSettlementSize: 1, baseBuildSeconds: 3 * 3600 },
  { code: "cathedral", name: "Cathedral", effectText: "Prayer effect + reduced mana/gem costs", baseGold: 50000, baseStone: 12500, baseWood: 2500, maxLevel: 12, cityOnly: true, requiredSettlementSize: 4, baseBuildSeconds: 4 * 3600 },
  { code: "barracks", name: "Barracks", effectText: "Extra soldier capacity", baseGold: 10000, baseStone: 300, baseWood: 100, maxLevel: 12, cityOnly: false, requiredSettlementSize: 1, baseBuildSeconds: 2 * 3600 },
  { code: "barn", name: "Barn", effectText: "Food storage bonus", baseGold: 5000, baseStone: 100, baseWood: 300, maxLevel: 12, cityOnly: false, requiredSettlementSize: 1, baseBuildSeconds: 2 * 3600 },
  { code: "granary", name: "Granary", effectText: "Food generation bonus", baseGold: 5000, baseStone: 100, baseWood: 300, maxLevel: 12, cityOnly: false, requiredSettlementSize: 1, baseBuildSeconds: 2 * 3600 },
  { code: "stables", name: "Stables", effectText: "Stable population bonus", baseGold: 10000, baseStone: 500, baseWood: 500, maxLevel: 12, cityOnly: false, requiredSettlementSize: 2, baseBuildSeconds: 3 * 3600 },
  { code: "market", name: "Market", effectText: "Wagon speed bonus", baseGold: 100000, baseStone: 250, baseWood: 250, maxLevel: 12, cityOnly: false, requiredSettlementSize: 2, baseBuildSeconds: 3 * 3600 },
  { code: "tavern", name: "Tavern", effectText: "Settlement wellbeing boost", baseGold: 50000, baseStone: 500, baseWood: 500, maxLevel: 12, cityOnly: false, requiredSettlementSize: 2, baseBuildSeconds: 3 * 3600 },
  { code: "inn", name: "Inn", effectText: "City wellbeing + kingdom gold bonus", baseGold: 500000, baseStone: 1000, baseWood: 1000, maxLevel: 12, cityOnly: true, requiredSettlementSize: 4, baseBuildSeconds: 4 * 3600 },
  { code: "mason", name: "Mason", effectText: "Reduced stone maintenance", baseGold: 50000, baseStone: 250, baseWood: 250, maxLevel: 12, cityOnly: false, requiredSettlementSize: 1, baseBuildSeconds: 3 * 3600 },
  { code: "carpenter", name: "Carpenter", effectText: "Reduced wood maintenance", baseGold: 50000, baseStone: 250, baseWood: 250, maxLevel: 12, cityOnly: false, requiredSettlementSize: 1, baseBuildSeconds: 3 * 3600 },
  { code: "brewery", name: "Brewery", effectText: "Kingdom wellbeing bonus", baseGold: 100000, baseStone: 500, baseWood: 500, maxLevel: 12, cityOnly: false, requiredSettlementSize: 2, baseBuildSeconds: 3 * 3600 },
  { code: "town_walls", name: "Town/City Walls", effectText: "Reduced chance to lose settlement", baseGold: 25000, baseStone: 1000, baseWood: 300, maxLevel: 12, cityOnly: false, requiredSettlementSize: 1, baseBuildSeconds: 2 * 3600 },
] as const;

const ALLIANCE_BUILDING_TYPES = [
  { code: "alliance_hall", name: "Alliance Hall", effectText: "Increases member cap by 1 per level (max 15)", goldCost: 20000000, stoneCost: 1250000, woodCost: 1250000 },
  { code: "grand_library", name: "Grand Library", effectText: "Reduces research time by 3% per level", goldCost: 2000000, stoneCost: 1000000, woodCost: 1000000 },
  { code: "cathedral", name: "Cathedral", effectText: "Reduces prayer mana costs by 3% per level", goldCost: 16000000, stoneCost: 1100000, woodCost: 900000 },
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
      email TEXT,
      referral_code TEXT UNIQUE,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
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
      horse_cost INT NOT NULL DEFAULT 0,
      train_seconds INT NOT NULL,
      upkeep_food INT NOT NULL DEFAULT 0,
      upkeep_gold INT NOT NULL DEFAULT 0,
      att_rating NUMERIC(8,2) NOT NULL DEFAULT 0,
      def_rating NUMERIC(8,2) NOT NULL DEFAULT 0,
      nw_value NUMERIC(8,2) NOT NULL DEFAULT 0,
      housing TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      is_trainable BOOLEAN NOT NULL DEFAULT TRUE
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

    CREATE TABLE IF NOT EXISTS research_types (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      effect_text TEXT NOT NULL DEFAULT '',
      effect_per_level NUMERIC(10,4) NOT NULL DEFAULT 0,
      base_gold BIGINT NOT NULL DEFAULT 0,
      base_seconds INT NOT NULL DEFAULT 3600,
      max_level INT NOT NULL DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS research_prereqs (
      research_code TEXT NOT NULL REFERENCES research_types(code) ON DELETE CASCADE,
      prereq_code TEXT NOT NULL REFERENCES research_types(code) ON DELETE CASCADE,
      required_level INT NOT NULL DEFAULT 1,
      PRIMARY KEY (research_code, prereq_code)
    );

    CREATE TABLE IF NOT EXISTS kingdom_research (
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      research_code TEXT NOT NULL REFERENCES research_types(code) ON DELETE CASCADE,
      level INT NOT NULL DEFAULT 0,
      PRIMARY KEY (kingdom_id, research_code)
    );

    CREATE TABLE IF NOT EXISTS research_queue (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      research_code TEXT NOT NULL REFERENCES research_types(code) ON DELETE CASCADE,
      target_level INT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completes_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      completed_at TIMESTAMPTZ,
      CHECK (status IN ('queued','completed','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      settlement_type TEXT NOT NULL,
      level INT NOT NULL DEFAULT 1,
      slots_total INT NOT NULL DEFAULT 3,
      wellbeing INT NOT NULL DEFAULT 0,
      wall_level INT NOT NULL DEFAULT 0,
      captured_from_kingdom_id BIGINT REFERENCES kingdoms(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS settlement_building_types (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      effect_text TEXT NOT NULL DEFAULT '',
      base_gold BIGINT NOT NULL DEFAULT 0,
      base_stone BIGINT NOT NULL DEFAULT 0,
      base_wood BIGINT NOT NULL DEFAULT 0,
      required_settlement_size INT NOT NULL DEFAULT 1,
      base_build_seconds INT NOT NULL DEFAULT 10800,
      max_level INT NOT NULL DEFAULT 10,
      city_only BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS settlement_buildings (
      settlement_id BIGINT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      building_code TEXT NOT NULL REFERENCES settlement_building_types(code) ON DELETE CASCADE,
      level INT NOT NULL DEFAULT 0,
      PRIMARY KEY (settlement_id, building_code)
    );

    CREATE TABLE IF NOT EXISTS settlement_build_queue (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      settlement_id BIGINT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      building_code TEXT NOT NULL REFERENCES settlement_building_types(code) ON DELETE CASCADE,
      target_level INT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completes_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      completed_at TIMESTAMPTZ,
      CHECK (status IN ('queued','completed','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS settlement_capture_log (
      id BIGSERIAL PRIMARY KEY,
      attacker_kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      defender_kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      settlement_id BIGINT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS settlement_garrison (
      settlement_id BIGINT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      troop_code TEXT NOT NULL REFERENCES troop_types(code) ON DELETE CASCADE,
      amount BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (settlement_id, troop_code)
    );

    CREATE TABLE IF NOT EXISTS settlement_history (
      id BIGSERIAL PRIMARY KEY,
      settlement_id BIGINT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
      item TEXT NOT NULL,
      datetime TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS alliances (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      created_by_kingdom_id BIGINT REFERENCES kingdoms(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS alliance_members (
      alliance_id BIGINT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (alliance_id, kingdom_id)
    );

    CREATE TABLE IF NOT EXISTS alliance_relations (
      id BIGSERIAL PRIMARY KEY,
      alliance_id BIGINT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL,
      target_name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS alliance_building_types (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      effect_text TEXT NOT NULL DEFAULT '',
      target_gold BIGINT NOT NULL DEFAULT 0,
      target_stone BIGINT NOT NULL DEFAULT 0,
      target_wood BIGINT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS alliance_buildings (
      alliance_id BIGINT NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
      building_code TEXT NOT NULL REFERENCES alliance_building_types(code) ON DELETE CASCADE,
      level INT NOT NULL DEFAULT 0,
      progress_gold BIGINT NOT NULL DEFAULT 0,
      progress_stone BIGINT NOT NULL DEFAULT 0,
      progress_wood BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (alliance_id, building_code)
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

    CREATE TABLE IF NOT EXISTS kingdom_networth_history (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      networth NUMERIC(18,2) NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS kingdom_mail (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      mail_kind TEXT NOT NULL DEFAULT 'system',
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS kingdom_notifications (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      notice_type TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      seen_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS build_queue_due_idx ON build_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS build_queue_kingdom_due_idx ON build_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS train_queue_due_idx ON train_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS train_queue_kingdom_due_idx ON train_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS attack_reports_defender_idx ON attack_reports(defender_kingdom_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS attack_reports_attacker_idx ON attack_reports(attacker_kingdom_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS troop_movements_due_idx ON troop_movements(status, returns_at);
    CREATE INDEX IF NOT EXISTS troop_movements_owner_idx ON troop_movements(owner_kingdom_id, status, returns_at DESC);
    CREATE INDEX IF NOT EXISTS troop_movements_owner_due_idx ON troop_movements(owner_kingdom_id, status, returns_at);
    CREATE INDEX IF NOT EXISTS kingdom_networth_history_kingdom_idx ON kingdom_networth_history(kingdom_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS kingdom_mail_kingdom_idx ON kingdom_mail(kingdom_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS kingdom_mail_unread_idx ON kingdom_mail(kingdom_id, read_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS kingdom_notifications_kingdom_idx ON kingdom_notifications(kingdom_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS market_listings (
      id BIGSERIAL PRIMARY KEY,
      seller_kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      seller_kingdom_name TEXT NOT NULL,
      resource TEXT NOT NULL CHECK (resource IN ('food','wood','stone','horses')),
      quantity BIGINT NOT NULL CHECK (quantity > 0),
      quantity_remaining BIGINT NOT NULL CHECK (quantity_remaining >= 0),
      price_per_unit INT NOT NULL CHECK (price_per_unit > 0),
      listed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','sold'))
    );

    CREATE TABLE IF NOT EXISTS market_trades (
      id BIGSERIAL PRIMARY KEY,
      listing_id BIGINT NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
      buyer_kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      buyer_kingdom_name TEXT NOT NULL,
      seller_kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      seller_kingdom_name TEXT NOT NULL,
      resource TEXT NOT NULL,
      quantity BIGINT NOT NULL,
      price_per_unit INT NOT NULL,
      total_gold BIGINT NOT NULL,
      seller_receives BIGINT NOT NULL,
      traded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS market_listings_active_idx ON market_listings(status, resource, price_per_unit ASC) WHERE status='active';
    CREATE INDEX IF NOT EXISTS market_listings_seller_idx ON market_listings(seller_kingdom_id, status);
    CREATE INDEX IF NOT EXISTS market_trades_buyer_idx ON market_trades(buyer_kingdom_id, traded_at DESC);
    CREATE INDEX IF NOT EXISTS market_trades_seller_idx ON market_trades(seller_kingdom_id, traded_at DESC);
    CREATE INDEX IF NOT EXISTS market_trades_listing_idx ON market_trades(listing_id, traded_at DESC);

    CREATE TABLE IF NOT EXISTS kingdom_prayers (
      id BIGSERIAL PRIMARY KEY,
      kingdom_id BIGINT NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
      prayer_code TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ends_at TIMESTAMPTZ NOT NULL,
      mana_spent BIGINT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS kingdom_prayers_kingdom_idx ON kingdom_prayers(kingdom_id, ends_at DESC);
    CREATE INDEX IF NOT EXISTS kingdom_prayers_active_idx ON kingdom_prayers(kingdom_id, ends_at);

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
      used_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
      used_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS kingdom_notifications_unseen_idx ON kingdom_notifications(kingdom_id, seen_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS research_queue_due_idx ON research_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS research_queue_kingdom_due_idx ON research_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS settlements_kingdom_idx ON settlements(kingdom_id);
    CREATE INDEX IF NOT EXISTS settlement_build_queue_due_idx ON settlement_build_queue(status, completes_at);
    CREATE INDEX IF NOT EXISTS settlement_build_queue_kingdom_due_idx ON settlement_build_queue(kingdom_id, status, completes_at);
    CREATE INDEX IF NOT EXISTS settlement_capture_log_def_idx ON settlement_capture_log(defender_kingdom_id, captured_at DESC);
    CREATE INDEX IF NOT EXISTS settlement_history_settlement_idx ON settlement_history(settlement_id, datetime DESC);
    CREATE INDEX IF NOT EXISTS alliance_members_kingdom_idx ON alliance_members(kingdom_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions(expires_at);
  `);

  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referral_code TEXT`);
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_uq ON app_users((LOWER(email))) WHERE email IS NOT NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS app_users_referral_code_uq ON app_users(referral_code) WHERE referral_code IS NOT NULL`);

  await pool.query(`
    ALTER TABLE building_types
    ADD COLUMN IF NOT EXISTS land_cost INT NOT NULL DEFAULT 0
  `);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS upkeep_food INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS upkeep_gold INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS att_rating NUMERIC(8,2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS def_rating NUMERIC(8,2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS nw_value NUMERIC(8,2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS housing TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS is_trainable BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE troop_types ADD COLUMN IF NOT EXISTS horse_cost INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS horses BIGINT NOT NULL DEFAULT 0`);

  await pool.query(`ALTER TABLE research_types ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General'`);
  await pool.query(`ALTER TABLE research_types ADD COLUMN IF NOT EXISTS effect_text TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE research_types ADD COLUMN IF NOT EXISTS effect_per_level NUMERIC(10,4) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE research_types ADD COLUMN IF NOT EXISTS base_gold BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE research_types ADD COLUMN IF NOT EXISTS base_seconds INT NOT NULL DEFAULT 3600`);
  await pool.query(`ALTER TABLE research_types ADD COLUMN IF NOT EXISTS max_level INT NOT NULL DEFAULT 10`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS tax_rate INT NOT NULL DEFAULT 25`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_status TEXT NOT NULL DEFAULT 'none'`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_requested_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_starts_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_ends_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS shield_cooldown_ends_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS daily_login_streak INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS daily_last_claimed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS mana BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS blue_gems INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE kingdoms ADD COLUMN IF NOT EXISTS green_gems INT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS banned_reason TEXT`);
  // Ensure priests are trainable (in case old seed set is_trainable=false)
  await pool.query(`UPDATE troop_types SET is_trainable = TRUE, gold_cost = 400, food_cost = 150, train_seconds = 3600, notes = 'Max 5 per Temple. Each priest generates 4 mana/hr.' WHERE code = 'priests' AND is_trainable = FALSE`);
  await pool.query(`ALTER TABLE settlement_building_types ADD COLUMN IF NOT EXISTS required_settlement_size INT NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE settlement_building_types ADD COLUMN IF NOT EXISTS base_build_seconds INT NOT NULL DEFAULT 10800`);
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
      INSERT INTO troop_types (code, name, gold_cost, food_cost, horse_cost, train_seconds, upkeep_food, upkeep_gold, att_rating, def_rating, nw_value, housing, notes, is_trainable)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          gold_cost = EXCLUDED.gold_cost,
          food_cost = EXCLUDED.food_cost,
          horse_cost = EXCLUDED.horse_cost,
          train_seconds = EXCLUDED.train_seconds,
          upkeep_food = EXCLUDED.upkeep_food,
          upkeep_gold = EXCLUDED.upkeep_gold,
          att_rating = EXCLUDED.att_rating,
          def_rating = EXCLUDED.def_rating,
          nw_value = EXCLUDED.nw_value,
          housing = EXCLUDED.housing,
          notes = EXCLUDED.notes,
          is_trainable = EXCLUDED.is_trainable;
      `,
      [t.code, t.name, t.trainGoldCost, t.trainFoodCost, Number((t as any).horseCost || 0), t.trainSeconds, t.upkeepFood, t.upkeepGold, t.att, t.def, t.nw, t.housing, t.notes, t.isTrainable],
    );
  }

  for (const r of RESEARCH_SKILLS) {
    await pool.query(
      `
      INSERT INTO research_types (code, name, category, effect_text, effect_per_level, base_gold, base_seconds, max_level)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          category = EXCLUDED.category,
          effect_text = EXCLUDED.effect_text,
          effect_per_level = EXCLUDED.effect_per_level,
          base_gold = EXCLUDED.base_gold,
          base_seconds = EXCLUDED.base_seconds,
          max_level = EXCLUDED.max_level
      `,
      [r.code, r.name, r.category, r.effectText, r.effectPerLevel, r.baseGold, r.baseSeconds, r.maxLevel],
    );
  }

  await pool.query(`DELETE FROM research_prereqs`);
  for (const p of RESEARCH_PREREQS) {
    await pool.query(
      `
      INSERT INTO research_prereqs (research_code, prereq_code, required_level)
      VALUES ($1,$2,$3)
      ON CONFLICT (research_code, prereq_code) DO UPDATE
      SET required_level = EXCLUDED.required_level
      `,
      [p.code, p.prereqCode, p.requiredLevel],
    );
  }

  for (const s of SETTLEMENT_BUILDING_TYPES) {
    await pool.query(
      `
      INSERT INTO settlement_building_types(code, name, effect_text, base_gold, base_stone, base_wood, required_settlement_size, base_build_seconds, max_level, city_only)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          effect_text = EXCLUDED.effect_text,
          base_gold = EXCLUDED.base_gold,
          base_stone = EXCLUDED.base_stone,
          base_wood = EXCLUDED.base_wood,
          required_settlement_size = EXCLUDED.required_settlement_size,
          base_build_seconds = EXCLUDED.base_build_seconds,
          max_level = EXCLUDED.max_level,
          city_only = EXCLUDED.city_only
      `,
      [s.code, s.name, s.effectText, s.baseGold, s.baseStone, s.baseWood, s.requiredSettlementSize, s.baseBuildSeconds, s.maxLevel, s.cityOnly],
    );
  }

  for (const a of ALLIANCE_BUILDING_TYPES) {
    await pool.query(
      `
      INSERT INTO alliance_building_types(code, name, effect_text, target_gold, target_stone, target_wood)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          effect_text = EXCLUDED.effect_text,
          target_gold = EXCLUDED.target_gold,
          target_stone = EXCLUDED.target_stone,
          target_wood = EXCLUDED.target_wood
      `,
      [a.code, a.name, a.effectText, a.goldCost, a.stoneCost, a.woodCost],
    );
  }
}
