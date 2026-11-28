import {
  DAY_END,
  DAY_START,
  MEAL_WINDOWS,
  makeLegFn,
  searchOrders,
  stayOf,
  toItems,
  type DayCtx,
  type DayParts,
  type Entry,
  type LegFn,
  type MealSlot,
  type SearchResult,
} from './schedule';
import { dateLabel, datesBetween, openIntervals, toHHMM, toMin, weekdayOf, won } from './time';
import type {
  Alternative,
  OrderStats,
  Place,
  Plan,
  PlanContext,
  PlanDay,
  PlanItem,
  Prefs,
  TripRequest,
} from './types';

const SLOTS: MealSlot[] = ['lunch', 'dinner'];
const SLOT_KO: Record<MealSlot, string> = { lunch: '점심', dinner: '저녁' };
/** non-meal stops per day, counting the user's own */
const STOPS_PER_DAY = 5;
const STOPS_PER_DAY_ELDER = 4;
/** rough travel allowance per stop when checking that a day is not overfilled */
const BUFFER_PER_STOP_MIN = 20;
const MAX_ALTERNATIVES = 3;

interface DraftDay {
  date: string;
  weekday: number;
  fixed: Entry[];
  free: Entry[];
}

const entry = (place: Place, over: Partial<Entry>): Entry => ({
  place,
  kind: 'free',
  mine: false,
  slot: null,
  fixedStart: 0,
  fixedEnd: 0,
  auto: false,
  ...over,
});

function mealFits(place: Place, weekday: number, slot: MealSlot): boolean {
  const ivs = openIntervals(place, weekday);
  if (ivs === null) return true;
  const [from, to] = MEAL_WINDOWS[slot];
  return ivs.some(([o, c]) => Math.max(from, o) <= to && Math.max(from, o) + stayOf(place) <= c);
}

function slotTaken(day: DraftDay, slot: MealSlot): boolean {
  const [from, to] = MEAL_WINDOWS[slot];
  return (
    day.free.some((e) => e.slot === slot) ||
    day.fixed.some(
      (e) => e.place.category === 'meal' && e.fixedStart < to + 60 && e.fixedEnd > from,
    )
  );
}

const dayLoad = (day: DraftDay): number =>
  day.free.reduce((s, e) => s + stayOf(e.place) + BUFFER_PER_STOP_MIN, 0) +
  day.fixed.reduce((s, e) => s + (e.fixedEnd - e.fixedStart), 0);

export function dayCtxFor(date: string, leg: LegFn, prefs: Prefs): DayCtx {
  return { date, weekday: weekdayOf(date), leg, maxWalkMin: prefs.maxWalkMin };
}

export function planTrip(request: TripRequest, prefs: Prefs, places: Place[]): Plan {
  const ctx: PlanContext = { request, prefs, places };
  const byId = new Map(places.map((p) => [p.id, p]));
  const leg = makeLegFn(request, prefs);
  const warnings: string[] = [];
  const days: DraftDay[] = datesBetween(request.startDate, request.endDate).map((date) => ({
    date,
    weekday: weekdayOf(date),
    fixed: [],
    free: [],
  }));
  const lastDay = days.length - 1;
  const used = new Set<string>();
  let spent = 0;
  const spend = (p: Place) => {
    spent += p.costPerPerson ?? 0;
  };
  const affordable = (p: Place) =>
    request.budgetPerPerson === null || spent + (p.costPerPerson ?? 0) <= request.budgetPerPerson;

  // Stay: the user's choice. It opens and closes the days around each night.
  const stay = request.stayId ? (byId.get(request.stayId) ?? null) : null;
  if (request.stayId && !stay) {
    warnings.push(`숙소를 장소 목록에서 찾지 못했다: ${request.stayId}`);
  }
  if (stay) {
    used.add(stay.id);
    spent += (stay.costPerPerson ?? 0) * lastDay;
  }

  // Fixed items: exact time, never moved.
  const must = [...new Set(request.mustVisit)];
  for (const f of request.fixed) {
    const p = byId.get(f.placeId);
    const day = days.find((d) => d.date === f.date);
    if (!p) {
      warnings.push(`시간을 정한 곳을 장소 목록에서 찾지 못했다: ${f.placeId}`);
      continue;
    }
    if (!day) {
      warnings.push(`${p.name}: 정한 날짜 ${f.date}이 여행 기간 밖이다.`);
      continue;
    }
    day.fixed.push(
      entry(p, {
        kind: 'fixed',
        mine: must.includes(p.id),
        fixedStart: toMin(f.start),
        fixedEnd: toMin(f.end),
      }),
    );
    used.add(p.id);
    spend(p);
  }

  // Must-visits: always placed. A closed day is marked later, never dropped.
  for (const id of must) {
    if (used.has(id)) continue;
    const p = byId.get(id);
    if (!p) {
      warnings.push(`꼭 갈 곳을 장소 목록에서 찾지 못했다: ${id}`);
      continue;
    }
    if (p.category === 'meal') {
      const options = days.flatMap((day) => SLOTS.map((slot) => ({ day, slot })));
      const open = options.filter((o) => !slotTaken(o.day, o.slot));
      const pick =
        open.find((o) => mealFits(p, o.day.weekday, o.slot)) ?? open[0] ?? options[0]!;
      pick.day.free.push(entry(p, { mine: true, slot: pick.slot }));
    } else {
      const openDays = days.filter((d) => openIntervals(p, d.weekday)?.length !== 0);
      const pool = openDays.length > 0 ? openDays : days;
      const day = pool.reduce((a, b) => (dayLoad(b) < dayLoad(a) ? b : a));
      day.free.push(entry(p, { mine: true }));
    }
    used.add(id);
    spend(p);
  }

  // Candidates the planner may add on its own.
  const likes = new Set([...prefs.likes, ...prefs.mood]);
  const score = (p: Place, day: DraftDay): number => {
    const anchor = stay ?? [...day.fixed, ...day.free][0]?.place ?? null;
    const near = anchor ? (leg(anchor, p)?.minutes ?? 0) : 0;
    const verified = { verified: 1, partial: 0.5, unverified: 0 }[p.verification.status];
    return p.tags.filter((t) => likes.has(t)).length * 2 + verified - near / 10;
  };
  const ranked = (day: DraftDay, ok: (p: Place) => boolean): Place[] =>
    places
      .filter((p) => !used.has(p.id) && p.lat !== null && p.lng !== null && ok(p))
      .map((p) => ({ p, s: score(p, day) }))
      .sort((a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : 1))
      .map((x) => x.p);

  // Meals: one per empty meal window.
  for (const day of days) {
    for (const slot of SLOTS) {
      if (slotTaken(day, slot)) continue;
      const pick = ranked(
        day,
        (p) => p.category === 'meal' && mealFits(p, day.weekday, slot) && affordable(p),
      )[0];
      if (!pick) {
        warnings.push(`${dateLabel(day.date)} ${SLOT_KO[slot]}: 문 여는 식당을 찾지 못했다.`);
        continue;
      }
      day.free.push(entry(pick, { slot, auto: true }));
      used.add(pick.id);
      spend(pick);
    }
  }

  // Other stops: fill each day up to a calm pace.
  const target = request.party.withElder ? STOPS_PER_DAY_ELDER : STOPS_PER_DAY;
  const autoStops = new Map<DraftDay, Entry[]>();
  for (const day of days) {
    const added: Entry[] = [];
    autoStops.set(day, added);
    const stops = () =>
      [...day.fixed, ...day.free].filter((e) => e.place.category !== 'meal').length;
    const cafes = () => [...day.fixed, ...day.free].filter((e) => e.place.category === 'cafe').length;
    for (const p of ranked(
      day,
      (p) =>
        (p.category === 'sight' || p.category === 'activity' || p.category === 'cafe') &&
        openIntervals(p, day.weekday)?.length !== 0,
    )) {
      if (stops() >= target) break;
      if (p.category === 'cafe' && cafes() >= 1) continue;
      if (!affordable(p)) continue;
      if (dayLoad(day) + stayOf(p) + BUFFER_PER_STOP_MIN > DAY_END - DAY_START) continue;
      const e = entry(p, { auto: true });
      day.free.push(e);
      added.push(e);
      used.add(p.id);
      spend(p);
    }
  }

  // Order each day. If the day breaks a rule, take back the planner's own stops while that helps.
  const planDays: PlanDay[] = days.map((day, i) => {
    const dctx = dayCtxFor(day.date, leg, prefs);
    const parts = (): DayParts => ({
      free: day.free,
      fixed: day.fixed,
      startStay: stay && i > 0 ? entry(stay, { kind: 'stay', mine: true }) : null,
      endStay: stay && i < lastDay ? entry(stay, { kind: 'stay', mine: true }) : null,
    });
    let result = searchOrders(parts(), dctx);
    const added = autoStops.get(day) ?? [];
    while (result.run.violations > 0 && added.length > 0) {
      const removed = added.pop()!;
      const before = day.free;
      day.free = before.filter((e) => e !== removed);
      const retry = searchOrders(parts(), dctx);
      if (retry.run.violations >= result.run.violations) {
        day.free = before;
        break;
      }
      used.delete(removed.place.id);
      result = retry;
    }
    const items = toItems(result.run, dctx);
    return { date: day.date, items, order: orderStats(items, result) };
  });

  fillAlternatives(planDays, ctx, leg);
  return {
    days: planDays,
    totals: computeTotals(planDays, byId),
    warnings: [...warnings, ...itemWarnings(planDays, ctx)],
  };
}

export function orderStats(
  items: PlanItem[],
  search: Pick<SearchResult, 'worstTravel' | 'considered' | 'method'>,
): OrderStats {
  const sum = (mode: 'walk' | 'car') =>
    items.reduce((s, i) => s + (i.legFromPrev?.mode === mode ? i.legFromPrev.minutes : 0), 0);
  const walkMinutes = sum('walk');
  const driveMinutes = sum('car');
  const travelMinutes = walkMinutes + driveMinutes;
  return {
    travelMinutes,
    walkMinutes,
    driveMinutes,
    worstTravelMinutes: Math.max(search.worstTravel, travelMinutes),
    considered: search.considered,
    method: search.method,
  };
}

/** The stay appears at the end of one day and the start of the next. It is charged once, at the end. */
const isMorningStay = (item: PlanItem, index: number, dayIndex: number): boolean =>
  item.category === 'stay' && index === 0 && dayIndex > 0;

export function computeTotals(days: PlanDay[], byId: Map<string, Place>): Plan['totals'] {
  const totals = { walkMinutes: 0, driveMinutes: 0, costPerPerson: 0 };
  days.forEach((day, d) =>
    day.items.forEach((item, i) => {
      if (item.legFromPrev?.mode === 'walk') totals.walkMinutes += item.legFromPrev.minutes;
      if (item.legFromPrev?.mode === 'car') totals.driveMinutes += item.legFromPrev.minutes;
      if (!isMorningStay(item, i, d)) {
        totals.costPerPerson += byId.get(item.placeId)?.costPerPerson ?? 0;
      }
    }),
  );
  return totals;
}

/** Warnings that can be read off the finished days. Recomputed after a swap. */
export function itemWarnings(days: PlanDay[], ctx: PlanContext): string[] {
  const byId = new Map(ctx.places.map((p) => [p.id, p]));
  const out: string[] = [];
  let unknownCost = 0;
  days.forEach((day, d) => {
    const weekday = weekdayOf(day.date);
    day.items.forEach((item, i) => {
      const place = byId.get(item.placeId);
      const prev = day.items[i - 1];
      if (item.status === 'closed') {
        const allDay = place ? openIntervals(place, weekday)?.length === 0 : false;
        const what = allDay
          ? `${dateLabel(day.date)}은 쉬는 날이다.`
          : `${dateLabel(day.date)} ${item.start}~${item.end}에는 문을 열지 않는다.`;
        const kept = item.fixed
          ? ' 정한 시간이라 그대로 두었다.'
          : item.mine
            ? ' 꼭 갈 곳이라 일정에 남겼다.'
            : '';
        out.push(`${item.name}: ${what}${kept}`);
      }
      if (item.status === 'unverified') out.push(`${item.name}: 확인 전인 곳이다.`);
      if (prev && item.legFromPrev === null) {
        out.push(`${prev.name} → ${item.name}: 위치를 몰라 이동 시간을 계산하지 못했다.`);
      }
      if (item.legFromPrev?.overLimit) {
        out.push(
          `${prev?.name ?? ''} → ${item.name}: 걸어서 ${item.legFromPrev.minutes}분이다. 한도 ${ctx.prefs.maxWalkMin}분을 넘는다.`,
        );
      }
      if (item.fixed && prev && toMin(prev.end) + (item.legFromPrev?.minutes ?? 0) > toMin(item.start)) {
        out.push(`${item.name}: 정한 시간 ${item.start}까지 가기 어렵다.`);
      }
      if (!item.fixed && item.category !== 'stay') {
        // Times are 'HH:MM', so an item that ran past midnight wraps to a small value.
        const end = toMin(item.end) < toMin(item.start) ? toMin(item.end) + 1440 : toMin(item.end);
        if (end > DAY_END) {
          out.push(`${item.name}: 하루 일정이 ${toHHMM(DAY_END)}을 넘긴다.`);
        }
        if (item.category === 'meal') {
          const start = toMin(item.start);
          const inWindow = SLOTS.some((s) => start >= MEAL_WINDOWS[s][0] && start <= MEAL_WINDOWS[s][1]);
          if (!inWindow) out.push(`${item.name}: 식사 시간에 맞추지 못했다.`);
        }
      }
      if (place && place.costPerPerson === null && !isMorningStay(item, i, d)) unknownCost++;
    });
  });
  if (unknownCost > 0) out.push(`경비를 모르는 곳이 ${unknownCost}곳 있다. 합계에서 뺐다.`);
  const budget = ctx.request.budgetPerPerson;
  if (budget !== null) {
    const over = computeTotals(days, byId).costPerPerson - budget;
    if (over > 0) out.push(`한 사람 경비가 예산보다 ${won(over)}원 많다.`);
  }
  return out;
}

function reasonFor(
  alt: Place,
  delta: Alternative['delta'],
  hoursKnown: boolean,
  prefs: Prefs,
): string {
  const travel = delta.walkMinutes + delta.driveMinutes;
  const liked = alt.tags.find((t) => prefs.likes.includes(t) || prefs.mood.includes(t));
  let text: string;
  if (travel < 0 && delta.driveMinutes === 0) text = `걷는 시간이 ${-travel}분 줄어든다.`;
  else if (travel < 0) text = `이동 시간이 ${-travel}분 줄어든다.`;
  else if (delta.walkMinutes < 0) text = `걷는 시간이 ${-delta.walkMinutes}분 줄어든다.`;
  else if (delta.costPerPerson < 0) text = `한 사람에 ${won(-delta.costPerPerson)}원 덜 든다.`;
  else if (liked) text = `좋아하는 '${liked}'에 맞는 곳이다.`;
  else text = hoursKnown ? '이 시간에 문을 여는 같은 종류의 곳이다.' : '같은 종류의 곳이다.';
  if (!hoursKnown) text += ' 여는 시간은 확인 전이다.';
  if (alt.costPerPerson === null) text += ' 경비는 확인 전이다.';
  if (alt.verification.status === 'unverified') text += ' 확인 전인 곳이다.';
  return text;
}

/**
 * Fills alternatives for every item the planner chose (not mine, not fixed).
 * `pin` puts one place first for one item: the place a swap just replaced.
 */
export function fillAlternatives(
  days: PlanDay[],
  ctx: PlanContext,
  leg: LegFn,
  pin?: { dayIndex: number; itemIndex: number; placeId: string },
): void {
  const byId = new Map(ctx.places.map((p) => [p.id, p]));
  const used = new Set(days.flatMap((d) => d.items.map((i) => i.placeId)));
  if (ctx.request.stayId) used.add(ctx.request.stayId);

  days.forEach((day, d) => {
    const weekday = weekdayOf(day.date);
    day.items.forEach((item, i) => {
      item.alternatives = [];
      if (item.mine || item.fixed || item.category === 'stay') return;
      const current = byId.get(item.placeId);
      const prevItem = day.items[i - 1];
      const nextItem = day.items[i + 1];
      const prev = prevItem ? byId.get(prevItem.placeId) : undefined;
      const next = nextItem ? byId.get(nextItem.placeId) : undefined;
      const start = toMin(item.start);
      const pinnedId = pin && pin.dayIndex === d && pin.itemIndex === i ? pin.placeId : null;

      const minutes = (legs: (PlanItem['legFromPrev'] | ReturnType<LegFn>)[], mode: 'walk' | 'car') =>
        legs.reduce((s, l) => s + (l?.mode === mode ? l.minutes : 0), 0);
      const oldLegs = [item.legFromPrev, nextItem?.legFromPrev ?? null];

      const scored = ctx.places
        .filter((p) => p.category === item.category && !used.has(p.id))
        .filter((p) => p.id === pinnedId || (p.lat !== null && p.lng !== null))
        .flatMap((p) => {
          const ivs = openIntervals(p, weekday);
          const openNow = ivs === null || ivs.some(([o, c]) => o <= start && start + stayOf(p) <= c);
          if (!openNow && p.id !== pinnedId) return [];
          const newLegs = [prev ? leg(prev, p) : null, next ? leg(p, next) : null];
          const delta = {
            walkMinutes: minutes(newLegs, 'walk') - minutes(oldLegs, 'walk'),
            driveMinutes: minutes(newLegs, 'car') - minutes(oldLegs, 'car'),
            costPerPerson: (p.costPerPerson ?? 0) - (current?.costPerPerson ?? 0),
          };
          const sure = ivs !== null && p.verification.status !== 'unverified';
          return [{ p, delta, hoursKnown: ivs !== null, tier: p.id === pinnedId ? 0 : sure ? 1 : 2 }];
        })
        .sort(
          (a, b) =>
            a.tier - b.tier ||
            a.delta.walkMinutes + a.delta.driveMinutes - (b.delta.walkMinutes + b.delta.driveMinutes) ||
            a.delta.costPerPerson - b.delta.costPerPerson ||
            (a.p.id < b.p.id ? -1 : 1),
        );

      item.alternatives = scored.slice(0, MAX_ALTERNATIVES).map(({ p, delta, hoursKnown }) => ({
        placeId: p.id,
        name: p.name,
        reason: reasonFor(p, delta, hoursKnown, ctx.prefs),
        delta,
      }));
    });
  });
}
