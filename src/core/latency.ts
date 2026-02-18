// ─── Pure latency calculations ─────────────────────────────────────────────

export interface LatencyInfo {
  /** Estimated round-trip latency in milliseconds (display only) */
  latencyMs: number;
  /** 0–1 multiplier applied to lane output (1 = no penalty) */
  penalty: number;
}

/**
 * Calculate latency info for a lane.
 *
 * @param activeModuleCount  Number of enabled modules in the chain
 * @param queueSize          Current unprocessed scrap in the lane
 * @param queueTolerance     Extra queue headroom granted by buffer upgrades
 * @param latencyReductionPct  Percentage reduction from cooling upgrades (0–1)
 */
export function calculateLatency(
  activeModuleCount: number,
  queueSize: number,
  queueTolerance = 0,
  latencyReductionPct = 0,
): LatencyInfo {
  const BASE_MS = 10;
  const CHAIN_DEPTH_MS_PER_MODULE = 5;
  const CONGESTION_MS_PER_QUEUE = 0.5;

  const effectiveQueue = Math.max(0, queueSize - queueTolerance);

  const latencyMs =
    BASE_MS +
    activeModuleCount * CHAIN_DEPTH_MS_PER_MODULE +
    effectiveQueue * CONGESTION_MS_PER_QUEUE;

  // Penalty formula from design doc:
  // max(0.1, 1 - 0.06*(moduleCount-3) - 0.0008*queue)
  const depthPenalty = 0.06 * Math.max(0, activeModuleCount - 3);
  const queuePenalty = 0.0008 * effectiveQueue;
  const rawPenalty = Math.max(0.1, 1 - depthPenalty - queuePenalty);

  // Cooling reduces the penalty magnitude (how much is subtracted from 1)
  const penalty = Math.min(1, rawPenalty + latencyReductionPct * (1 - rawPenalty));

  return { latencyMs, penalty };
}
