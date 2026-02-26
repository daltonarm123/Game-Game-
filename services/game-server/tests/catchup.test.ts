import test from "node:test";
import assert from "node:assert/strict";
import { computeCatchupBatch } from "../src/catchup.js";

test("no elapsed interval means no due ticks", () => {
  const out = computeCatchupBatch({
    lastTickAtMs: 10_000,
    nowMs: 10_999,
    intervalSec: 5,
    maxCatchupTicks: 24,
  });
  assert.deepEqual(out, { dueTicks: 0, runCount: 0, capped: false, backlog: 0 });
});

test("processes due ticks up to max catchup cap", () => {
  const out = computeCatchupBatch({
    lastTickAtMs: 0,
    nowMs: 130_000,
    intervalSec: 5,
    maxCatchupTicks: 20,
  });
  assert.equal(out.dueTicks, 26);
  assert.equal(out.runCount, 20);
  assert.equal(out.capped, true);
  assert.equal(out.backlog, 6);
});

test("handles negative drift safely", () => {
  const out = computeCatchupBatch({
    lastTickAtMs: 20_000,
    nowMs: 10_000,
    intervalSec: 5,
    maxCatchupTicks: 10,
  });
  assert.deepEqual(out, { dueTicks: 0, runCount: 0, capped: false, backlog: 0 });
});
