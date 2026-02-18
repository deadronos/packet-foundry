import { describe, it, expect } from 'vitest';
import { createInitialState, buildContractBoard } from '../src/state/gameState.js';
import { refreshContractBoard, activateContract, isBoardExhausted } from '../src/core/contracts.js';
import { processTick } from '../src/core/tick.js';

describe('contract board', () => {
  it('refreshContractBoard populates 3 contracts', () => {
    const s = refreshContractBoard(createInitialState());
    expect(s.contracts).toHaveLength(3);
  });

  it('buildContractBoard is deterministic for the same seed', () => {
    const a = buildContractBoard(0, 42);
    const b = buildContractBoard(0, 42);
    expect(a.map((c) => c.name)).toEqual(b.map((c) => c.name));
  });

  it('buildContractBoard gives different results with different seeds', () => {
    const a = buildContractBoard(0, 1);
    const b = buildContractBoard(0, 9999);
    // Very unlikely to be identical
    expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id));
  });

  it('activateContract activates the selected contract', () => {
    let s = refreshContractBoard(createInitialState());
    const contractId = s.contracts[0].id;
    s = activateContract(s, contractId) ?? s;
    expect(s.activeContractId).toBe(contractId);
    expect(s.contracts[0].active).toBe(true);
  });

  it('cannot activate a second contract while one is active', () => {
    let s = refreshContractBoard(createInitialState());
    s = activateContract(s, s.contracts[0].id) ?? s;
    const result = activateContract(s, s.contracts[1].id);
    expect(result).toBeNull();
  });

  it('completing a contract awards rewards and clears activeContractId', () => {
    let s = createInitialState();
    const creditsBefore = s.resources.credits;
    s = {
      ...s,
      contracts: [
        {
          id: 'fast_contract',
          name: 'Fast',
          description: '',
          protocol: 'burst',
          targetPayload: 1,
          timeLimitSec: null,
          rewardCredits: 500,
          rewardFragments: 3,
          tier: 'mid',
          active: true,
          expired: false,
          progressPayload: 0,
          timeRemainingS: null,
        },
      ],
      activeContractId: 'fast_contract',
    };
    s = processTick(s);

    expect(s.completedContractCount).toBe(1);
    expect(s.resources.credits).toBeGreaterThan(creditsBefore + 499);
    expect(s.resources.fragments).toBeGreaterThanOrEqual(3);
    expect(s.activeContractId).toBeNull();
  });

  it('contract with time limit expires when time runs out', () => {
    let s = createInitialState();
    s = {
      ...s,
      contracts: [
        {
          id: 'timed_contract',
          name: 'Timed',
          description: '',
          protocol: 'burst',
          targetPayload: 999999, // unreachably large
          timeLimitSec: 2,
          rewardCredits: 100,
          rewardFragments: 0,
          tier: 'low',
          active: true,
          expired: false,
          progressPayload: 0,
          timeRemainingS: 2,
        },
      ],
      activeContractId: 'timed_contract',
    };
    s = processTick(s); // tick 1 — 1 second remaining
    s = processTick(s); // tick 2 — time runs out
    s = processTick(s); // tick 3 — should be expired

    const contract = s.contracts.find((c) => c.id === 'timed_contract')!;
    expect(contract.expired).toBe(true);
    expect(s.activeContractId).toBeNull();
  });

  it('isBoardExhausted returns true when all contracts are done/expired', () => {
    let s = createInitialState();
    s = {
      ...s,
      contracts: [
        {
          id: 'c1', name: 'C1', description: '', protocol: 'burst',
          targetPayload: 1, timeLimitSec: null, rewardCredits: 0, rewardFragments: 0,
          tier: 'low', active: false, expired: false, progressPayload: 1, timeRemainingS: null,
        },
        {
          id: 'c2', name: 'C2', description: '', protocol: 'burst',
          targetPayload: 1, timeLimitSec: null, rewardCredits: 0, rewardFragments: 0,
          tier: 'low', active: false, expired: true, progressPayload: 0, timeRemainingS: null,
        },
      ],
    };
    expect(isBoardExhausted(s)).toBe(true);
  });
});
