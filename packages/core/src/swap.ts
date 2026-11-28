import { computeTotals, dayCtxFor, fillAlternatives, itemWarnings, orderStats } from './plan';
import {
  NIGHT_START,
  NIGHT_TAG,
  makeLegFn,
  runSequence,
  searchOrders,
  slotForStart,
  toItems,
  type Entry,
} from './schedule';
import { toMin } from './time';
import type { Plan, PlanContext } from './types';

export type SwapErrorCode = 'OUT_OF_RANGE' | 'MINE' | 'FIXED' | 'NOT_ALTERNATIVE' | 'UNKNOWN_PLACE';

export class SwapError extends Error {
  constructor(
    public readonly code: SwapErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SwapError';
  }
}

/**
 * Replaces one item with one of its alternatives and returns a new plan.
 * The day keeps its order. Times, legs, totals, warnings and alternatives are recalculated.
 */
export function swapItem(
  plan: Plan,
  dayIndex: number,
  itemIndex: number,
  altPlaceId: string,
  ctx: PlanContext,
): Plan {
  const day = plan.days[dayIndex];
  const target = day?.items[itemIndex];
  if (!day || !target) throw new SwapError('OUT_OF_RANGE', '바꿀 일정을 찾지 못했다.');
  if (target.fixed) throw new SwapError('FIXED', `${target.name}: 시간을 정한 일정은 바꿀 수 없다.`);
  if (target.mine) throw new SwapError('MINE', `${target.name}: 꼭 갈 곳은 바꿀 수 없다.`);
  if (!target.alternatives.some((a) => a.placeId === altPlaceId)) {
    throw new SwapError('NOT_ALTERNATIVE', `${target.name}: 추천한 대안이 아니다. (${altPlaceId})`);
  }

  const byId = new Map(ctx.places.map((p) => [p.id, p]));
  const lookup = (id: string) => {
    const p = byId.get(id);
    if (!p) throw new SwapError('UNKNOWN_PLACE', `장소 목록에 없는 곳이다: ${id}`);
    return p;
  };

  const seq: Entry[] = day.items.map((item, i): Entry => {
    const swapped = i === itemIndex;
    const place = lookup(swapped ? altPlaceId : item.placeId);
    const isStay = !swapped && item.category === 'stay' && item.placeId === ctx.request.stayId;
    const kind = item.fixed ? 'fixed' : isStay ? 'stay' : 'free';
    return {
      place,
      kind,
      mine: item.mine,
      slot: kind === 'free' && place.category === 'meal' ? slotForStart(toMin(item.start)) : null,
      fixedStart: item.fixed ? toMin(item.start) : 0,
      fixedEnd: item.fixed ? toMin(item.end) : 0,
      auto: !item.mine && !item.fixed,
    };
  });

  const leg = makeLegFn(ctx.request, ctx.prefs);
  const dctx = dayCtxFor(day.date, leg, ctx, dayIndex, plan.days.length);
  // A night-view place that was in the evening stays in the evening.
  const delayed = new Set(
    seq.filter(
      (e, i) =>
        e.kind === 'free' &&
        e.slot === null &&
        e.place.tags.includes(NIGHT_TAG) &&
        toMin(day.items[i]!.start) >= NIGHT_START,
    ),
  );
  const items = toItems(runSequence(seq, dctx, delayed), dctx);

  // The order is kept, but the comparison with other orders is refreshed for explainOrder.
  const first = seq[0];
  const last = seq[seq.length - 1];
  const search = searchOrders(
    {
      free: seq.filter((e) => e.kind === 'free'),
      fixed: seq.filter((e) => e.kind === 'fixed'),
      startStay: first?.kind === 'stay' && dayIndex > 0 ? first : null,
      endStay: last?.kind === 'stay' && dayIndex < plan.days.length - 1 ? last : null,
    },
    dctx,
  );

  const days = plan.days.map((d, i) =>
    i === dayIndex
      ? { date: d.date, items, order: orderStats(items, { ...search, nightMoved: d.order.nightMoved }) }
      : (JSON.parse(JSON.stringify(d)) as typeof d),
  );
  fillAlternatives(days, ctx, leg, { dayIndex, itemIndex, placeId: target.placeId });

  const oldItemWarnings = new Set(itemWarnings(plan.days, ctx));
  const kept = plan.warnings.filter((w) => !oldItemWarnings.has(w));
  return {
    days,
    totals: computeTotals(days, byId),
    warnings: [...kept, ...itemWarnings(days, ctx)],
  };
}
