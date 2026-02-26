export type RouteMetricSnapshot = {
  route: string;
  count: number;
  errors: number;
  p95: number;
  budgetMs: number;
};

export type OpsAlert = {
  code: string;
  severity: "info" | "warn" | "critical";
  message: string;
  details?: Record<string, unknown>;
};

export function evaluateOpsAlerts(input: {
  routes: RouteMetricSnapshot[];
  tickLagSeconds: number;
  tickIntervalSeconds: number;
}) {
  const alerts: OpsAlert[] = [];
  const routes = input.routes || [];
  const highLatency = routes.filter((r) => r.p95 > r.budgetMs);
  if (highLatency.length > 0) {
    alerts.push({
      code: "API_P95_BUDGET_BREACH",
      severity: "warn",
      message: `${highLatency.length} route(s) exceed p95 latency budget.`,
      details: { routes: highLatency.map((r) => ({ route: r.route, p95: r.p95, budgetMs: r.budgetMs })) },
    });
  }

  const totalSamples = routes.reduce((acc, r) => acc + Number(r.count || 0), 0);
  const totalErrors = routes.reduce((acc, r) => acc + Number(r.errors || 0), 0);
  const errorRate = totalSamples > 0 ? totalErrors / totalSamples : 0;
  if (errorRate >= 0.05 && totalSamples >= 50) {
    alerts.push({
      code: "API_ERROR_RATE_HIGH",
      severity: errorRate >= 0.1 ? "critical" : "warn",
      message: `API error rate is ${(errorRate * 100).toFixed(2)}% over ${totalSamples} sampled requests.`,
      details: { errorRate, totalSamples, totalErrors },
    });
  }

  const tickInterval = Math.max(1, Number(input.tickIntervalSeconds || 1));
  const lag = Math.max(0, Number(input.tickLagSeconds || 0));
  if (lag > tickInterval * 4) {
    alerts.push({
      code: "TICK_WORKER_LAG_CRITICAL",
      severity: "critical",
      message: `Tick worker lag is ${lag}s (> ${tickInterval * 4}s threshold).`,
      details: { lagSeconds: lag, intervalSeconds: tickInterval },
    });
  } else if (lag > tickInterval * 2) {
    alerts.push({
      code: "TICK_WORKER_LAG_WARN",
      severity: "warn",
      message: `Tick worker lag is ${lag}s (> ${tickInterval * 2}s threshold).`,
      details: { lagSeconds: lag, intervalSeconds: tickInterval },
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      code: "OPS_HEALTHY",
      severity: "info",
      message: "No active live-ops alerts.",
    });
  }

  return alerts;
}
