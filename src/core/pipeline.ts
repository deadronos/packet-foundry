import type { GameState, LaneState, ModuleType } from './types.js';
import { MODULE_DEFINITIONS } from '../content/modules.js';
import { PROTOCOL_DEFINITIONS } from '../content/protocols.js';

// ─── Per-lane throughput calculation ───────────────────────────────────────

export interface LaneThroughput {
  /** How many scrap units per second this lane can process */
  processingCapacity: number;
  /** Payload-per-scrap output multiplier */
  outputMultiplier: number;
  /** Count of enabled (and unlocked) modules — affects latency */
  activeModuleCount: number;
}

/**
 * Pure function — computes throughput for a single lane given current global state.
 */
export function calculateLaneThroughput(
  lane: LaneState,
  state: GameState,
): LaneThroughput {
  const BASE_CAPACITY = 3; // scrap/sec baseline (no modules)
  let processingCapacity = BASE_CAPACITY;
  let outputMultiplier = 1.0;
  let activeModuleCount = 0;

  for (const modType of lane.enabledModules) {
    const modInfo = state.modules[modType as ModuleType];
    if (!modInfo || modInfo.level === 0) continue;

    const def = MODULE_DEFINITIONS[modType as ModuleType];
    const level = modInfo.level;
    processingCapacity += def.baseCapacityBonus + def.capacityPerLevel * (level - 1);
    outputMultiplier *= (def.baseOutputMultiplier + def.outputMultPerLevel * (level - 1));
    activeModuleCount++;
  }

  // Hardware: module speed upgrade (+2 per level, global)
  const speedLevel = state.upgradesPurchased['hw_module_speed'] ?? 0;
  processingCapacity += speedLevel * 2;

  // Protocol throughput multiplier applies to processing speed
  const protoDef = PROTOCOL_DEFINITIONS[state.activeProtocol];
  processingCapacity *= protoDef.throughputMultiplier;

  // Protocol compliance check
  const isCompliant = (protoDef.requiredModules as string[]).every(
    (m) =>
      lane.enabledModules.includes(m as ModuleType) &&
      (state.modules[m as ModuleType]?.level ?? 0) > 0,
  );
  if (!isCompliant && protoDef.requiredModules.length > 0) {
    outputMultiplier *= 0.5; // non-compliance penalty
  }

  // Meta perk: throughput boost (+10% capacity, +5% output per level)
  const throughputPerk = state.meta.perks['perk_throughput_boost'] ?? 0;
  if (throughputPerk > 0) {
    processingCapacity *= 1 + throughputPerk * 0.1;
    outputMultiplier *= 1 + throughputPerk * 0.05;
  }

  return { processingCapacity, outputMultiplier, activeModuleCount };
}

// ─── Scrap generation rate ─────────────────────────────────────────────────

/** Returns total scrap generated per tick-second across all lanes. */
export function calculateScrapGenRate(state: GameState): number {
  const BASE_PER_LANE = 5; // scrap/sec per lane (tuned so base processing can keep up)
  let rate = BASE_PER_LANE * state.lanes.length;

  const routingLevel = state.upgradesPurchased['sw_routing_ai'] ?? 0;
  rate *= 1 + routingLevel * 0.15;

  // Note: protocol throughput multiplier applies to processing speed, not scrap gen rate.
  // This keeps scrap gen stable; burst/secure differentiation is in processing capacity.

  const throughputPerk = state.meta.perks['perk_throughput_boost'] ?? 0;
  if (throughputPerk > 0) rate *= 1 + throughputPerk * 0.1;

  return rate;
}

// ─── Credit rate ──────────────────────────────────────────────────────────

/** Credits earned per payload unit. */
export function calculateCreditRate(state: GameState): number {
  let rate = PROTOCOL_DEFINITIONS[state.activeProtocol].creditMultiplier;

  const parserLevel = state.upgradesPurchased['sw_protocol_parser'] ?? 0;
  rate *= 1 + parserLevel * 0.1;

  const creditPerk = state.meta.perks['perk_credit_multiplier'] ?? 0;
  if (creditPerk > 0) rate *= 1.2;

  return rate;
}

// ─── Fragment drop interval ───────────────────────────────────────────────

/** Returns ticks between automatic fragment drops (deterministic). */
export function calculateFragmentInterval(state: GameState): number {
  const protoDef = PROTOCOL_DEFINITIONS[state.activeProtocol];
  let interval = Math.round(100 / protoDef.fragmentsPerHundredTicks);

  const minerLevel = state.upgradesPurchased['sw_fragment_miner'] ?? 0;
  interval = Math.max(5, interval - minerLevel * 8);

  const surgePerk = state.meta.perks['perk_fragment_surge'] ?? 0;
  interval = Math.max(5, interval - surgePerk * 5);

  return interval;
}
