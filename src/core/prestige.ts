import type { GameState } from './types.js';
import { createInitialState, createLane } from '../state/gameState.js';
import { META_PERKS } from '../content/contracts.js';

// ─── Prestige calculations ──────────────────────────────────────────────────

/** Returns how much Contract Reputation the player would gain if they prestiged now. */
export function calculateReputationGain(state: GameState): number {
  const payloadScore = Math.floor(
    Math.pow(Math.max(0, state.stats.totalPayloadProduced), 0.25),
  );
  const contractScore = Math.floor(state.highTierContractsCompleted * 0.5 + state.completedContractCount * 0.25);
  const protocolScore = state.protocolsUsed.size;
  return Math.max(1, payloadScore + contractScore + protocolScore);
}

/** Returns true if the player meets the prestige threshold. */
export function canPrestige(state: GameState): boolean {
  return state.stats.totalPayloadProduced >= 3000;
}

/** Returns available reputation after spending. */
export function availableReputation(state: GameState): number {
  return state.meta.totalReputation - state.meta.spentReputation;
}

/**
 * Perform a prestige reset ("New ISP Contract").
 * Resets run-state; preserves meta-progress and purchased perks.
 * Returns the new GameState.
 */
export function applyPrestige(state: GameState): GameState {
  const gained = calculateReputationGain(state);
  const fresh = createInitialState();

  const newMeta = {
    prestigeCount: state.meta.prestigeCount + 1,
    totalReputation: state.meta.totalReputation + gained,
    spentReputation: state.meta.spentReputation,
    perks: { ...state.meta.perks },
  };

  // Apply meta perk: Head Start (extra lane)
  const headStart = newMeta.perks['perk_head_start'] ?? 0;
  const initialLaneCount = 1 + headStart;
  const freshLanes = Array.from({ length: initialLaneCount }, (_, i) => createLane(i));

  return {
    ...fresh,
    meta: newMeta,
    lanes: freshLanes,
    protocolsUsed: new Set(['burst']),
    lastTickTime: Date.now(),
  };
}

/**
 * Spend reputation to purchase (or upgrade) a meta perk.
 * Returns null if the perk doesn't exist, is already maxed, or rep is insufficient.
 */
export function buyMetaPerk(state: GameState, perkId: string): GameState | null {
  const perkDef = META_PERKS.find((p) => p.id === perkId);
  if (!perkDef) return null;

  const currentLevel = state.meta.perks[perkId] ?? 0;
  if (currentLevel >= perkDef.maxLevel) return null;

  const cost = perkDef.costPerLevel;
  if (availableReputation(state) < cost) return null;

  return {
    ...state,
    meta: {
      ...state.meta,
      spentReputation: state.meta.spentReputation + cost,
      perks: { ...state.meta.perks, [perkId]: currentLevel + 1 },
    },
  };
}
