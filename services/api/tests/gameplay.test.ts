import test from "node:test";
import assert from "node:assert/strict";
import {
  HOLY_SPELL_COSTS,
  computeSabotageStolen,
  isAllianceModerator,
  resolveHolySpellDelta,
  resolveSabotageOutcome,
} from "../src/gameplay.js";

test("holy spell costs include all castable spells", () => {
  assert.equal(HOLY_SPELL_COSTS.mana_surge, 1200);
  assert.equal(HOLY_SPELL_COSTS.blessing_of_plenty, 1600);
  assert.equal(HOLY_SPELL_COSTS.stoneskin, 1500);
  assert.equal(HOLY_SPELL_COSTS.war_zeal, 2200);
  assert.equal(HOLY_SPELL_COSTS.divine_barrier, 1800);
  assert.equal(HOLY_SPELL_COSTS.blight, 2100);
  assert.equal(HOLY_SPELL_COSTS.mana_leech, 1900);
});

test("resolveHolySpellDelta returns deterministic ranges", () => {
  assert.deepEqual(resolveHolySpellDelta("mana_surge", () => 0), { mana: 600 });
  assert.deepEqual(resolveHolySpellDelta("blessing_of_plenty", () => 0), { food: 12000 });
  assert.deepEqual(resolveHolySpellDelta("stoneskin", () => 0), { stone: 4000 });
  assert.deepEqual(resolveHolySpellDelta("war_zeal", () => 0), { gold: 2500 });
  assert.deepEqual(resolveHolySpellDelta("divine_barrier", () => 0), { barrierHours: 12, sabotageDefenseBonus: 0.22 });
  assert.deepEqual(resolveHolySpellDelta("blight", () => 0), { foodDrain: 7000 });
  assert.deepEqual(resolveHolySpellDelta("mana_leech", () => 0), { manaDrain: 600, manaGainFactor: 0.6 });
});

test("resolveSabotageOutcome computes caps and losses", () => {
  const success = resolveSabotageOutcome({
    spiesToSend: 100,
    defenderSpiesHome: 20,
    defenderResourceAmount: 50_000,
    random: () => 0,
  });
  assert.equal(success.success, true);
  assert.equal(success.spyLosses, 8);
  assert.equal(success.survivors, 92);
  assert.equal(success.stolen, 2000);

  const fail = resolveSabotageOutcome({
    spiesToSend: 10,
    defenderSpiesHome: 500,
    defenderResourceAmount: 99_999,
    random: () => 1,
  });
  assert.equal(fail.success, false);
  assert.equal(fail.spyLosses, 2);
  assert.equal(fail.survivors, 8);
  assert.equal(fail.stolen, 0);
});

test("computeSabotageStolen respects send-cap and resource ratio", () => {
  assert.equal(computeSabotageStolen(10, 100_000), 200);
  assert.equal(computeSabotageStolen(200, 100_000), 4000);
});

test("isAllianceModerator accepts owner/officer/leader", () => {
  assert.equal(isAllianceModerator("owner"), true);
  assert.equal(isAllianceModerator("officer"), true);
  assert.equal(isAllianceModerator("leader"), true);
  assert.equal(isAllianceModerator("member"), false);
});
