import type { GameState, ContractState, ProtocolFamily } from './types.js';
import { buildContractBoard } from '../state/gameState.js';

// ─── Contract board management ─────────────────────────────────────────────

/**
 * Refresh the contract board (called after completing all contracts or on prestige).
 * Generates 3 new contracts deterministically based on the current run seed.
 */
export function refreshContractBoard(state: GameState): GameState {
  const seed = state.tickCount ^ (state.meta.prestigeCount * 1000);
  const newContracts = buildContractBoard(state.meta.prestigeCount, seed);
  return { ...state, contracts: newContracts, activeContractId: null };
}

/**
 * Activate a contract from the board.
 * Returns null if the contract doesn't exist or is already active/expired.
 */
export function activateContract(
  state: GameState,
  contractId: string,
): GameState | null {
  const contract = state.contracts.find((c) => c.id === contractId);
  if (!contract || contract.active || contract.expired || contract.progressPayload > 0)
    return null;
  if (state.activeContractId) return null; // already running one

  const updated = state.contracts.map((c) =>
    c.id === contractId ? { ...c, active: true } : c,
  );
  return { ...state, contracts: updated, activeContractId: contractId };
}

/**
 * Check whether all available contracts have been completed or expired.
 * If so, the board should be refreshed.
 */
export function isBoardExhausted(state: GameState): boolean {
  return (
    state.contracts.length > 0 &&
    state.contracts.every((c) => !c.active && (c.progressPayload >= c.targetPayload || c.expired))
  );
}
