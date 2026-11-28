import { describe, expect, it } from 'vitest';
import { mergePrefs, planTrip } from '@needed/core';
import { DEFAULT_PREFS, DEFAULT_REQUEST, PLACES, nameOf } from '../data';
import { costView, unknownLegCount } from './cost';
import { buildRequest, draftFromRequest, pickProblems, setOverride, tripProblems } from './draft';

const GALBI = 'gj-yeongyang-sutbul-galbi';

describe('draft', () => {
  it('starts from the family request with the fixed dinner as a pick', () => {
    const draft = draftFromRequest(DEFAULT_REQUEST);
    expect(draft.startDate).toBe('2026-12-05');
    expect(draft.count).toBe(5);
    expect(draft.withElder).toBe(true);
    expect(draft.arriveAt).toBe('16:30');
    expect(draft.leaveBy).toBe('');
    expect(draft.picks).toEqual([
      { placeId: GALBI, fixed: { date: '2026-12-05', start: '18:00', end: '19:30' } },
    ]);
  });

  it('builds a request the planner accepts, and leaves unknown times out', () => {
    const request = buildRequest(draftFromRequest(DEFAULT_REQUEST));
    expect(request.fixed).toEqual(DEFAULT_REQUEST.fixed);
    expect(request.mustVisit).toEqual([GALBI]);
    expect(request.arriveAt).toBe('16:30');
    expect('leaveBy' in request).toBe(false);
    const plan = planTrip(request, DEFAULT_PREFS, PLACES);
    const dinner = plan.days[0]!.items.find((i) => i.placeId === GALBI);
    expect(dinner?.start).toBe('18:00');
    expect(dinner?.fixed).toBe(true);
    expect(dinner?.mine).toBe(true);
  });

  it('keeps a pick without a time as a must-visit only', () => {
    const draft = draftFromRequest(DEFAULT_REQUEST);
    draft.picks.push({ placeId: 'gj-bulguksa', fixed: null });
    const request = buildRequest(draft);
    expect(request.mustVisit).toEqual([GALBI, 'gj-bulguksa']);
    expect(request.fixed).toHaveLength(1);
  });

  it('finds problems on the trip screen', () => {
    const draft = draftFromRequest(DEFAULT_REQUEST);
    expect(tripProblems(draft)).toEqual([]);
    expect(tripProblems({ ...draft, endDate: '2026-12-04' })).toHaveLength(1);
    expect(tripProblems({ ...draft, count: 0 })).toHaveLength(1);
  });

  it('finds problems with a fixed time', () => {
    const draft = draftFromRequest(DEFAULT_REQUEST);
    expect(pickProblems(draft, nameOf)).toEqual([]);
    draft.picks[0]!.fixed = { date: '2026-12-09', start: '19:00', end: '18:00' };
    const problems = pickProblems(draft, nameOf);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('영양숯불갈비');
  });

  it('marks only the switched-on keys as this-trip-only', () => {
    let overrides = setOverride({}, 'maxWaitMin', 40);
    overrides = setOverride(overrides, 'maxWalkMin', null);
    expect(mergePrefs(DEFAULT_PREFS, overrides).overriddenKeys.sort()).toEqual(['maxWaitMin', 'maxWalkMin']);
    overrides = setOverride(overrides, 'maxWalkMin', undefined);
    const merged = mergePrefs(DEFAULT_PREFS, overrides);
    expect(merged.overriddenKeys).toEqual(['maxWaitMin']);
    expect(merged.effective.maxWalkMin).toBe(DEFAULT_PREFS.maxWalkMin);
  });
});

describe('costView', () => {
  const request = buildRequest({ ...draftFromRequest(DEFAULT_REQUEST), stayId: 'gj-hwangnamgwan' });
  const plan = planTrip(request, DEFAULT_PREFS, PLACES);
  const view = costView(plan, PLACES);

  it('adds up to the total the planner gives', () => {
    expect(view.matchesPlan).toBe(true);
  });
  it('lists places with no known cost instead of counting them as free', () => {
    const names = view.rows.flatMap((r) => r.unknown);
    expect(names).toContain('영양숯불갈비');
    expect(names.filter((n) => n === '황남관 한옥마을')).toHaveLength(1);
    expect(view.unknownCount).toBe(names.length);
  });
  it('counts legs with no known time, not the first stop of a day', () => {
    const expected = plan.days.reduce(
      (s, d) => s + d.items.slice(1).filter((i) => i.legFromPrev === null).length,
      0,
    );
    expect(unknownLegCount(plan)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });
});
