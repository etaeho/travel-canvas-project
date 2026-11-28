import type { Prefs } from '@needed/core';
import type { Draft } from './draft';

const PREFS_KEY = 'needed.prefs.v1';
const DRAFT_KEY = 'needed.draft.v1';

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked. The app still works for this visit.
  }
}

const isPrefs = (v: unknown): v is Prefs => {
  const p = v as Prefs | null;
  return (
    !!p &&
    (p.maxWalkMin === null || typeof p.maxWalkMin === 'number') &&
    (p.maxWaitMin === null || typeof p.maxWaitMin === 'number') &&
    typeof p.hasCar === 'boolean' &&
    Array.isArray(p.likes) &&
    Array.isArray(p.mood)
  );
};

const isDraft = (v: unknown): v is Draft => {
  const d = v as Draft | null;
  return (
    !!d &&
    typeof d.startDate === 'string' &&
    typeof d.endDate === 'string' &&
    typeof d.count === 'number' &&
    Array.isArray(d.picks) &&
    typeof d.overrides === 'object' &&
    d.overrides !== null
  );
};

export function loadPrefs(): Prefs | null {
  const v = read<unknown>(PREFS_KEY);
  return isPrefs(v) ? v : null;
}
export const savePrefs = (prefs: Prefs): void => write(PREFS_KEY, prefs);

export function loadDraft(): Draft | null {
  const v = read<unknown>(DRAFT_KEY);
  return isDraft(v) ? v : null;
}
export const saveDraft = (draft: Draft): void => write(DRAFT_KEY, draft);
