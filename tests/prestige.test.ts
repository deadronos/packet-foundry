import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/state/gameState.js';
import { processTick } from '../src/core/tick.js';
import { calculateReputationGain, canPrestige, applyPrestige, buyMetaPerk, availableReputation } from '../src/core/prestige.js';

describe('prestige', () => {
  it('canPrestige returns false before 3000 payload threshold', () => {
    const s = createInitialState();
    expect(canPrestige(s)).toBe(false);
  });

  it('canPrestige returns true after reaching 3000 total payload', () => {
    let s = createInitialState();
    // Use many small ticks for realistic queue dynamics
    for (let i = 0; i < 400; i++) s = processTick(s, 1);
    expect(s.stats.totalPayloadProduced).toBeGreaterThan(0);
    if (s.stats.totalPayloadProduced >= 3000) {
      expect(canPrestige(s)).toBe(true);
    }
    // Alternatively verify with even more ticks
    for (let i = 0; i < 600; i++) s = processTick(s, 1);
    expect(canPrestige(s)).toBe(true);
  });

  it('calculateReputationGain returns at least 1', () => {
    const s = createInitialState();
    expect(calculateReputationGain(s)).toBeGreaterThanOrEqual(1);
  });

  it('calculateReputationGain scales with total payload', () => {
    let sLow = createInitialState();
    sLow = processTick(sLow, 1000);
    let sHigh = createInitialState();
    sHigh = processTick(sHigh, 5000);
    expect(calculateReputationGain(sHigh)).toBeGreaterThan(calculateReputationGain(sLow));
  });

  it('applyPrestige resets run-state', () => {
    let s = createInitialState();
    s = processTick(s, 3000);
    // Give some credits
    s = { ...s, resources: { ...s.resources, credits: 9999 } };

    const after = applyPrestige(s);

    // Run state reset
    expect(after.resources.credits).toBe(0);
    expect(after.stats.totalPayloadProduced).toBe(0);
    expect(after.tickCount).toBe(0);
  });

  it('applyPrestige preserves meta progress', () => {
    let s = createInitialState();
    s = processTick(s, 3000);
    const repGain = calculateReputationGain(s);

    const after = applyPrestige(s);

    expect(after.meta.prestigeCount).toBe(1);
    expect(after.meta.totalReputation).toBeGreaterThanOrEqual(repGain);
  });

  it('applyPrestige preserves purchased meta perks', () => {
    let s = createInitialState();
    s = processTick(s, 3000);
    s = applyPrestige(s);
    // Buy a perk
    const withPerk = buyMetaPerk(s, 'perk_throughput_boost');
    expect(withPerk).not.toBeNull();
    if (!withPerk) return;

    // Prestige again — perk should persist
    s = processTick(withPerk, 3000);
    const after2 = applyPrestige(s);
    expect(after2.meta.perks['perk_throughput_boost']).toBe(1);
  });

  it('buyMetaPerk deducts reputation and sets perk level', () => {
    let s = createInitialState();
    s = processTick(s, 3000);
    s = applyPrestige(s); // rep available now

    const repBefore = availableReputation(s);
    const result = buyMetaPerk(s, 'perk_throughput_boost');
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.meta.perks['perk_throughput_boost']).toBe(1);
    expect(availableReputation(result)).toBeLessThan(repBefore);
  });

  it('buyMetaPerk returns null if insufficient reputation', () => {
    const s = createInitialState(); // 0 reputation
    const result = buyMetaPerk(s, 'perk_throughput_boost');
    expect(result).toBeNull();
  });

  it('buyMetaPerk returns null if perk already at max level', () => {
    let s = createInitialState();
    s = processTick(s, 100000); // huge payload for lots of rep
    s = applyPrestige(s);

    // Buy to max (maxLevel = 3)
    for (let i = 0; i < 3; i++) {
      s = buyMetaPerk(s, 'perk_throughput_boost') ?? s;
    }
    expect(s.meta.perks['perk_throughput_boost']).toBe(3);
    const result = buyMetaPerk(s, 'perk_throughput_boost');
    expect(result).toBeNull();
  });

  it('Head Start perk grants extra lane after prestige', () => {
    let s = createInitialState();
    s = processTick(s, 100000);
    s = applyPrestige(s);

    s = buyMetaPerk(s, 'perk_head_start') ?? s;
    const after = applyPrestige(s);
    expect(after.lanes).toHaveLength(2);
  });

  it('prestige increments run count correctly', () => {
    let s = createInitialState();
    for (let run = 1; run <= 3; run++) {
      s = processTick(s, 3000);
      s = applyPrestige(s);
      expect(s.meta.prestigeCount).toBe(run);
    }
  });
});
