import { describe, expect, it } from 'vitest';
import { explainOrder, mergePrefs, planTrip, swapItem, type Plan } from '../src/index';
import { place, prefs, request } from './fixtures';

// Charter phase 1 scene, run on synthetic places. Real Gyeongju data lives in data/.
const places = [
  place('숙소', 'stay', 0, 0, { stayMinutes: null, costPerPerson: 60000 }),
  place('명소1', 'sight', 0.001, 0.001, { costPerPerson: 3000 }),
  place('명소2', 'sight', 0.012, 0.002, { costPerPerson: 2000 }), // far from everything else
  place('명소3', 'sight', -0.001, 0.002, { costPerPerson: 0 }),
  place('명소4', 'sight', 0.002, -0.001, { costPerPerson: 1000 }),
  place('명소5', 'sight', -0.002, -0.001, { costPerPerson: 0 }),
  place('명소6', 'sight', 0.001, -0.002, { costPerPerson: 4000 }),
  place('명소7', 'sight', -0.001, -0.002, { costPerPerson: 0, closedDays: [0] }),
  place('체험1', 'activity', 0.002, 0.002, { costPerPerson: 15000, stayMinutes: 90 }),
  place('식당1', 'meal', 0.001, 0, { costPerPerson: 18000 }),
  place('식당2', 'meal', 0, 0.001, { costPerPerson: 12000 }),
  place('식당3', 'meal', -0.001, 0, { costPerPerson: 9000 }),
  place('식당4', 'meal', 0, -0.001, { costPerPerson: 15000 }),
  place('식당5', 'meal', 0.002, 0.001, { costPerPerson: 25000 }),
  place('식당6', 'meal', -0.002, 0.001, { costPerPerson: 11000 }),
  place('카페1', 'cafe', 0.001, 0.002, { costPerPerson: 6000 }),
  place('카페2', 'cafe', -0.001, 0.001, { costPerPerson: 5000 }),
  place('카페3', 'cafe', 0, 0.002, {
    costPerPerson: 7000,
    verification: { status: 'unverified', checkedAt: null, sources: [], notes: null },
  }),
];

const req = request({
  city: '경주',
  startDate: '2026-12-05', // Saturday
  endDate: '2026-12-06', // Sunday
  party: { count: 5, withElder: true },
  stayId: '숙소',
  mustVisit: ['명소1', '명소2'],
  fixed: [{ placeId: '식당1', date: '2026-12-05', start: '18:00', end: '19:30' }],
});

const { effective } = mergePrefs(prefs({ maxWalkMin: 20 }), { maxWalkMin: 10 });
const ctx = { request: req, prefs: effective, places };

const items = (plan: Plan) => plan.days.flatMap((d) => d.items);

describe('경주 가족 여행', () => {
  const plan = planTrip(req, effective, places);

  it('② produces a plan for both days', () => {
    expect(plan.days.map((d) => d.date)).toEqual(['2026-12-05', '2026-12-06']);
    for (const day of plan.days) {
      expect(day.items.length).toBeGreaterThanOrEqual(4);
      expect(day.items.filter((i) => i.category === 'meal')).toHaveLength(2);
      expect(explainOrder(plan, plan.days.indexOf(day))).toMatch(/분/);
    }
    expect(plan.days[0]!.items.at(-1)!.placeId).toBe('숙소');
    expect(plan.days[1]!.items[0]!.placeId).toBe('숙소');
    const dinner = items(plan).find((i) => i.placeId === '식당1')!;
    expect([dinner.start, dinner.end, dinner.fixed]).toEqual(['18:00', '19:30', true]);
    expect(plan.totals.costPerPerson).toBeGreaterThan(60000);
  });

  it('③ misses no mustVisit', () => {
    for (const id of req.mustVisit) {
      const found = items(plan).filter((i) => i.placeId === id);
      expect(found, id).toHaveLength(1);
      expect(found[0]!.mine).toBe(true);
    }
  });

  it('④ flags every leg over the 10-minute limit, and only those', () => {
    const legs = items(plan).flatMap((i) => (i.legFromPrev ? [i.legFromPrev] : []));
    expect(legs.length).toBeGreaterThan(0);
    for (const leg of legs) expect(leg.overLimit).toBe(leg.minutes > 10);
    // 명소2 is more than 10 minutes from every other place at elder pace.
    expect(legs.some((l) => l.overLimit)).toBe(true);
    expect(plan.warnings.some((w) => w.includes('테스트 장소 명소2') && w.includes('10분'))).toBe(true);
    expect(plan.totals.walkMinutes).toBe(legs.reduce((s, l) => s + l.minutes, 0));
  });

  it('⑤ changes walk and cost totals when an item is swapped', () => {
    let swaps = 0;
    let walkChanged = false;
    let costChanged = false;
    plan.days.forEach((day, d) =>
      day.items.forEach((item, i) => {
        for (const alt of item.alternatives) {
          const next = swapItem(plan, d, i, alt.placeId, ctx);
          expect(next.totals.walkMinutes).toBe(plan.totals.walkMinutes + alt.delta.walkMinutes);
          expect(next.totals.costPerPerson).toBe(plan.totals.costPerPerson + alt.delta.costPerPerson);
          for (const id of req.mustVisit) {
            expect(next.days.flatMap((x) => x.items).some((x) => x.placeId === id)).toBe(true);
          }
          walkChanged ||= next.totals.walkMinutes !== plan.totals.walkMinutes;
          costChanged ||= next.totals.costPerPerson !== plan.totals.costPerPerson;
          swaps++;
        }
      }),
    );
    expect(swaps).toBeGreaterThan(0);
    expect(walkChanged).toBe(true);
    expect(costChanged).toBe(true);
  });
});
