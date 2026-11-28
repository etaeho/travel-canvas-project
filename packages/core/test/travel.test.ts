import { describe, expect, it } from 'vitest';
import { estimateTravel } from '../src/index';

// 0.009 degrees of latitude is about 1,000.8 m on a 6,371 km sphere.
const a = { lat: 35.0, lng: 129.0 };
const b = { lat: 35.009, lng: 129.0 };

describe('estimateTravel', () => {
  it('applies the 1.3 detour factor to a known distance', () => {
    const t = estimateTravel(a, b);
    expect(t).not.toBeNull();
    expect(Math.abs(t!.meters - 1301)).toBeLessThanOrEqual(2);
    expect(t!.minutes).toBe(18); // 1.301 km at 4.5 km/h = 17.3 min, rounded up
    expect(t!.mode).toBe('walk');
    expect(t!.source).toBe('estimate');
  });

  it('is slower with an elder', () => {
    const t = estimateTravel(a, b, { withElder: true });
    expect(t!.minutes).toBe(23); // 1.301 km at 3.5 km/h = 22.3 min
  });

  it('returns null when coordinates are missing', () => {
    expect(estimateTravel({ lat: null, lng: null }, b)).toBeNull();
    expect(estimateTravel(a, { lat: 35, lng: null })).toBeNull();
  });

  it('returns zero for the same point', () => {
    expect(estimateTravel(a, a)!.minutes).toBe(0);
  });
});
