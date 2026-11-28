import type { Category, Place, Plan } from '@needed/core';
import { CATEGORY_LABEL, CATEGORY_ORDER } from './format';

export interface CostRow {
  category: Category;
  label: string;
  /** sum of the known costs, KRW per person */
  sum: number;
  /** names with a known cost */
  known: string[];
  /** names whose cost is not known */
  unknown: string[];
}

export interface CostView {
  rows: CostRow[];
  unknownCount: number;
  /** false when the rows do not add up to the plan's own total. Then only the plan's total is shown. */
  matchesPlan: boolean;
}

/**
 * Groups the plan's costs by category for display. The total itself always comes from plan.totals.
 * A stay shows at the end of one day and the start of the next. It is listed once.
 */
export function costView(plan: Plan, places: Place[]): CostView {
  const byId = new Map(places.map((p) => [p.id, p]));
  const rows = new Map<Category, CostRow>();
  plan.days.forEach((day, d) =>
    day.items.forEach((item, i) => {
      if (item.category === 'stay' && i === 0 && d > 0) return;
      const row = rows.get(item.category) ?? {
        category: item.category,
        label: CATEGORY_LABEL[item.category],
        sum: 0,
        known: [],
        unknown: [],
      };
      const cost = byId.get(item.placeId)?.costPerPerson ?? null;
      if (cost === null) row.unknown.push(item.name);
      else {
        row.sum += cost;
        row.known.push(item.name);
      }
      rows.set(item.category, row);
    }),
  );
  const list = CATEGORY_ORDER.flatMap((c) => rows.get(c) ?? []);
  return {
    rows: list,
    unknownCount: list.reduce((s, r) => s + r.unknown.length, 0),
    matchesPlan: list.reduce((s, r) => s + r.sum, 0) === plan.totals.costPerPerson,
  };
}

/** Legs whose time could not be calculated. The first stop of a day has no leg and is not counted. */
export function unknownLegCount(plan: Plan): number {
  return plan.days.reduce(
    (s, day) => s + day.items.filter((item, i) => i > 0 && item.legFromPrev === null).length,
    0,
  );
}
