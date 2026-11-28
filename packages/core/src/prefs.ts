import type { Prefs } from './types';

export type PrefsOverrides = Partial<Prefs>;

/**
 * Trip preferences = defaults + this trip's overrides.
 * Absent key: inherit. Present key: replace (arrays whole). null: no limit this trip.
 */
export function mergePrefs(
  defaults: Prefs,
  overrides: PrefsOverrides,
): { effective: Prefs; overriddenKeys: (keyof Prefs)[] } {
  const effective: Prefs = { ...defaults, likes: [...defaults.likes], mood: [...defaults.mood] };
  const overriddenKeys: (keyof Prefs)[] = [];
  for (const key of Object.keys(defaults) as (keyof Prefs)[]) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
    const value = overrides[key];
    if (value === undefined) continue;
    (effective as unknown as Record<string, unknown>)[key] = Array.isArray(value) ? [...value] : value;
    overriddenKeys.push(key);
  }
  return { effective, overriddenKeys };
}
