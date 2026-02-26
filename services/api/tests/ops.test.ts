import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOpsAlerts } from "../src/ops.js";

test("evaluateOpsAlerts returns healthy info when metrics are clean", () => {
  const alerts = evaluateOpsAlerts({
    routes: [{ route: "GET /api/kingdom/x", count: 200, errors: 1, p95: 70, budgetMs: 120 }],
    tickLagSeconds: 40,
    tickIntervalSeconds: 30,
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].code, "OPS_HEALTHY");
});

test("evaluateOpsAlerts detects latency/error/tick lag breaches", () => {
  const alerts = evaluateOpsAlerts({
    routes: [
      { route: "GET /api/kingdom/x", count: 200, errors: 35, p95: 180, budgetMs: 120 },
      { route: "POST /api/war-room/x/attack", count: 60, errors: 10, p95: 160, budgetMs: 120 },
    ],
    tickLagSeconds: 700,
    tickIntervalSeconds: 120,
  });
  const codes = alerts.map((a) => a.code);
  assert.ok(codes.includes("API_P95_BUDGET_BREACH"));
  assert.ok(codes.includes("API_ERROR_RATE_HIGH"));
  assert.ok(codes.includes("TICK_WORKER_LAG_CRITICAL"));
});
