// Internal: placing items on a day's timeline and searching for the best order.
import { chooseTravel } from './travel';
import { isOpenDuring, openIntervals, toHHMM, toMin } from './time';
import type { Category, Place, PlanItem, Prefs, TravelEstimate, TripRequest } from './types';

export const DEFAULT_DAY_START = toMin('09:30');
export const DEFAULT_DAY_END = toMin('20:30');
/** a place with this tag is best seen in the evening */
export const NIGHT_TAG = '야경';
export const NIGHT_START = toMin('17:00');
export type MealSlot = 'lunch' | 'dinner';
export const MEAL_WINDOWS: Record<MealSlot, [number, number]> = {
  lunch: [toMin('11:30'), toMin('13:30')],
  dinner: [toMin('17:30'), toMin('19:30')],
};
/** a meal that starts after this is treated as dinner when a plan is read back */
const LUNCH_DINNER_SPLIT = toMin('15:30');
/** waiting longer than this for a place to open counts against an order */
export const MAX_WAIT_MIN = 60;
/** up to this many free items, every order is tried */
export const EXHAUSTIVE_LIMIT = 7;

/** Used only when a place has no stayMinutes. */
const DEFAULT_STAY_MIN: Record<Category, number> = {
  stay: 0,
  meal: 60,
  cafe: 40,
  sight: 60,
  activity: 90,
  bar: 60,
};

export const stayOf = (p: Place): number => p.stayMinutes ?? DEFAULT_STAY_MIN[p.category];

export const slotForStart = (start: number): MealSlot =>
  start < LUNCH_DINNER_SPLIT ? 'lunch' : 'dinner';

export interface Entry {
  place: Place;
  /** free: the planner orders it. fixed: user-fixed time. stay: day start/end anchor. */
  kind: 'free' | 'fixed' | 'stay';
  mine: boolean;
  slot: MealSlot | null;
  fixedStart: number;
  fixedEnd: number;
  /** picked by the planner, not by the user */
  auto: boolean;
}

export type LegFn = (a: Place, b: Place) => TravelEstimate | null;

export interface DayCtx {
  date: string;
  weekday: number;
  leg: LegFn;
  maxWalkMin: number | null;
  dayStart: number;
  dayEnd: number;
}

export interface Placed {
  entry: Entry;
  start: number;
  end: number;
  leg: TravelEstimate | null;
  violations: number;
  wait: number;
}

export interface Run {
  placed: Placed[];
  violations: number;
  /** night-view places that could have been seen in the evening but are not */
  nightMiss: number;
  travel: number;
  wait: number;
}

export function makeLegFn(request: TripRequest, prefs: Prefs): LegFn {
  const cache = new Map<string, TravelEstimate | null>();
  const opts = {
    withElder: request.party.withElder,
    hasCar: prefs.hasCar,
    maxWalkMin: prefs.maxWalkMin,
  };
  return (a, b) => {
    const key = `${a.id}\u0000${b.id}`;
    if (!cache.has(key)) cache.set(key, chooseTravel(a, b, opts));
    return cache.get(key) ?? null;
  };
}

interface Cursor {
  time: number;
  prev: Place | null;
}

type Delayed = ReadonlySet<Entry>;
const NONE: Delayed = new Set<Entry>();

const isNightEntry = (e: Entry): boolean =>
  e.kind === 'free' && e.slot === null && e.place.tags.includes(NIGHT_TAG);

/** true when the place's hours and the day's end allow a visit starting at 17:00 or later */
function nightPossible(place: Place, ctx: DayCtx): boolean {
  const duration = stayOf(place);
  const ivs = openIntervals(place, ctx.weekday);
  if (ivs === null) return NIGHT_START + duration <= ctx.dayEnd;
  return ivs.some(([o, c]) => Math.max(NIGHT_START, o) + duration <= Math.min(c, ctx.dayEnd));
}

/** `delayed`: night-view entries that wait for the evening instead of starting on arrival. */
function placeOne(cur: Cursor, entry: Entry, ctx: DayCtx, delayed: Delayed): Placed {
  const leg = cur.prev ? ctx.leg(cur.prev, entry.place) : null;
  const arrive = cur.time + (leg?.minutes ?? 0);

  if (entry.kind === 'fixed') {
    // The user's time is kept exactly. Arriving late is a violation, not a reason to move it.
    return {
      entry,
      start: entry.fixedStart,
      end: entry.fixedEnd,
      leg,
      violations: arrive > entry.fixedStart ? 1 : 0,
      wait: 0,
    };
  }
  if (entry.kind === 'stay') {
    return { entry, start: arrive, end: arrive, leg, violations: 0, wait: 0 };
  }

  const duration = stayOf(entry.place);
  const window = entry.slot ? MEAL_WINDOWS[entry.slot] : null;
  const night = delayed.has(entry);
  let start = window ? Math.max(arrive, window[0]) : night ? Math.max(arrive, NIGHT_START) : arrive;
  let open = true;
  const intervals = openIntervals(entry.place, ctx.weekday);
  if (intervals !== null) {
    const fit = intervals.find(([o, c]) => Math.max(start, o) + duration <= c);
    if (fit) start = Math.max(start, fit[0]);
    else open = false;
  }
  const end = start + duration;
  const wait = start - arrive;
  let violations = 0;
  if (!open) violations++;
  // Free time before an evening night view is accepted.
  if (wait > MAX_WAIT_MIN && !night) violations++;
  if (window && start > window[1]) violations++;
  if (end > ctx.dayEnd) violations++;
  return { entry, start, end, leg, violations, wait };
}

const advance = (p: Placed): Cursor => ({
  time: p.entry.kind === 'fixed' ? Math.max(p.end, p.start) : p.end,
  prev: p.entry.place,
});

/** Times and legs for a full, already ordered day. */
export function runSequence(seq: Entry[], ctx: DayCtx, delayed: Delayed = NONE): Run {
  let cur: Cursor = { time: ctx.dayStart, prev: null };
  let nightMiss = 0;
  const placed: Placed[] = [];
  let violations = 0;
  let travel = 0;
  let wait = 0;
  for (const entry of seq) {
    const p = placeOne(cur, entry, ctx, delayed);
    placed.push(p);
    if (isNightEntry(entry) && p.start < NIGHT_START && nightPossible(entry.place, ctx)) nightMiss++;
    violations += p.violations;
    travel += p.leg?.minutes ?? 0;
    wait += p.wait;
    cur = advance(p);
  }
  return { placed, violations, nightMiss, travel, wait };
}

export interface DayParts {
  free: Entry[];
  fixed: Entry[];
  startStay: Entry | null;
  endStay: Entry | null;
}

/** Weaves fixed items into an order of free items: a fixed item goes first when the next free item would make us late for it. */
function buildSequence(order: Entry[], parts: DayParts, ctx: DayCtx, delayed: Delayed): Entry[] {
  const queue = [...parts.fixed].sort((a, b) => a.fixedStart - b.fixedStart);
  const seq: Entry[] = [];
  let cur: Cursor = { time: ctx.dayStart, prev: null };
  const push = (e: Entry) => {
    const p = placeOne(cur, e, ctx, delayed);
    seq.push(e);
    cur = advance(p);
  };
  if (parts.startStay) push(parts.startStay);
  for (const f of order) {
    while (queue.length > 0) {
      const next = queue[0]!;
      const tentative = placeOne(cur, f, ctx, delayed);
      const toFixed = ctx.leg(f.place, next.place)?.minutes ?? 0;
      if (tentative.end + toFixed <= next.fixedStart) break;
      push(queue.shift()!);
    }
    push(f);
  }
  for (const rest of queue) push(rest);
  if (parts.endStay) push(parts.endStay);
  return seq;
}

/** Hard rules first, then night views in the evening, then travel minutes, then waiting. */
const better = (a: Run, b: Run, useNight = true): boolean =>
  a.violations !== b.violations
    ? a.violations < b.violations
    : useNight && a.nightMiss !== b.nightMiss
      ? a.nightMiss < b.nightMiss
      : a.travel !== b.travel
      ? a.travel < b.travel
      : a.wait < b.wait;

export interface SearchResult {
  seq: Entry[];
  run: Run;
  /** most travel among considered orders that keep as many rules as the chosen one */
  worstTravel: number;
  considered: number;
  method: 'exhaustive' | 'heuristic';
  /** the night-view preference changed where a place sits */
  nightMoved: boolean;
  /** night-view entries that wait for the evening in the chosen order */
  delayed: Entry[];
}

/**
 * Picks the order with the least total travel minutes (each leg in its chosen mode).
 * Orders that break fewer rules (hours, meal windows, fixed times, day end) win first.
 */
export function searchOrders(parts: DayParts, ctx: DayCtx): SearchResult {
  interface Cand {
    seq: Entry[];
    run: Run;
    delayed: Set<Entry>;
  }
  let best: Cand | null = null;
  /** best order when the night-view preference is ignored, to tell whether it changed anything */
  let bestPlain: Cand | null = null;
  let considered = 0;
  const exec = (order: Entry[], delayed: Set<Entry>): Cand => {
    const seq = buildSequence(order, parts, ctx, delayed);
    return { seq, run: runSequence(seq, ctx, delayed), delayed };
  };
  const worstByViolations = new Map<number, number>();

  const consider = (order: Entry[]): boolean => {
    const plain = exec(order, new Set());
    if (bestPlain === null || better(plain.run, bestPlain.run, false)) bestPlain = plain;
    // Let each night-view place wait for the evening, unless that breaks a hard rule.
    let cand = plain;
    if (plain.run.nightMiss > 0) {
      for (const e of order) {
        if (!isNightEntry(e) || !nightPossible(e.place, ctx)) continue;
        const trial = exec(order, new Set(cand.delayed).add(e));
        if (trial.run.violations <= cand.run.violations && trial.run.nightMiss < cand.run.nightMiss) {
          cand = trial;
        }
      }
    }
    const { run } = cand;
    considered++;
    worstByViolations.set(
      run.violations,
      Math.max(worstByViolations.get(run.violations) ?? 0, run.travel),
    );
    if (best === null || better(run, best.run)) {
      best = cand;
      return true;
    }
    return false;
  };

  const n = parts.free.length;
  let method: SearchResult['method'];
  if (n <= EXHAUSTIVE_LIMIT) {
    method = 'exhaustive';
    const order: Entry[] = [];
    const usedIdx = new Array<boolean>(n).fill(false);
    const walk = () => {
      if (order.length === n) {
        consider([...order]);
        return;
      }
      for (let i = 0; i < n; i++) {
        if (usedIdx[i]) continue;
        usedIdx[i] = true;
        order.push(parts.free[i]!);
        walk();
        order.pop();
        usedIdx[i] = false;
      }
    };
    walk();
  } else {
    method = 'heuristic';
    // Nearest neighbour from the day's start, then 2-opt.
    const rest = [...parts.free];
    let current: Entry[] = [];
    let at: Place | null = parts.startStay?.place ?? null;
    while (rest.length > 0) {
      let pick = 0;
      if (at) {
        let bestMin = Infinity;
        rest.forEach((e, i) => {
          const m = ctx.leg(at!, e.place)?.minutes ?? Infinity;
          if (m < bestMin) {
            bestMin = m;
            pick = i;
          }
        });
      }
      const [next] = rest.splice(pick, 1);
      current.push(next!);
      at = next!.place;
    }
    consider(current);
    let improved = true;
    for (let pass = 0; improved && pass < 50; pass++) {
      improved = false;
      for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          const candidate = [
            ...current.slice(0, i),
            ...current.slice(i, j + 1).reverse(),
            ...current.slice(j + 1),
          ];
          if (consider(candidate)) {
            current = candidate;
            improved = true;
          }
        }
      }
    }
  }

  const chosen = best as unknown as Cand;
  const plainBest = bestPlain as unknown as Cand;
  const nightMoved = chosen.run.placed.some(
    (p) =>
      isNightEntry(p.entry) &&
      p.start >= NIGHT_START &&
      plainBest.run.placed.some((q) => q.entry === p.entry && q.start < NIGHT_START),
  );
  return {
    nightMoved,
    delayed: [...chosen.delayed],
    seq: chosen.seq,
    run: chosen.run,
    worstTravel: worstByViolations.get(chosen.run.violations) ?? chosen.run.travel,
    considered,
    method,
  };
}

export function toItems(run: Run, ctx: DayCtx): PlanItem[] {
  return run.placed.map((p): PlanItem => {
    const { place, kind } = p.entry;
    const closed = kind !== 'stay' && !isOpenDuring(place, ctx.weekday, p.start, p.end);
    return {
      placeId: place.id,
      name: place.name,
      category: place.category,
      start: toHHMM(p.start),
      end: toHHMM(p.end),
      mine: p.entry.mine,
      fixed: kind === 'fixed',
      legFromPrev: p.leg
        ? {
            ...p.leg,
            overLimit:
              p.leg.mode === 'walk' && ctx.maxWalkMin !== null && p.leg.minutes > ctx.maxWalkMin,
          }
        : null,
      status: closed ? 'closed' : place.verification.status === 'unverified' ? 'unverified' : 'ok',
      alternatives: [],
    };
  });
}
