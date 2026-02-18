import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/state/gameState.js';
import { processTick } from '../src/core/tick.js';

describe('processTick', () => {
  it('is deterministic — same state produces identical next state', () => {
    const s0 = createInitialState();
    const s1a = processTick(s0);
    const s1b = processTick(s0);

    // Serialise excluding Set (which compares by reference)
    const serialise = (s: ReturnType<typeof processTick>) =>
      JSON.stringify(s, (_k, v) => (v instanceof Set ? [...v].sort() : v));

    expect(serialise(s1a)).toEqual(serialise(s1b));
  });

  it('increments tickCount by 1 per tick', () => {
    let s = createInitialState();
    s = processTick(s);
    expect(s.tickCount).toBe(1);
    s = processTick(s);
    expect(s.tickCount).toBe(2);
  });

  it('generates scrap and converts to payload/credits', () => {
    let s = createInitialState();
    // Run 10 ticks
    for (let i = 0; i < 10; i++) s = processTick(s);
    expect(s.stats.totalPayloadProduced).toBeGreaterThan(0);
    expect(s.stats.totalCreditsEarned).toBeGreaterThan(0);
  });

  it('accumulates playtime correctly', () => {
    let s = createInitialState();
    for (let i = 0; i < 5; i++) s = processTick(s, 1);
    expect(s.stats.playtimeSec).toBe(5);
  });

  it('offline replay (deltaSeconds > 1) yields comparable output to many single ticks', () => {
    const base = createInitialState();

    // Simulate 60 seconds via 60 × 1-second ticks
    let s60x1 = base;
    for (let i = 0; i < 60; i++) s60x1 = processTick(s60x1, 1);

    // Simulate 60 seconds via 1 × 60-second chunk
    const s1x60 = processTick(base, 60);

    // Single-chunk replay applies latency penalty at the chunk's peak queue;
    // fine-grained ticks benefit from lower early-tick penalties — allow 20% tolerance
    const diff = Math.abs(s60x1.stats.totalPayloadProduced - s1x60.stats.totalPayloadProduced);
    const avg = (s60x1.stats.totalPayloadProduced + s1x60.stats.totalPayloadProduced) / 2;
    expect(diff / avg).toBeLessThan(0.2);
    // Both should produce meaningful payload
    expect(s60x1.stats.totalPayloadProduced).toBeGreaterThan(100);
    expect(s1x60.stats.totalPayloadProduced).toBeGreaterThan(100);
  });

  it('sets prestigeReadyAt once totalPayloadProduced >= 3000', () => {
    let s = createInitialState();
    expect(s.stats.prestigeReadyAt).toBeNull();
    // With base 5 scrap/sec and decrypt module, output ~5 payload/sec
    // 3000 payload requires ~600 ticks
    for (let i = 0; i < 700; i++) s = processTick(s, 1);
    expect(s.stats.totalPayloadProduced).toBeGreaterThan(3000);
    expect(s.stats.prestigeReadyAt).not.toBeNull();
  });

  it('does not mutate the input state', () => {
    const original = createInitialState();
    const originalPayload = original.stats.totalPayloadProduced;
    processTick(original);
    expect(original.stats.totalPayloadProduced).toBe(originalPayload);
  });

  it('auto-completes contract when progressPayload reaches target', () => {
    let s = createInitialState();
    // Manually insert a tiny contract
    s = {
      ...s,
      contracts: [
        {
          id: 'test_contract',
          name: 'Test',
          description: '',
          protocol: 'burst',
          targetPayload: 1, // trivially small
          timeLimitSec: null,
          rewardCredits: 100,
          rewardFragments: 2,
          tier: 'low',
          active: true,
          expired: false,
          progressPayload: 0,
          timeRemainingS: null,
        },
      ],
      activeContractId: 'test_contract',
    };

    s = processTick(s);
    expect(s.completedContractCount).toBe(1);
    expect(s.resources.credits).toBeGreaterThanOrEqual(100);
    expect(s.activeContractId).toBeNull();
  });
});
