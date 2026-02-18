import type { GameState } from './types.js';
import { calculateLaneThroughput, calculateScrapGenRate, calculateCreditRate, calculateFragmentInterval } from './pipeline.js';
import { calculateLatency } from './latency.js';

// ─── Fixed-step tick (1 second) ────────────────────────────────────────────

/**
 * Pure deterministic tick function.
 * Returns a brand-new GameState; never mutates the input.
 *
 * @param state        Current game state
 * @param deltaSeconds Seconds to simulate (default 1). Must be ≥ 1 in offline replay.
 */
export function processTick(state: GameState, deltaSeconds = 1): GameState {
  // Deep-clone via JSON (keeps things pure; Set handled by ser/deser)
  const s: GameState = JSON.parse(
    JSON.stringify(state, (_k, v) => (v instanceof Set ? [...v] : v)),
  );
  s.protocolsUsed = new Set(state.protocolsUsed);

  s.stats.playtimeSec += deltaSeconds;
  s.tickCount += 1;

  // ── 1. Generate scrap ─────────────────────────────────────────────────
  const scrapRate = calculateScrapGenRate(state);
  const scrapGenerated = scrapRate * deltaSeconds;

  // Distribute evenly across lanes
  const scrapPerLane = scrapGenerated / s.lanes.length;

  // ── 2. Per-lane processing ────────────────────────────────────────────
  const queueTolerance = (state.upgradesPurchased['hw_buffer'] ?? 0) * 10;
  const coolingLevel = state.upgradesPurchased['hw_cooling'] ?? 0;
  const latencyReductionPct = coolingLevel * 0.05;
  const latencyShieldPerk = state.meta.perks['perk_latency_shield'] ?? 0;
  const totalLatencyReduction = Math.min(0.9, latencyReductionPct + latencyShieldPerk * 0.15);

  let totalPayloadThisTick = 0;

  for (let i = 0; i < s.lanes.length; i++) {
    const lane = s.lanes[i];
    // Use immutable state for throughput calculation (snapshot before mutation)
    const throughput = calculateLaneThroughput(state.lanes[i], state);

    lane.queue += scrapPerLane;

    const toProcess = Math.min(lane.queue, throughput.processingCapacity * deltaSeconds);
    lane.queue = Math.max(0, lane.queue - toProcess);

    const { penalty } = calculateLatency(
      throughput.activeModuleCount,
      lane.queue,
      queueTolerance,
      totalLatencyReduction,
    );

    lane.heat = Math.max(0, 1 - penalty);

    const payloadFromLane = toProcess * throughput.outputMultiplier * penalty;
    totalPayloadThisTick += payloadFromLane;
  }

  // ── 3. Accumulate payload & credits ───────────────────────────────────
  s.resources.payload += totalPayloadThisTick;
  s.stats.totalPayloadProduced += totalPayloadThisTick;

  const creditRate = calculateCreditRate(state);
  const creditsEarned = totalPayloadThisTick * creditRate;
  s.resources.credits += creditsEarned;
  s.stats.totalCreditsEarned += creditsEarned;

  // ── 4. Deterministic fragment drops ───────────────────────────────────
  const fragInterval = calculateFragmentInterval(state);
  if (s.tickCount % fragInterval === 0) {
    s.resources.fragments += 1;
  }

  // ── 5. Contract progress ──────────────────────────────────────────────
  if (s.activeContractId) {
    const contract = s.contracts.find((c) => c.id === s.activeContractId);
    if (contract && contract.active) {
      contract.progressPayload += totalPayloadThisTick;

      if (contract.timeRemainingS !== null) {
        contract.timeRemainingS -= deltaSeconds;
        if (contract.timeRemainingS <= 0) {
          contract.expired = true;
          contract.active = false;
          s.activeContractId = null;
        }
      }

      if (contract.progressPayload >= contract.targetPayload) {
        // Auto-complete: award rewards immediately
        contract.active = false;
        contract.expired = false;
        s.resources.credits += contract.rewardCredits;
        s.resources.fragments += contract.rewardFragments;
        s.stats.totalCreditsEarned += contract.rewardCredits;
        s.completedContractCount += 1;
        if (contract.tier === 'high') s.highTierContractsCompleted += 1;
        s.activeContractId = null;
      }
    }
  }

  // ── 6. Prestige readiness check ───────────────────────────────────────
  if (
    s.stats.prestigeReadyAt === null &&
    s.stats.totalPayloadProduced >= 3000
  ) {
    s.stats.prestigeReadyAt = s.tickCount;
  }

  return s;
}

// ─── Offline progression replay ───────────────────────────────────────────

export interface OfflineSummary {
  elapsedSeconds: number;
  ticksSimulated: number;
  payloadEarned: number;
  creditsEarned: number;
  fragmentsEarned: number;
}

const DEFAULT_OFFLINE_CAP_HOURS = 8;
const OFFLINE_CHUNK_SECONDS = 60; // simulate in 1-minute chunks

/**
 * Simulate offline progress since `lastTickTime`.
 * Runs in coarse 60-second chunks; capped at 8 hours (upgradable via perk).
 */
export function processOfflineProgress(
  state: GameState,
  nowMs: number,
): { newState: GameState; summary: OfflineSummary } {
  const offlineCapHours =
    DEFAULT_OFFLINE_CAP_HOURS + (state.meta.perks['perk_offline_cap'] ?? 0) * 4;
  const capSeconds = offlineCapHours * 3600;

  const elapsed = Math.min(
    Math.max(0, (nowMs - state.lastTickTime) / 1000),
    capSeconds,
  );

  const before = {
    payload: state.stats.totalPayloadProduced,
    credits: state.stats.totalCreditsEarned,
    fragments: state.resources.fragments,
  };

  let current = state;
  let remaining = elapsed;
  let ticksSimulated = 0;

  while (remaining >= OFFLINE_CHUNK_SECONDS) {
    current = processTick(current, OFFLINE_CHUNK_SECONDS);
    remaining -= OFFLINE_CHUNK_SECONDS;
    ticksSimulated++;
  }
  if (remaining > 0) {
    current = processTick(current, remaining);
    ticksSimulated++;
  }

  current = { ...current, lastTickTime: nowMs };

  return {
    newState: current,
    summary: {
      elapsedSeconds: elapsed,
      ticksSimulated,
      payloadEarned: current.stats.totalPayloadProduced - before.payload,
      creditsEarned: current.stats.totalCreditsEarned - before.credits,
      fragmentsEarned: current.resources.fragments - before.fragments,
    },
  };
}
