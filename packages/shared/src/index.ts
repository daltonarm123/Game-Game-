export const GAME_NAME = "Game Game";

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

export type Season = (typeof SEASONS)[number];

export type BuildingCode = "farm" | "lumberyard" | "quarry" | "barracks" | "stables";

export type BuildingDef = {
  code: BuildingCode;
  name: string;
  woodCost: number;
  stoneCost: number;
  baseBuildSeconds: number;
};

export const BUILDINGS: BuildingDef[] = [
  { code: "farm", name: "Grain Farm", woodCost: 120, stoneCost: 80, baseBuildSeconds: 90 },
  { code: "lumberyard", name: "Lumber Yard", woodCost: 140, stoneCost: 90, baseBuildSeconds: 100 },
  { code: "quarry", name: "Stone Quarry", woodCost: 100, stoneCost: 140, baseBuildSeconds: 110 },
  { code: "barracks", name: "Barracks", woodCost: 220, stoneCost: 220, baseBuildSeconds: 150 },
  { code: "stables", name: "Stables", woodCost: 260, stoneCost: 180, baseBuildSeconds: 160 },
];
