import { clampNumber } from "../../../packages/shared/src/index.js";

export const HOLY_SPELL_COSTS: Record<string, number> = {
  mana_surge: 1200,
  blessing_of_plenty: 1600,
  stoneskin: 1500,
  war_zeal: 2200,
  divine_barrier: 1800,
  blight: 2100,
  mana_leech: 1900,
};

export type SabotageResource = "gold" | "food" | "wood" | "stone";

export function resolveSabotageOutcome(input: {
  spiesToSend: number;
  defenderSpiesHome: number;
  defenderResourceAmount: number;
  attackBonus?: number;
  defenseBonus?: number;
  random: () => number;
}) {
  const successScore = input.spiesToSend * (0.9 + input.random() * 0.4) * (1 + Number(input.attackBonus || 0));
  const defenseScore = Math.max(15, input.defenderSpiesHome) * (0.8 + input.random() * 0.4) * (1 + Number(input.defenseBonus || 0));
  const success = successScore >= defenseScore;
  const lossRate = success ? 0.08 : 0.26;
  const spyLosses = clampNumber(Math.floor(input.spiesToSend * lossRate), 0, input.spiesToSend);
  const survivors = input.spiesToSend - spyLosses;
  const cap = Math.max(200, input.spiesToSend * 20);
  const stolen = success
    ? computeSabotageStolen(input.spiesToSend, input.defenderResourceAmount)
    : 0;
  return { success, spyLosses, survivors, stolen };
}

export function computeSabotageStolen(spiesToSend: number, defenderResourceAmount: number) {
  const cap = Math.max(200, spiesToSend * 20);
  return clampNumber(Math.floor(defenderResourceAmount * 0.06), 0, cap);
}

export function resolveHolySpellDelta(
  spellCode: string,
  random: () => number,
): Record<string, number> {
  if (spellCode === "mana_surge") return { mana: 600 + Math.floor(random() * 400) };
  if (spellCode === "blessing_of_plenty") return { food: 12000 + Math.floor(random() * 5000) };
  if (spellCode === "stoneskin") return { stone: 4000 + Math.floor(random() * 2000) };
  if (spellCode === "war_zeal") return { gold: 2500 + Math.floor(random() * 1500) };
  if (spellCode === "blight") return { foodDrain: 7000 + Math.floor(random() * 6000) };
  if (spellCode === "mana_leech") return { manaDrain: 600 + Math.floor(random() * 700), manaGainFactor: 0.6 };
  if (spellCode === "divine_barrier") return { barrierHours: 12, sabotageDefenseBonus: 0.22 };
  throw new Error("unknown spell");
}

export function isAllianceModerator(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "owner" || normalized === "officer" || normalized === "leader";
}
