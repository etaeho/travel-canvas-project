import { describe, expect, it } from 'vitest';
import { explainOrder, planTrip, swapItem, type Plan } from '../src/index';
import { place, prefs, request } from './fixtures';

const allItems = (plan: Plan) => plan.days.flatMap((d) => d.items);
const find = (plan: Plan, id: string) => allItems(plan).find((i) => i.placeId === id);
const noCoords = { lat: null, lng: null };

describe('warnings name the real cause', () => {
  const sight = place('A', 'sight', 0, 0);

  it('(a) says there is no restaurant when the list has none', () => {
    const plan = planTrip(request({ mustVisit: ['A'] }), prefs(), [sight]);
    expect(plan.warnings).toContain('12월 5일(토) 점심: 장소 목록에 넣을 식당이 없다.');
    expect(plan.warnings.some((w) => w.includes('좌표'))).toBe(false);
  });

  it('(b) says none is open when candidates exist but are closed then', () => {
    const places = [
      sight,
      place('M1', 'meal', 0, 0.001, { closedDays: [6] }),
      place('M2', 'meal', 0.001, 0, { hours: [{ days: [6], open: '15:00', close: '16:30' }] }),
    ];
    const plan = planTrip(request({ mustVisit: ['A'] }), prefs(), places);
    expect(plan.warnings).toContain('12월 5일(토) 점심: 그 시간에 문 여는 식당이 없다.');
    expect(plan.warnings).toContain('12월 5일(토) 저녁: 그 시간에 문 여는 식당이 없다.');
  });

  it('(c) says how many restaurants were skipped for missing coordinates', () => {
    const places = [
      sight,
      place('M1', 'meal', 0, 0, noCoords),
      place('M2', 'meal', 0, 0, noCoords),
      place('M3', 'meal', 0, 0, { ...noCoords, closedDays: [6] }),
      place('K1', 'cafe', 0, 0, noCoords),
      place('H1', 'stay', 0, 0, noCoords),
    ];
    const plan = planTrip(request({ mustVisit: ['A'] }), prefs(), places);
    expect(plan.warnings).toContain('12월 5일(토) 점심: 좌표가 없어 넣지 못한 식당이 2곳이다.');
    expect(allItems(plan).some((i) => i.category === 'meal')).toBe(false);
    // One trip-level line with the count per category.
    const tripLevel = plan.warnings.filter((w) => w.startsWith('좌표가 없는 곳'));
    expect(tripLevel).toEqual(['좌표가 없는 곳은 자동으로 넣지 못했다: 숙소 1곳, 식당 3곳, 카페 1곳.']);
  });

  it('does not count a place without coordinates that the user put in the plan', () => {
    const places = [sight, place('M1', 'meal', 0, 0, noCoords), place('M2', 'meal', 0.001, 0)];
    const plan = planTrip(request({ mustVisit: ['A', 'M1'] }), prefs(), places);
    expect(find(plan, 'M1')).toBeDefined();
    expect(plan.warnings.some((w) => w.startsWith('좌표가 없는 곳'))).toBe(false);
    expect(plan.warnings.some((w) => w.includes('좌표가 없어 이동 시간을 계산하지 못했다'))).toBe(true);
  });

  it('keeps the trip-level line after a swap', () => {
    const places = [
      sight,
      place('B', 'sight', 0.001, 0),
      place('C', 'sight', 0, 0.001),
      place('K1', 'cafe', 0, 0, noCoords),
    ];
    const req = request({ mustVisit: ['A'] });
    const plan = planTrip(req, prefs(), places);
    const line = '좌표가 없는 곳은 자동으로 넣지 못했다: 카페 1곳.';
    expect(plan.warnings).toContain(line);
    expect(plan.warnings.filter((w) => w === line)).toHaveLength(1);
  });
});

describe('arrival and departure', () => {
  const places = [
    place('A', 'sight', 0, 0),
    place('B', 'sight', 0.001, 0),
    place('C', 'sight', 0, 0.001),
    place('D', 'sight', 0.001, 0.001),
    place('E', 'sight', -0.001, 0),
    place('M1', 'meal', 0, 0.002),
    place('M2', 'meal', 0.002, 0),
    place('M3', 'meal', 0, -0.002),
    place('M4', 'meal', -0.002, 0),
  ];

  it('starts at 09:30 and ends by 20:30 by default', () => {
    const plan = planTrip(request({ mustVisit: ['A'] }), prefs(), places);
    expect(allItems(plan)[0]!.start).toBe('09:30');
    expect(allItems(plan).every((i) => i.end <= '20:30')).toBe(true);
  });

  it('starts the first day at arriveAt and ends the last day by leaveBy', () => {
    const plan = planTrip(
      request({ endDate: '2026-12-06', mustVisit: ['A'], arriveAt: '14:00', leaveBy: '15:00' }),
      prefs(),
      places,
    );
    const [first, last] = plan.days;
    expect(first!.items[0]!.start).toBe('14:00');
    expect(first!.items.every((i) => i.start >= '14:00')).toBe(true);
    // Arriving at 14:00 leaves no lunch on the first day; leaving by 15:00 leaves no dinner on the last.
    expect(first!.items.filter((i) => i.category === 'meal')).toHaveLength(1);
    // The last day keeps the default start.
    expect(last!.items.every((i) => i.start >= '09:30')).toBe(true);
    expect(last!.items.every((i) => i.end <= '15:00')).toBe(true);
    expect(last!.items.filter((i) => i.category === 'meal')).toHaveLength(1);
    expect(plan.warnings).toEqual([]);
  });

  it('keeps a must-visit that cannot fit before leaveBy, with a warning', () => {
    const plan = planTrip(
      request({ mustVisit: ['A', 'B', 'C'], leaveBy: '10:30' }),
      prefs(),
      places.slice(0, 5),
    );
    for (const id of ['A', 'B', 'C']) expect(find(plan, id)).toBeDefined();
    expect(plan.warnings.some((w) => w.includes('10:30까지 끝나지 않는다'))).toBe(true);
    // Nothing is added on top of a day that is already too full.
    expect(allItems(plan)).toHaveLength(3);
  });

  it('keeps the day limits when an item is swapped', () => {
    const req = request({ mustVisit: ['A'], arriveAt: '10:15', leaveBy: '16:00' });
    const ctx = { request: req, prefs: prefs(), places };
    const plan = planTrip(req, ctx.prefs, places);
    const index = plan.days[0]!.items.findIndex((i) => i.alternatives.length > 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const next = swapItem(plan, 0, index, plan.days[0]!.items[index]!.alternatives[0]!.placeId, ctx);
    expect(next.days[0]!.items[0]!.start).toBe('10:15');
    expect(next.days[0]!.items.every((i) => i.end <= '16:00')).toBe(true);
  });
});

describe('elder care', () => {
  const steep = place('S', 'sight', 0.001, 0, {
    tags: ['어르신주의'],
    elderNote: '계단이 108개다.',
  });
  const flat = place('A', 'sight', 0, 0);
  const elder = { count: 3, withElder: true };

  it('never auto-picks or suggests a place tagged 어르신주의 with an elder', () => {
    const places = [flat, steep, place('B', 'sight', 0, 0.001)];
    const plan = planTrip(request({ party: elder, mustVisit: ['A'] }), prefs(), places);
    expect(find(plan, 'S')).toBeUndefined();
    expect(allItems(plan).flatMap((i) => i.alternatives).some((a) => a.placeId === 'S')).toBe(false);
    expect(find(plan, 'B')).toBeDefined();

    const young = planTrip(request({ mustVisit: ['A'] }), prefs(), places);
    expect(find(young, 'S')).toBeDefined();
  });

  it('keeps such a place when it is a must-visit and quotes its elderNote', () => {
    const plan = planTrip(request({ party: elder, mustVisit: ['S'] }), prefs(), [flat, steep]);
    expect(find(plan, 'S')!.mine).toBe(true);
    expect(plan.warnings).toContain('테스트 장소 S: 어르신이 다니기 어려울 수 있다. "계단이 108개다."');

    const noNote = { ...steep, elderNote: null };
    const plan2 = planTrip(request({ party: elder, mustVisit: ['S'] }), prefs(), [flat, noNote]);
    expect(plan2.warnings).toContain('테스트 장소 S: 어르신이 다니기 어려울 수 있다.');

    const young = planTrip(request({ mustVisit: ['S'] }), prefs(), [flat, steep]);
    expect(young.warnings.some((w) => w.includes('어르신'))).toBe(false);
  });

  it('prefers places tagged 평지 or 실내 with an elder', () => {
    // The budget leaves room for one paid stop. 'A1' wins ties by id; 'Z1' is flat.
    const places = [
      place('A1', 'sight', 0, 0, { costPerPerson: 1000 }),
      place('Z1', 'sight', 0, 0, { costPerPerson: 1000, tags: ['평지'] }),
    ];
    const req = (withElder: boolean) =>
      request({ party: { count: 2, withElder }, budgetPerPerson: 1000 });
    expect(allItems(planTrip(req(true), prefs(), places)).map((i) => i.placeId)).toEqual(['Z1']);
    expect(allItems(planTrip(req(false), prefs(), places)).map((i) => i.placeId)).toEqual(['A1']);

    const indoor = [places[0]!, { ...places[1]!, tags: ['실내'] }];
    expect(allItems(planTrip(req(true), prefs(), indoor)).map((i) => i.placeId)).toEqual(['Z1']);
  });
});

describe('night views', () => {
  const late = [{ days: [0, 1, 2, 3, 4, 5, 6], open: '09:00', close: '22:00' }];
  // Five stops on a line. 'N' sits in the middle, so the shortest path visits it mid-morning.
  const line = (nightExtra: object) => [
    place('A', 'sight', 0, 0),
    place('B', 'sight', 0.002, 0),
    place('N', 'sight', 0.004, 0, { tags: ['야경'], hours: late, ...nightExtra }),
    place('C', 'sight', 0.006, 0),
    place('D', 'sight', 0.008, 0),
  ];
  const must = ['A', 'B', 'N', 'C', 'D'];

  it('moves a night-view place to 17:00 or later and says so', () => {
    const plan = planTrip(request({ mustVisit: must }), prefs(), line({}));
    expect(find(plan, 'N')!.start >= '17:00').toBe(true);
    expect(find(plan, 'N')!.status).toBe('ok');
    expect(plan.days[0]!.order.nightMoved).toBe(true);
    expect(explainOrder(plan, 0)).toContain('야경이 좋은 곳은 저녁으로 옮겼다');
    expect(plan.warnings).toEqual(expect.not.arrayContaining([expect.stringContaining('끝나지 않는다')]));

    const plain = planTrip(request({ mustVisit: must }), prefs(), line({ tags: [] }));
    expect(find(plain, 'N')!.start < '17:00').toBe(true);
    expect(plain.days[0]!.order.nightMoved).toBe(false);
    expect(explainOrder(plain, 0)).not.toContain('야경');
  });

  it('keeps the daytime slot when the hours do not allow an evening visit', () => {
    const early = [{ days: [0, 1, 2, 3, 4, 5, 6], open: '09:00', close: '17:00' }];
    const plan = planTrip(request({ mustVisit: must }), prefs(), line({ hours: early }));
    expect(find(plan, 'N')!.start < '17:00').toBe(true);
    expect(find(plan, 'N')!.status).toBe('ok');
    expect(explainOrder(plan, 0)).not.toContain('야경');
  });

  it('keeps the daytime slot when the evening is taken by a fixed item', () => {
    const places = [...line({}), place('M1', 'meal', 0.004, 0.001)];
    const plan = planTrip(
      request({
        mustVisit: must,
        fixed: [{ placeId: 'M1', date: '2026-12-05', start: '16:50', end: '20:20' }],
      }),
      prefs(),
      places,
    );
    expect(find(plan, 'N')!.start < '17:00').toBe(true);
    const fixed = find(plan, 'M1')!;
    expect([fixed.start, fixed.end]).toEqual(['16:50', '20:20']);
    expect(plan.warnings.some((w) => w.includes('가기 어렵다'))).toBe(false);
  });

  it('keeps the daytime slot when the party leaves before evening', () => {
    const plan = planTrip(request({ mustVisit: must, leaveBy: '16:00' }), prefs(), line({}));
    expect(find(plan, 'N')!.end <= '16:00').toBe(true);
  });

  it('ranks the night preference above travel minutes but below fixed times', () => {
    // The other stops close at 17:00, so 'N' must come last. Going back to it costs extra
    // walking. It is still chosen.
    const day = [{ days: [0, 1, 2, 3, 4, 5, 6], open: '09:00', close: '17:00' }];
    const closeEarly = (ps: ReturnType<typeof line>) =>
      ps.map((p) => (p.id === 'N' ? p : { ...p, hours: day }));
    const night = planTrip(request({ mustVisit: must }), prefs(), closeEarly(line({})));
    const plain = planTrip(request({ mustVisit: must }), prefs(), closeEarly(line({ tags: [] })));
    expect(night.days[0]!.items.at(-1)!.placeId).toBe('N');
    expect(night.days[0]!.items.at(-1)!.start >= '17:00').toBe(true);
    expect(night.days[0]!.items.every((i) => i.status === 'ok')).toBe(true);
    expect(night.totals.walkMinutes).toBeGreaterThan(plain.totals.walkMinutes);
  });

  it('keeps an evening night-view place in the evening after a swap elsewhere', () => {
    const places = [
      ...line({}),
      place('M1', 'meal', 0.001, 0.001, { costPerPerson: 9000 }),
      place('M2', 'meal', 0.003, 0.001, { costPerPerson: 12000 }),
      place('M3', 'meal', 0.005, 0.001, { costPerPerson: 15000 }),
    ];
    const req = request({ mustVisit: must });
    const ctx = { request: req, prefs: prefs(), places };
    const plan = planTrip(req, ctx.prefs, places);
    expect(find(plan, 'N')!.start >= '17:00').toBe(true);
    const index = plan.days[0]!.items.findIndex((i) => i.alternatives.length > 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const alt = plan.days[0]!.items[index]!.alternatives[0]!;
    const next = swapItem(plan, 0, index, alt.placeId, ctx);
    expect(find(next, 'N')!.start >= '17:00').toBe(true);
    expect(next.totals.walkMinutes).toBe(plan.totals.walkMinutes + alt.delta.walkMinutes);
  });
});
