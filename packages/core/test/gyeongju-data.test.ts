// Runs the planner on the data team's file. Asserts only what stays true when the data is edited.
import { describe, expect, it } from 'vitest';
import raw from '../../../data/gyeongju/places.json';
import trip from '../../../data/gyeongju/trip-2026-12-05.json';
import { explainOrder, planTrip, type Place, type Plan, type Prefs, type TripRequest } from '../src/index';

const places = raw as unknown as Place[];
declare const console: { log(...args: unknown[]): void };

const req: TripRequest = {
  city: '경주',
  startDate: '2026-12-05',
  endDate: '2026-12-06',
  party: { count: 5, withElder: true },
  budgetPerPerson: null,
  stayId: null,
  mustVisit: ['gj-bulguksa', 'gj-daereungwon', 'gj-donggung-wolji'],
  fixed: [],
};
const prefs: Prefs = { maxWalkMin: 10, maxWaitMin: null, hasCar: true, likes: [], mood: [] };

/** Set PRINT_PLAN=1 to read the plan: PRINT_PLAN=1 npm test */
function print(plan: Plan): string {
  const lines: string[] = [];
  plan.days.forEach((day, d) => {
    lines.push(`■ ${day.date}`);
    for (const i of day.items) {
      const leg = i.legFromPrev
        ? `${i.legFromPrev.mode === 'car' ? '차' : '걸어서'} ${i.legFromPrev.minutes}분`
        : '-';
      const marks = [i.mine ? '꼭 갈 곳' : '', i.fixed ? '시간 고정' : '', i.status !== 'ok' ? i.status : '']
        .filter(Boolean)
        .join(', ');
      lines.push(`  ${i.start}~${i.end}  ${i.name}  [${i.category}]  이동: ${leg}${marks ? `  (${marks})` : ''}`);
      for (const a of i.alternatives) lines.push(`      대안: ${a.name} — ${a.reason}`);
    }
    lines.push(`  ${explainOrder(plan, d)}`);
  });
  lines.push(`합계: 걸어서 ${plan.totals.walkMinutes}분, 차로 ${plan.totals.driveMinutes}분, 한 사람 ${plan.totals.costPerPerson}원`);
  for (const w of plan.warnings) lines.push(`경고: ${w}`);
  return lines.join('\n');
}

describe('data/gyeongju/places.json', () => {
  const plan = planTrip(req, prefs, places);
  const items = plan.days.flatMap((d) => d.items);
  const byId = new Map(places.map((p) => [p.id, p]));

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (env?.PRINT_PLAN) console.log(print(plan));

  it('produces a plan for both days', () => {
    expect(plan.days.map((d) => d.date)).toEqual(['2026-12-05', '2026-12-06']);
    expect(items.length).toBeGreaterThanOrEqual(req.mustVisit.length);
    plan.days.forEach((_, d) => expect(explainOrder(plan, d)).toMatch(/분/));
  });

  it('keeps every must-visit', () => {
    for (const id of req.mustVisit) {
      const found = items.filter((i) => i.placeId === id);
      expect(found, id).toHaveLength(1);
      expect(found[0]!.mine).toBe(true);
    }
  });

  it('auto-picks nothing tagged 어르신주의', () => {
    const picked = items.filter((i) => !i.mine && !i.fixed);
    for (const i of picked) expect(byId.get(i.placeId)!.tags, i.name).not.toContain('어르신주의');
    for (const a of items.flatMap((i) => i.alternatives)) {
      expect(byId.get(a.placeId)!.tags, a.name).not.toContain('어르신주의');
    }
  });

  it('warns about missing coordinates while any place lacks them', () => {
    const missing = places.some((p) => p.lat === null || p.lng === null);
    expect(plan.warnings.some((w) => w.includes('좌표'))).toBe(missing);
  });

  it('never flags a leg as over the limit when the party has a car', () => {
    expect(items.every((i) => !i.legFromPrev?.overLimit)).toBe(true);
  });
});

describe('data/gyeongju/trip-2026-12-05.json', () => {
  const tripReq = trip.request as unknown as TripRequest;
  const tripPrefs = trip.prefs as unknown as Prefs;
  const plan = planTrip(tripReq, tripPrefs, places);
  const byId = new Map(places.map((p) => [p.id, p]));
  const firstDay = plan.days[0]!;

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (env?.PRINT_PLAN) console.log(`${trip.title}\n${print(plan)}`);

  it('keeps each fixed item at its exact time', () => {
    expect(tripReq.fixed.length).toBeGreaterThan(0);
    for (const f of tripReq.fixed) {
      const day = plan.days.find((d) => d.date === f.date)!;
      const item = day.items.find((i) => i.placeId === f.placeId);
      expect(item, f.placeId).toBeDefined();
      expect([item!.start, item!.end, item!.fixed]).toEqual([f.start, f.end, true]);
    }
  });

  it('starts nothing on the first day before the arrival time', () => {
    const arriveAt = tripReq.arriveAt ?? '09:30';
    expect(firstDay.date).toBe(tripReq.startDate);
    for (const i of firstDay.items) expect(i.start >= arriveAt, `${i.name} ${i.start}`).toBe(true);
  });

  it('auto-picks nothing tagged 어르신주의', () => {
    const picked = plan.days.flatMap((d) => d.items).filter((i) => !i.mine && !i.fixed);
    for (const i of picked) expect(byId.get(i.placeId)!.tags, i.name).not.toContain('어르신주의');
  });

  it('gives a leg only where both ends have coordinates', () => {
    for (const day of plan.days) {
      day.items.forEach((item, i) => {
        if (i === 0) return;
        const a = byId.get(day.items[i - 1]!.placeId)!;
        const b = byId.get(item.placeId)!;
        const known = a.lat !== null && a.lng !== null && b.lat !== null && b.lng !== null;
        expect(item.legFromPrev !== null, `${a.name} → ${b.name}`).toBe(known);
      });
    }
  });
});
