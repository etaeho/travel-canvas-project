import { describe, expect, it } from 'vitest';
import { mergePrefs, type Prefs } from '../src/index';

const defaults: Prefs = {
  maxWalkMin: 15,
  maxWaitMin: 30,
  hasCar: false,
  likes: ['한식', '산책'],
  mood: ['조용한'],
};

describe('mergePrefs', () => {
  it('inherits defaults when a key is absent', () => {
    const { effective, overriddenKeys } = mergePrefs(defaults, {});
    expect(effective).toEqual(defaults);
    expect(overriddenKeys).toEqual([]);
  });

  it('replaces a key that is present', () => {
    const { effective } = mergePrefs(defaults, { maxWalkMin: 10, hasCar: true });
    expect(effective.maxWalkMin).toBe(10);
    expect(effective.hasCar).toBe(true);
    expect(effective.maxWaitMin).toBe(30);
  });

  it('keeps null as "no limit this trip"', () => {
    const { effective, overriddenKeys } = mergePrefs(defaults, { maxWalkMin: null });
    expect(effective.maxWalkMin).toBeNull();
    expect(overriddenKeys).toEqual(['maxWalkMin']);
  });

  it('replaces arrays whole and never merges them', () => {
    const { effective } = mergePrefs(defaults, { likes: ['카페'] });
    expect(effective.likes).toEqual(['카페']);
    expect(mergePrefs(defaults, { likes: [] }).effective.likes).toEqual([]);
  });

  it('lists overridden keys, even when the value equals the default', () => {
    const { overriddenKeys } = mergePrefs(defaults, { maxWaitMin: 30, mood: ['활기찬'] });
    expect(overriddenKeys.sort()).toEqual(['maxWaitMin', 'mood']);
  });

  it('does not mutate or share arrays with its inputs', () => {
    const over = { likes: ['카페'] };
    const { effective } = mergePrefs(defaults, over);
    effective.likes.push('x');
    effective.mood.push('y');
    expect(over.likes).toEqual(['카페']);
    expect(defaults.mood).toEqual(['조용한']);
  });
});
