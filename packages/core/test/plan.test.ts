import { describe, expect, it } from 'vitest';
import { estimateTravel, explainOrder, planTrip, swapItem, type Plan } from '../src/index';
import { permutations, place, prefs, request } from './fixtures';

const allItems = (plan: Plan) => plan.days.flatMap((d) => d.items);
const ids = (plan: Plan) => allItems(plan).map((i) => i.placeId);

const sights = [
  place('A', 'sight', 0.001, 0.002),
  place('B', 'sight', -0.003, 0.004),
  place('C', 'sight', 0.004, -0.001),
  place('D', 'sight', -0.002, -0.004),
  place('E', 'sight', 0.006, 0.005),
];

describe('planTrip', () => {
  it('(a) keeps every mustVisit in the plan', () => {
    const places = [...sights, place('M1', 'meal', 0, 0), place('M2', 'meal', 0.001, 0)];
    const plan = planTrip(request({ mustVisit: ['A', 'C', 'E', 'M2'] }), prefs(), places);
    for (const id of ['A', 'C', 'E', 'M2']) {
      const item = allItems(plan).find((i) => i.placeId === id);
      expect(item, id).toBeDefined();
      expect(item!.mine).toBe(true);
    }
  });

  it('(b) keeps a mustVisit that is closed that weekday, marks it and warns', () => {
    // 2026-12-05 is a Saturday (6).
    const closed = place('X', 'sight', 0.001, 0.001, { closedDays: [6] });
    const plan = planTrip(request({ mustVisit: ['X'] }), prefs(), [closed, ...sights]);
    const item = allItems(plan).find((i) => i.placeId === 'X');
    expect(item).toBeDefined();
    expect(item!.status).toBe('closed');
    expect(plan.warnings.some((w) => w.includes('테스트 장소 X'))).toBe(true);
  });

  it('(b2) moves a mustVisit to a day when it is open, if the trip has one', () => {
    const closed = place('X', 'sight', 0.001, 0.001, { closedDays: [6] });
    const plan = planTrip(
      request({ endDate: '2026-12-06', mustVisit: ['X'] }),
      prefs(),
      [closed, ...sights],
    );
    expect(plan.days[1]!.items.some((i) => i.placeId === 'X')).toBe(true);
    expect(allItems(plan).find((i) => i.placeId === 'X')!.status).toBe('ok');
  });

  it('(c) keeps a fixed item at its exact time', () => {
    const places = [...sights, place('M1', 'meal', 0, 0), place('M2', 'meal', 0.001, 0)];
    const plan = planTrip(
      request({
        mustVisit: ['A', 'B'],
        fixed: [{ placeId: 'M1', date: '2026-12-05', start: '18:10', end: '19:40' }],
      }),
      prefs(),
      places,
    );
    const item = allItems(plan).find((i) => i.placeId === 'M1')!;
    expect(item.fixed).toBe(true);
    expect(item.start).toBe('18:10');
    expect(item.end).toBe('19:40');
    // No second dinner is added next to the fixed one.
    const dinners = allItems(plan).filter((i) => i.category === 'meal' && i.start >= '17:00');
    expect(dinners).toHaveLength(1);
  });

  it('(d) chooses the order with the least total travel for a 5-place day', () => {
    const plan = planTrip(request({ mustVisit: sights.map((s) => s.id) }), prefs(), sights);
    const day = plan.days[0]!;
    expect(day.items.map((i) => i.placeId).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);

    const total = (order: typeof sights) =>
      order.slice(1).reduce((sum, p, i) => sum + estimateTravel(order[i]!, p)!.minutes, 0);
    const all = permutations(sights).map(total);
    expect(all).toHaveLength(120);
    for (const t of all) expect(plan.totals.walkMinutes).toBeLessThanOrEqual(t);
    expect(plan.totals.walkMinutes).toBe(Math.min(...all));

    const legSum = day.items.reduce((s, i) => s + (i.legFromPrev?.minutes ?? 0), 0);
    expect(legSum).toBe(plan.totals.walkMinutes);

    const text = explainOrder(plan, 0);
    expect(text).toContain(`${plan.totals.walkMinutes}분`);
    expect(text).toContain(`${Math.max(...all) - Math.min(...all)}분`);
  });

  it('(d2) uses the heuristic for more than 7 free items and still visits all', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      place(`S${i}`, 'sight', ((i * 7) % 5) * 0.001, ((i * 3) % 4) * 0.001, { stayMinutes: 30 }),
    );
    const plan = planTrip(request({ mustVisit: many.map((m) => m.id) }), prefs(), many);
    expect(plan.days[0]!.order.method).toBe('heuristic');
    expect(ids(plan).sort()).toEqual(many.map((m) => m.id).sort());
  });

  it('(e) flags legs over the walk limit, and none when the limit is null', () => {
    const near = place('N', 'sight', 0, 0);
    const far = place('F', 'sight', 0.009, 0); // about 18 minutes away
    const req = request({ mustVisit: ['N', 'F'] });

    const limited = planTrip(req, prefs({ maxWalkMin: 10 }), [near, far]);
    const legs = allItems(limited).map((i) => i.legFromPrev).filter((l) => l !== null);
    expect(legs).toHaveLength(1);
    expect(legs[0]!.minutes).toBe(18);
    expect(legs[0]!.overLimit).toBe(true);
    expect(limited.warnings.some((w) => w.includes('10분'))).toBe(true);

    const loose = planTrip(req, prefs({ maxWalkMin: 20 }), [near, far]);
    expect(allItems(loose).every((i) => !i.legFromPrev?.overLimit)).toBe(true);

    const unlimited = planTrip(req, prefs({ maxWalkMin: null }), [near, far]);
    expect(allItems(unlimited).every((i) => !i.legFromPrev?.overLimit)).toBe(true);
  });

  it('(f) offers alternatives of the same category that are not already in the plan', () => {
    const places = [
      ...sights,
      place('F', 'sight', 0.002, 0.002),
      place('G', 'sight', -0.001, 0.001),
      place('M1', 'meal', 0, 0),
      place('M2', 'meal', 0.001, 0),
      place('M3', 'meal', 0, 0.001),
      place('M4', 'meal', -0.001, 0),
      place('M5', 'meal', 0.002, -0.001),
      place('M6', 'meal', 0, 0.002, { closedDays: [6] }),
      place('K1', 'cafe', 0.001, 0.001),
      place('K2', 'cafe', -0.001, -0.001),
    ];
    const plan = planTrip(request({ mustVisit: ['A'] }), prefs(), places);
    const inPlan = new Set(ids(plan));
    const byId = new Map(places.map((p) => [p.id, p]));
    const withAlts = allItems(plan).filter((i) => i.alternatives.length > 0);
    expect(withAlts.length).toBeGreaterThan(0);
    for (const item of allItems(plan)) {
      if (item.mine || item.fixed) expect(item.alternatives).toEqual([]);
      expect(item.alternatives.length).toBeLessThanOrEqual(3);
      for (const alt of item.alternatives) {
        expect(byId.get(alt.placeId)!.category).toBe(item.category);
        expect(inPlan.has(alt.placeId)).toBe(false);
        expect(alt.placeId).not.toBe('M6'); // closed on Saturday
        expect(alt.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('puts meals in the meal windows and the stay at the day edges', () => {
    const places = [
      ...sights,
      place('H', 'stay', 0, 0, { stayMinutes: null, costPerPerson: 50000 }),
      place('M1', 'meal', 0, 0.001),
      place('M2', 'meal', 0.001, 0),
      place('M3', 'meal', 0, -0.001),
      place('M4', 'meal', -0.001, 0),
    ];
    const plan = planTrip(
      request({ endDate: '2026-12-06', stayId: 'H', mustVisit: ['A', 'B'] }),
      prefs(),
      places,
    );
    expect(plan.days).toHaveLength(2);
    expect(plan.days[0]!.items.at(-1)!.placeId).toBe('H');
    expect(plan.days[1]!.items[0]!.placeId).toBe('H');
    for (const day of plan.days) {
      const meals = day.items.filter((i) => i.category === 'meal');
      expect(meals).toHaveLength(2);
      expect(meals[0]!.start >= '11:30' && meals[0]!.start <= '13:30').toBe(true);
      expect(meals[1]!.start >= '17:30' && meals[1]!.start <= '19:30').toBe(true);
      for (let i = 1; i < day.items.length; i++) {
        expect(day.items[i]!.start >= day.items[i - 1]!.end).toBe(true);
      }
    }
    // The stay is charged once per night, not once per appearance.
    expect(plan.totals.costPerPerson).toBe(50000);
  });

  it('marks an unverified place as unverified', () => {
    const u = place('U', 'sight', 0, 0, {
      verification: { status: 'unverified', checkedAt: null, sources: [], notes: null },
    });
    const plan = planTrip(request({ mustVisit: ['U'] }), prefs(), [u]);
    expect(allItems(plan)[0]!.status).toBe('unverified');
  });

  it('never invents a travel time for a place without coordinates', () => {
    const unknown = place('Q', 'sight', 0, 0, { lat: null, lng: null });
    const plan = planTrip(request({ mustVisit: ['A', 'Q'] }), prefs(), [sights[0]!, unknown]);
    expect(ids(plan).sort()).toEqual(['A', 'Q']);
    expect(allItems(plan).every((i) => i.legFromPrev === null)).toBe(true);
    expect(plan.totals.walkMinutes).toBe(0);
    expect(plan.warnings.some((w) => w.includes('계산하지 못했다'))).toBe(true);
  });

  it('warns instead of dropping silently when a mustVisit id is unknown', () => {
    const plan = planTrip(request({ mustVisit: ['A', 'nope'] }), prefs(), sights);
    expect(ids(plan)).toContain('A');
    expect(plan.warnings.some((w) => w.includes('nope'))).toBe(true);
  });
});

describe('swapItem', () => {
  const places = [
    ...sights,
    place('M1', 'meal', 0, 0, { costPerPerson: 12000 }),
    place('M2', 'meal', 0.002, 0, { costPerPerson: 9000 }),
    place('M3', 'meal', 0, 0.003, { costPerPerson: 20000 }),
    place('M4', 'meal', -0.002, 0, { costPerPerson: 15000 }),
  ];
  const req = request({
    mustVisit: ['A'],
    fixed: [{ placeId: 'M1', date: '2026-12-05', start: '18:00', end: '19:00' }],
  });
  const ctx = { request: req, prefs: prefs({ maxWalkMin: 10 }), places };
  const plan = planTrip(req, ctx.prefs, places);
  const day = plan.days[0]!;
  const lunchIndex = day.items.findIndex((i) => i.category === 'meal' && !i.fixed);

  it('changes totals by the stated delta and lists the replaced place', () => {
    const item = day.items[lunchIndex]!;
    expect(item.alternatives.length).toBeGreaterThan(0);
    for (const alt of item.alternatives) {
      const next = swapItem(plan, 0, lunchIndex, alt.placeId, ctx);
      expect(next.totals.walkMinutes).toBe(plan.totals.walkMinutes + alt.delta.walkMinutes);
      expect(next.totals.costPerPerson).toBe(plan.totals.costPerPerson + alt.delta.costPerPerson);
      const swapped = next.days[0]!.items[lunchIndex]!;
      expect(swapped.placeId).toBe(alt.placeId);
      expect(swapped.alternatives.map((a) => a.placeId)).toContain(item.placeId);
      const legSum = next.days[0]!.items.reduce((s, i) => s + (i.legFromPrev?.minutes ?? 0), 0);
      expect(legSum).toBe(next.totals.walkMinutes);
    }
    expect(item.alternatives.some((a) => a.delta.costPerPerson !== 0)).toBe(true);
  });

  it('does not mutate the input plan', () => {
    const before = structuredClone(plan);
    const alt = day.items[lunchIndex]!.alternatives[0]!;
    const next = swapItem(plan, 0, lunchIndex, alt.placeId, ctx);
    expect(plan).toEqual(before);
    expect(next).not.toBe(plan);
    expect(next.days[0]!.items[lunchIndex]).not.toBe(day.items[lunchIndex]);
  });

  it('throws for a mine or fixed item, and for an id that is not an alternative', () => {
    const mineIndex = day.items.findIndex((i) => i.mine);
    const fixedIndex = day.items.findIndex((i) => i.fixed);
    expect(() => swapItem(plan, 0, mineIndex, 'B', ctx)).toThrow(/꼭 갈 곳/);
    expect(() => swapItem(plan, 0, fixedIndex, 'M2', ctx)).toThrow(/시간을 정한/);
    expect(() => swapItem(plan, 0, lunchIndex, 'A', ctx)).toThrow();
    expect(() => swapItem(plan, 3, 0, 'M2', ctx)).toThrow();
  });
});
