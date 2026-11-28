import { describe, expect, it } from 'vitest';
import {
  AUTO_PICK_MAX_DRIVE_MIN,
  AUTO_PICK_WALK_FACTOR,
  estimateTravel,
  planTrip,
  type Plan,
} from '../src/index';
import { place, prefs, request } from './fixtures';

const ids = (plan: Plan) => plan.days.flatMap((d) => d.items.map((i) => i.placeId));
const find = (plan: Plan, id: string) => plan.days.flatMap((d) => d.items).find((i) => i.placeId === id);

describe('auto-pick distance cap', () => {
  const stay = place('H', 'stay', 0, 0, { stayMinutes: null });
  const near = place('A', 'sight', 0.002, 0);
  // 0.09 degrees of latitude is about 10 km: 14 km by road, 33 minutes by car.
  const farDrive = place('F', 'sight', 0.09, 0);
  const twoDays = { endDate: '2026-12-06', stayId: 'H' };

  it('exports the limits', () => {
    expect(AUTO_PICK_MAX_DRIVE_MIN).toBe(30);
    expect(AUTO_PICK_WALK_FACTOR).toBe(2);
    expect(estimateTravel(stay, farDrive, { mode: 'car' })!.minutes).toBeGreaterThan(30);
  });

  it('with a car, never auto-picks a place more than 30 minutes from the stay', () => {
    const plan = planTrip(request(twoDays), prefs({ hasCar: true }), [stay, near, farDrive]);
    expect(ids(plan)).toContain('A');
    expect(ids(plan)).not.toContain('F');
    // Just inside the limit is fine: about 8.9 km, 30 minutes.
    const edge = place('E', 'sight', 0.08, 0);
    expect(estimateTravel(stay, edge, { mode: 'car' })!.minutes).toBeLessThanOrEqual(30);
    expect(ids(planTrip(request(twoDays), prefs({ hasCar: true }), [stay, near, edge]))).toContain('E');
  });

  it('ignores the cap for mustVisit and fixed items', () => {
    const farMeal = place('FM', 'meal', 0.09, 0.001);
    const plan = planTrip(
      request({
        ...twoDays,
        mustVisit: ['F'],
        fixed: [{ placeId: 'FM', date: '2026-12-05', start: '18:00', end: '19:00' }],
      }),
      prefs({ hasCar: true }),
      [stay, near, farDrive, farMeal],
    );
    expect(find(plan, 'F')!.mine).toBe(true);
    expect(find(plan, 'FM')!.fixed).toBe(true);
  });

  it('without a car, caps the walk at twice maxWalkMin', () => {
    const ok = place('W1', 'sight', 0.009, 0); // 18 minutes on foot
    const tooFar = place('W2', 'sight', 0.012, 0); // 24 minutes on foot
    const plan = planTrip(request(twoDays), prefs({ maxWalkMin: 10 }), [stay, ok, tooFar]);
    expect(ids(plan)).toContain('W1');
    expect(ids(plan)).not.toContain('W2');

    // No car and no walk limit: no cap.
    const free = planTrip(request(twoDays), prefs({ maxWalkMin: null }), [stay, ok, tooFar]);
    expect(ids(free)).toContain('W2');
  });

  it('measures from the centre of the day\'s own items when there is no stay', () => {
    const mine = place('X', 'sight', 0.2, 0.2);
    const byMine = place('N1', 'sight', 0.201, 0.2);
    const byOrigin = place('N2', 'sight', 0, 0);
    const plan = planTrip(request({ mustVisit: ['X'] }), prefs({ hasCar: true }), [mine, byMine, byOrigin]);
    expect(ids(plan)).toContain('N1');
    expect(ids(plan)).not.toContain('N2');
  });

  it('measures from what is already chosen when the day has nothing of its own', () => {
    // Day 1 has the must-visit. Day 2 has nothing, so it stays near what day 1 chose.
    const mine = place('X', 'sight', 0.2, 0.2);
    const fillers = [1, 2, 3, 4, 5, 6].map((n) => place(`N${n}`, 'sight', 0.2 + n * 0.001, 0.2));
    const farAway = place('Z', 'sight', 0, 0);
    const plan = planTrip(
      request({ endDate: '2026-12-06', mustVisit: ['X'] }),
      prefs({ hasCar: true }),
      [farAway, mine, ...fillers],
    );
    expect(plan.days[1]!.items.length).toBeGreaterThan(0);
    expect(ids(plan)).not.toContain('Z');
  });

  it('names distance as the cause when the only open restaurants are too far', () => {
    const farMeal = place('FM', 'meal', 0.09, 0);
    const plan = planTrip(request(twoDays), prefs({ hasCar: true }), [stay, near, farMeal]);
    expect(ids(plan)).not.toContain('FM');
    expect(plan.warnings).toContain('12월 5일(토) 점심: 차로 30분 안에 있는 식당이 없다.');
  });
});

describe('a fixed item without coordinates', () => {
  const places = [
    place('A', 'sight', 0, 0),
    place('B', 'sight', 0.002, 0),
    place('C', 'sight', 0.004, 0),
    place('M', 'meal', 0, 0, { lat: null, lng: null }),
  ];
  const req = request({
    mustVisit: ['A', 'B', 'C'],
    // 10:30 falls between the stops, so the fixed item has a neighbour on each side.
    fixed: [{ placeId: 'M', date: '2026-12-05', start: '10:30', end: '11:30' }],
  });
  const plan = planTrip(req, prefs({ hasCar: true, maxWalkMin: 10 }), places);
  const items = plan.days[0]!.items;
  const at = items.findIndex((i) => i.placeId === 'M');

  it('keeps its exact time', () => {
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(items.length - 1);
    expect([items[at]!.start, items[at]!.end, items[at]!.fixed]).toEqual(['10:30', '11:30', true]);
  });

  it('has null legs to and from it, each with a warning', () => {
    expect(items[at]!.legFromPrev).toBeNull();
    expect(items[at + 1]!.legFromPrev).toBeNull();
    const missing = plan.warnings.filter((w) => w.includes('좌표가 없어 이동 시간을 계산하지 못했다'));
    expect(missing).toHaveLength(2);
    expect(missing.every((w) => w.includes('테스트 장소 M'))).toBe(true);
    expect(plan.warnings.some((w) => w.includes('가기 어렵다'))).toBe(false);
  });

  it('still orders the neighbours along the line', () => {
    const order = items.filter((i) => !i.fixed && i.mine).map((i) => i.placeId).join('');
    expect(['ABC', 'CBA']).toContain(order);
    // Known legs: A–B and B–C, minus whichever one the fixed item interrupts.
    expect(plan.totals.walkMinutes + plan.totals.driveMinutes).toBeLessThanOrEqual(10);
    for (const i of items) expect(i.start >= '09:30' && i.end <= '20:30').toBe(true);
  });
});
