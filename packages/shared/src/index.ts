export const GAME_NAME = "Crownforge";

export type SeasonCode = "spring" | "summer" | "autumn" | "winter";

export const SEASONS: Array<{
  code: SeasonCode;
  name: string;
  flavor: string;
  modifiers: { food: number; gold: number; wood: number; stone: number };
}> = [
  {
    code: "spring",
    name: "Spring",
    flavor: "A new year dawns. Food growth increases and armies recover momentum.",
    modifiers: { food: 1.25, gold: 1.0, wood: 1.0, stone: 1.0 },
  },
  {
    code: "summer",
    name: "Summer",
    flavor: "Trade roads are clear. Gold, food, and wood all gain momentum.",
    modifiers: { food: 1.1, gold: 1.05, wood: 1.05, stone: 1.0 },
  },
  {
    code: "autumn",
    name: "Autumn",
    flavor: "Harvest season peaks. Food and wood stocks climb quickly.",
    modifiers: { food: 1.2, gold: 1.0, wood: 1.1, stone: 1.0 },
  },
  {
    code: "winter",
    name: "Winter",
    flavor: "Cold strains supply lines. Food and gold soften while stone output rises.",
    modifiers: { food: 0.85, gold: 0.95, wood: 0.95, stone: 1.05 },
  },
];

export const ECON_BUILDING_HOURLY = {
  farmFood: 120,
  lumberWood: 80,
  quarryStone: 80,
  horseFarmHorses: 60,
  baseGoldPerLand: 3,
  baseFoodPerLand: 2,
} as const;

export const POPULATION_CAPACITY = {
  baselinePeasants: 1000,
  peasantsPerHouse: 10,
  peasantsPerCastle: 100,
} as const;

// Mana rates
export const MANA_PER_PRIEST_PER_HOUR = 4;   // 1 priest = 4 mana/hr (slow game)
export const PRIESTS_PER_TEMPLE = 5;          // max priests per temple built

export interface PrayerDef {
  name: string;
  effect: string;
  manaPerDay: number;
  bonus: number;
  type: string;
}

export const PRAYERS: Record<string, PrayerDef> = {
  attacking_wrath:    { name: "Attacking Wrath",    effect: "Increases the attacking values of troops by 5%",                   manaPerDay: 500,  bonus: 0.05, type: "attack_bonus" },
  steeds_fury:        { name: "Steed's Fury",        effect: "All mounted troops have increased attack statistics (5%)",         manaPerDay: 600,  bonus: 0.05, type: "mounted_attack_bonus" },
  falors_gift:        { name: "Falor's Gift",        effect: "Increases the amount of Gold Generated (5%)",                     manaPerDay: 700,  bonus: 0.05, type: "gold_bonus" },
  fertility_blessing: { name: "Fertility Blessing",  effect: "Increases the rate that population arrives (5%)",                 manaPerDay: 1000, bonus: 0.05, type: "population_bonus" },
  masons_benefice:    { name: "Masons Benefice",     effect: "Increases the rate of stone collection (10%)",                    manaPerDay: 700,  bonus: 0.10, type: "stone_bonus" },
  foresters_delight:  { name: "Forester's Delight",  effect: "Increases the wood collection rate (10%)",                        manaPerDay: 700,  bonus: 0.10, type: "wood_bonus" },
  nastfurus_healing:  { name: "Nastfuru's Healing",  effect: "Reduces the casualty rate in battle (9%)",                        manaPerDay: 700,  bonus: 0.09, type: "casualty_reduction" },
  natures_gift:       { name: "Nature's Gift",       effect: "Increases the yield of Grain (5%)",                               manaPerDay: 700,  bonus: 0.05, type: "food_bonus" },
  springs_effect:     { name: "Springs Effect",      effect: "Increases the amount of animals produced by Kingdom farms (9%)",  manaPerDay: 1000, bonus: 0.09, type: "horse_bonus" },
  traders_whip:       { name: "Trader's Whip",       effect: "Increases the speed that market wagons purchase from market (25%)", manaPerDay: 1000, bonus: 0.25, type: "market_bonus" },
};

export function clampNumber(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function peasantDeltaPerHour(taxRate: number) {
  if (taxRate < 24) return (24 - taxRate) * 50;
  if (taxRate > 27) return -1 * (taxRate - 27) * 60;
  return 0;
}

export function peasantHousingCapacity(buildingLevels: Record<string, number>) {
  const houses = Math.max(0, Number(buildingLevels.houses || 0));
  const castles = Math.max(0, Number(buildingLevels.castles || 0));
  return houses * POPULATION_CAPACITY.peasantsPerHouse + castles * POPULATION_CAPACITY.peasantsPerCastle;
}

export function effectivePeasantCap(buildingLevels: Record<string, number>) {
  return POPULATION_CAPACITY.baselinePeasants + peasantHousingCapacity(buildingLevels);
}

// ── Resource storage caps ─────────────────────────────────────────────────────
// Base caps apply to all kingdoms regardless of buildings.
// Each building level adds to the cap of the relevant resource(s).
export const STORAGE_CAPS = {
  base:          { gold: 100_000, food: 50_000, wood: 10_000, stone: 10_000 },
  perFarm:       { gold: 30,      food: 2_000 },
  perBarn:       { food: 10_000 },
  perLumberyard: { wood: 200 },
  perQuarry:     { stone: 200 },
  perCastle:     { gold: 20_000, food: 7_500, wood: 500, stone: 500 },
  perHouse:      { gold: 100 },
} as const;

export function computeStorageCaps(buildingLevels: Record<string, number>) {
  const farm    = Math.max(0, Number(buildingLevels.farm       || 0));
  const barns   = Math.max(0, Number(buildingLevels.barns      || 0));
  const lumber  = Math.max(0, Number(buildingLevels.lumberyard || 0));
  const quarry  = Math.max(0, Number(buildingLevels.quarry     || 0));
  const castles = Math.max(0, Number(buildingLevels.castles    || 0));
  const houses  = Math.max(0, Number(buildingLevels.houses     || 0));
  return {
    gold:  STORAGE_CAPS.base.gold  + farm * STORAGE_CAPS.perFarm.gold  + castles * STORAGE_CAPS.perCastle.gold  + houses * STORAGE_CAPS.perHouse.gold,
    food:  STORAGE_CAPS.base.food  + farm * STORAGE_CAPS.perFarm.food  + barns   * STORAGE_CAPS.perBarn.food   + castles * STORAGE_CAPS.perCastle.food,
    wood:  STORAGE_CAPS.base.wood  + lumber * STORAGE_CAPS.perLumberyard.wood + castles * STORAGE_CAPS.perCastle.wood,
    stone: STORAGE_CAPS.base.stone + quarry * STORAGE_CAPS.perQuarry.stone    + castles * STORAGE_CAPS.perCastle.stone,
  };
}

export function taxGoldMultiplier(taxRate: number) {
  return clampNumber(1 + (taxRate - 25) * 0.04, 0.2, 2.2);
}

export function researchGoldCost(baseGold: number, currentLevel: number) {
  return Math.max(1, Math.floor(baseGold * Math.pow(1.35, Math.max(0, currentLevel))));
}

export function researchSeconds(baseSeconds: number, currentLevel: number, fastSeconds?: number) {
  const raw = Math.max(300, Math.floor(baseSeconds * Math.pow(1.25, Math.max(0, currentLevel))));
  return typeof fastSeconds === "number" && fastSeconds > 0 ? fastSeconds : raw;
}

export const SETTLEMENT_TYPE_DEF: Record<string, { level: number; slots: number }> = {
  small_town: { level: 1, slots: 3 },
  medium_town: { level: 2, slots: 5 },
  large_town: { level: 3, slots: 8 },
  small_city: { level: 4, slots: 12 },
  medium_city: { level: 5, slots: 17 },
  large_city: { level: 6, slots: 25 },
};

export const SETTLEMENT_MILESTONE_PLAN: Array<{ land: number; types: string[] }> = [
  { land: 3000, types: ["small_town"] },
  { land: 8000, types: ["medium_town", "small_town"] },
  { land: 14000, types: ["large_town", "medium_town", "small_town"] },
  { land: 21000, types: ["small_city", "large_town", "medium_town", "small_town"] },
  { land: 30000, types: ["medium_city", "small_city", "large_town", "medium_town", "small_town"] },
  { land: 50000, types: ["large_city", "medium_city", "small_city", "large_town", "medium_town", "small_town"] },
  { land: 100000, types: ["large_city", "large_city", "medium_city", "small_city", "large_town", "medium_town", "small_town"] },
  { land: 250000, types: ["large_city", "large_city", "large_city", "medium_city", "small_city", "large_town", "medium_town", "small_town"] },
];

export function expectedSettlementPlan(land: number) {
  let plan: { land: number; types: string[] } = { land: 0, types: [] };
  for (const p of SETTLEMENT_MILESTONE_PLAN) {
    if (land >= p.land) plan = p;
  }
  return plan;
}

export function settlementTypeDisplay(size: number) {
  if (size >= 6) return "Large City";
  if (size >= 5) return "Medium City";
  if (size >= 4) return "Small City";
  if (size >= 3) return "Large Town";
  if (size >= 2) return "Medium Town";
  return "Small Town";
}
