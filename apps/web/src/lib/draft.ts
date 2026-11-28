import type { Prefs, TripRequest } from '@needed/core';
import type { PrefsOverrides } from '@needed/core';
import { tripDates } from './format';

export interface Pick {
  placeId: string;
  /** null: the planner chooses the time */
  fixed: { date: string; start: string; end: string } | null;
}

/** What the person typed into the question screens. */
export interface Draft {
  city: string;
  startDate: string;
  endDate: string;
  count: number;
  withElder: boolean;
  /** KRW per person. null: not given */
  budgetPerPerson: number | null;
  /** 'HH:MM' or '' when not known */
  arriveAt: string;
  leaveBy: string;
  stayId: string | null;
  picks: Pick[];
  overrides: PrefsOverrides;
}

export function draftFromRequest(request: TripRequest, overrides: PrefsOverrides = {}): Draft {
  const ids = [...new Set([...request.mustVisit, ...request.fixed.map((f) => f.placeId)])];
  return {
    city: request.city,
    startDate: request.startDate,
    endDate: request.endDate,
    count: request.party.count,
    withElder: request.party.withElder,
    budgetPerPerson: request.budgetPerPerson,
    arriveAt: request.arriveAt ?? '',
    leaveBy: request.leaveBy ?? '',
    stayId: request.stayId,
    picks: ids.map((placeId) => {
      const f = request.fixed.find((x) => x.placeId === placeId);
      return { placeId, fixed: f ? { date: f.date, start: f.start, end: f.end } : null };
    }),
    overrides,
  };
}

/** Every picked place is a must-visit. A pick with a time is also a fixed item. */
export function buildRequest(draft: Draft): TripRequest {
  const request: TripRequest = {
    city: draft.city,
    startDate: draft.startDate,
    endDate: draft.endDate,
    party: { count: draft.count, withElder: draft.withElder },
    budgetPerPerson: draft.budgetPerPerson,
    stayId: draft.stayId,
    mustVisit: draft.picks.map((p) => p.placeId),
    fixed: draft.picks.flatMap((p) => (p.fixed ? [{ placeId: p.placeId, ...p.fixed }] : [])),
  };
  if (draft.arriveAt) request.arriveAt = draft.arriveAt;
  if (draft.leaveBy) request.leaveBy = draft.leaveBy;
  return request;
}

/** Problems with the trip screen that stop the next step. Korean, one line each. */
export function tripProblems(draft: Draft): string[] {
  const out: string[] = [];
  if (tripDates(draft.startDate, draft.endDate).length === 0) {
    out.push('돌아오는 날이 떠나는 날보다 빠릅니다.');
  }
  if (!Number.isInteger(draft.count) || draft.count < 1) out.push('인원은 1명부터입니다.');
  if (draft.budgetPerPerson !== null && draft.budgetPerPerson < 0) out.push('예산은 0원부터입니다.');
  return out;
}

/** Problems with the picks screen. */
export function pickProblems(draft: Draft, nameOf: (id: string) => string): string[] {
  const dates = tripDates(draft.startDate, draft.endDate);
  const out: string[] = [];
  for (const p of draft.picks) {
    if (!p.fixed) continue;
    const name = nameOf(p.placeId);
    if (!p.fixed.start || !p.fixed.end) out.push(`${name}: 시작과 끝 시각을 모두 넣어 주세요.`);
    else if (p.fixed.end <= p.fixed.start) out.push(`${name}: 끝 시각이 시작 시각보다 늦어야 합니다.`);
    if (!dates.includes(p.fixed.date)) out.push(`${name}: 날짜가 여행 기간 밖입니다.`);
  }
  return out;
}

/** Keeps only the override keys that are switched on. */
export function setOverride<K extends keyof Prefs>(
  overrides: PrefsOverrides,
  key: K,
  value: Prefs[K] | undefined,
): PrefsOverrides {
  const next: PrefsOverrides = { ...overrides };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}
