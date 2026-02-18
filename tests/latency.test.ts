import { describe, it, expect } from 'vitest';
import { calculateLatency } from '../src/core/latency.js';

describe('calculateLatency', () => {
  it('returns penalty of 1.0 with no modules and empty queue', () => {
    const { penalty } = calculateLatency(0, 0);
    expect(penalty).toBeCloseTo(1.0);
  });

  it('penalty starts dropping after 3 active modules', () => {
    const { penalty: p3 } = calculateLatency(3, 0);
    const { penalty: p4 } = calculateLatency(4, 0);
    const { penalty: p5 } = calculateLatency(5, 0);

    expect(p3).toBeCloseTo(1.0);
    expect(p4).toBeLessThan(p3);
    expect(p5).toBeLessThan(p4);
  });

  it('congested queue reduces penalty proportionally', () => {
    const { penalty: p0 } = calculateLatency(2, 0);
    const { penalty: p100 } = calculateLatency(2, 100);
    const { penalty: p500 } = calculateLatency(2, 500);

    expect(p0).toBeGreaterThan(p100);
    expect(p100).toBeGreaterThan(p500);
  });

  it('penalty never falls below 0.1 (floor)', () => {
    const { penalty } = calculateLatency(10, 10000);
    expect(penalty).toBeGreaterThanOrEqual(0.1);
  });

  it('penalty never exceeds 1.0', () => {
    const { penalty } = calculateLatency(0, 0);
    expect(penalty).toBeLessThanOrEqual(1.0);
  });

  it('queue tolerance offsets congestion penalty', () => {
    const { penalty: withoutTolerance } = calculateLatency(2, 100, 0);
    const { penalty: withTolerance }    = calculateLatency(2, 100, 100);
    expect(withTolerance).toBeGreaterThan(withoutTolerance);
  });

  it('latencyReductionPct improves penalty', () => {
    const { penalty: base }    = calculateLatency(4, 50, 0, 0);
    const { penalty: reduced } = calculateLatency(4, 50, 0, 0.3);
    expect(reduced).toBeGreaterThan(base);
  });

  it('latencyMs increases with more modules and queue depth', () => {
    const { latencyMs: ms1 } = calculateLatency(1, 0);
    const { latencyMs: ms3 } = calculateLatency(3, 0);
    const { latencyMs: ms3q } = calculateLatency(3, 100);

    expect(ms3).toBeGreaterThan(ms1);
    expect(ms3q).toBeGreaterThan(ms3);
  });
});
