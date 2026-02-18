import type { GameState, LaneState, ModuleType, ProtocolFamily } from '../core/types.js';
import { MODULE_DEFINITIONS } from '../content/modules.js';
import { PROTOCOL_DEFINITIONS } from '../content/protocols.js';
import { CONTRACT_TEMPLATES } from '../content/contracts.js';

// ─── Initial state ──────────────────────────────────────────────────────────

const MODULE_TYPES: ModuleType[] = ['decrypt', 'checksum', 'compress', 'tag'];

export function createInitialState(): GameState {
  return {
    version: 1,
    lastTickTime: Date.now(),
    resources: { scrap: 0, payload: 0, credits: 0, fragments: 0 },
    lanes: [createLane(0)],
    modules: {
      decrypt:  { type: 'decrypt',  level: 1 }, // starts unlocked
      checksum: { type: 'checksum', level: 0 },
      compress: { type: 'compress', level: 0 },
      tag:      { type: 'tag',      level: 0 },
    },
    activeProtocol: 'burst',
    upgradesPurchased: {},
    contracts: [],
    activeContractId: null,
    completedContractCount: 0,
    highTierContractsCompleted: 0,
    protocolsUsed: new Set(['burst']),
    meta: {
      prestigeCount: 0,
      totalReputation: 0,
      spentReputation: 0,
      perks: {},
    },
    stats: {
      totalPayloadProduced: 0,
      totalCreditsEarned: 0,
      playtimeSec: 0,
      prestigeReadyAt: null,
    },
    tickCount: 0,
  };
}

export function createLane(id: number): LaneState {
  return { id, queue: 0, heat: 0, enabledModules: ['decrypt'] };
}

// ─── JSON serialization (Set is not JSON-serializable) ─────────────────────

export function serializeState(state: GameState): object {
  return {
    ...state,
    protocolsUsed: Array.from(state.protocolsUsed),
  };
}

export function deserializeState(raw: Record<string, unknown>): GameState {
  const base = raw as unknown as GameState;
  return {
    ...base,
    protocolsUsed: new Set((raw['protocolsUsed'] as string[]) as ProtocolFamily[]),
  };
}

// ─── Contract board helpers ─────────────────────────────────────────────────

/**
 * Build an initial set of 3 contracts for a fresh/refreshed board.
 * Rotates on prestige, guaranteed to cover at least two different protocols.
 */
export function buildContractBoard(
  prestigeCount: number,
  seed: number,
): import('../core/types.js').ContractState[] {
  const available = CONTRACT_TEMPLATES.filter((t) => t.minPrestige <= prestigeCount);
  // Deterministic shuffle using the seed
  const shuffled = [...available].sort((a, b) => {
    const ha = deterministicHash(a.id + seed);
    const hb = deterministicHash(b.id + seed);
    return ha - hb;
  });
  // Take first 3 unique-protocol contracts
  const seen = new Set<string>();
  const chosen: typeof shuffled = [];
  for (const t of shuffled) {
    if (chosen.length >= 3) break;
    if (!seen.has(t.protocol) || chosen.length < 3) {
      chosen.push(t);
      seen.add(t.protocol);
    }
  }
  return chosen.slice(0, 3).map((t, i) => ({
    id: `${t.id}_run${seed}_${i}`,
    name: t.name,
    description: t.description,
    protocol: t.protocol,
    targetPayload: t.targetPayload,
    timeLimitSec: t.timeLimitSec,
    rewardCredits: t.rewardCredits,
    rewardFragments: t.rewardFragments,
    tier: t.tier,
    active: false,
    expired: false,
    progressPayload: 0,
    timeRemainingS: t.timeLimitSec,
  }));
}

function deterministicHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
