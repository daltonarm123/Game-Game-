export function computeCatchupBatch(params: {
  lastTickAtMs: number;
  nowMs: number;
  intervalSec: number;
  maxCatchupTicks: number;
}) {
  const intervalSec = Math.max(1, Number(params.intervalSec || 1));
  const elapsedSec = Math.floor((params.nowMs - params.lastTickAtMs) / 1000);
  const dueTicks = Math.max(0, Math.floor(elapsedSec / intervalSec));
  const runCount = Math.max(0, Math.min(Math.max(1, params.maxCatchupTicks), dueTicks));
  return {
    dueTicks,
    runCount,
    capped: dueTicks > runCount,
    backlog: Math.max(0, dueTicks - runCount),
  };
}
