import type { GameState, ModuleType, ProtocolFamily } from '../core/types.js';
import { createInitialState, createLane } from './gameState.js';
import { MODULE_DEFINITIONS } from '../content/modules.js';
import { PROTOCOL_DEFINITIONS } from '../content/protocols.js';
import { UPGRADE_DEFINITIONS, UPGRADE_MAP, LANE_COST, LANE_COST_3, upgradeCost } from '../content/upgrades.js';
import { activateContract, refreshContractBoard } from '../core/contracts.js';
import { buyMetaPerk } from '../core/prestige.js';

// ─── Re-export helpers ─────────────────────────────────────────────────────

export { refreshContractBoard, activateContract, buyMetaPerk };

// ─── Upgrade / module management ──────────────────────────────────────────

/**
 * Buy a standard upgrade (hardware/software) or a module-level upgrade.
 * Returns null if the purchase fails (insufficient credits, max level, etc.).
 */
export function buyUpgrade(state: GameState, upgradeId: string): GameState | null {
  const def = UPGRADE_MAP[upgradeId];
  if (!def) return null;

  const currentLevel = state.upgradesPurchased[upgradeId] ?? 0;
  if (currentLevel >= def.maxLevel) return null;

  const cost = upgradeCost(def, currentLevel);
  if (state.resources.credits < cost) return null;

  const newState: GameState = {
    ...state,
    resources: { ...state.resources, credits: state.resources.credits - cost },
    upgradesPurchased: { ...state.upgradesPurchased, [upgradeId]: currentLevel + 1 },
  };

  // For module upgrades, also bump the module level
  if (def.category === 'module') {
    const moduleType = upgradeId.replace('module_', '') as ModuleType;
    if (state.modules[moduleType]) {
      newState.modules = {
        ...newState.modules,
        [moduleType]: { ...newState.modules[moduleType], level: newState.modules[moduleType].level + 1 },
      };
    }
  }

  return newState;
}

/**
 * Unlock a module type (set level 0 → 1) for the given cost.
 * Returns null if already unlocked or insufficient credits.
 */
export function unlockModule(state: GameState, moduleType: ModuleType): GameState | null {
  const mod = state.modules[moduleType];
  if (mod.level > 0) return null; // already unlocked

  const def = MODULE_DEFINITIONS[moduleType];
  if (state.resources.credits < def.unlockCost) return null;

  // Enable on all existing lanes by default
  const newLanes = state.lanes.map((lane) => ({
    ...lane,
    enabledModules: lane.enabledModules.includes(moduleType)
      ? lane.enabledModules
      : ([...lane.enabledModules, moduleType] as ModuleType[]),
  }));

  return {
    ...state,
    resources: { ...state.resources, credits: state.resources.credits - def.unlockCost },
    modules: { ...state.modules, [moduleType]: { type: moduleType, level: 1 } },
    lanes: newLanes,
  };
}

/** Toggle a module on/off for a specific lane. Returns null if lane not found. */
export function toggleLaneModule(
  state: GameState,
  laneId: number,
  moduleType: ModuleType,
): GameState | null {
  const laneIdx = state.lanes.findIndex((l) => l.id === laneId);
  if (laneIdx === -1) return null;
  if ((state.modules[moduleType]?.level ?? 0) === 0) return null; // not unlocked

  const lane = state.lanes[laneIdx];
  const enabled = lane.enabledModules.includes(moduleType);
  const newEnabled = enabled
    ? lane.enabledModules.filter((m) => m !== moduleType)
    : ([...lane.enabledModules, moduleType] as ModuleType[]);

  const newLanes = state.lanes.map((l, i) =>
    i === laneIdx ? { ...l, enabledModules: newEnabled } : l,
  );
  return { ...state, lanes: newLanes };
}

// ─── Lane management ──────────────────────────────────────────────────────

/** Add a new lane (max 3). Returns null if max reached or insufficient credits. */
export function addLane(state: GameState): GameState | null {
  if (state.lanes.length >= 3) return null;

  const cost = state.lanes.length === 1 ? LANE_COST : LANE_COST_3;
  if (state.resources.credits < cost) return null;

  // New lane gets all currently-unlocked modules enabled
  const unlockedModules = (Object.keys(state.modules) as ModuleType[]).filter(
    (m) => state.modules[m].level > 0,
  );
  const newLane = { ...createLane(state.lanes.length), enabledModules: unlockedModules };

  return {
    ...state,
    resources: { ...state.resources, credits: state.resources.credits - cost },
    lanes: [...state.lanes, newLane],
  };
}

// ─── Protocol switching ───────────────────────────────────────────────────

/** Switch to a protocol. Returns null if insufficient credits or same protocol. */
export function switchProtocol(
  state: GameState,
  protocol: ProtocolFamily,
): GameState | null {
  if (state.activeProtocol === protocol) return null;

  const cost = PROTOCOL_DEFINITIONS[protocol].switchCost;
  if (state.resources.credits < cost) return null;

  const newProtocolsUsed = new Set(state.protocolsUsed);
  newProtocolsUsed.add(protocol);

  return {
    ...state,
    resources: { ...state.resources, credits: state.resources.credits - cost },
    activeProtocol: protocol,
    protocolsUsed: newProtocolsUsed,
  };
}
