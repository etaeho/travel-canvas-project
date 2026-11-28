import type { Alternative, Category, Leg, Place } from '@needed/core';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export const CATEGORY_LABEL: Record<Category, string> = {
  stay: '숙소',
  meal: '식사',
  cafe: '카페',
  sight: '볼거리',
  activity: '체험',
  bar: '술집',
};
export const CATEGORY_ORDER: Category[] = ['sight', 'meal', 'cafe', 'activity', 'bar', 'stay'];

const comma = (n: number): string =>
  Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 6000 → "6,000원" */
export function won(n: number): string {
  return `${n < 0 ? '-' : ''}${comma(n)}원`;
}

const parse = (date: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** '2026-12-05' → "12월 5일(토)" */
export function dateLabel(date: string): string {
  const d = parse(date);
  if (!d) return date;
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WEEKDAY[d.getUTCDay()]})`;
}

export function dateRangeLabel(start: string, end: string): string {
  return start === end ? dateLabel(start) : `${dateLabel(start)} ~ ${dateLabel(end)}`;
}

/** Every date from start to end. [] when the range is not valid. */
export function tripDates(start: string, end: string): string[] {
  const a = parse(start);
  const b = parse(end);
  if (!a || !b || b < a) return [];
  const out: string[] = [];
  for (let t = a.getTime(); t <= b.getTime() && out.length < 60; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** "1박 2일", "당일" */
export function nightsLabel(start: string, end: string): string {
  const n = tripDates(start, end).length;
  if (n === 0) return '';
  return n === 1 ? '당일' : `${n - 1}박 ${n}일`;
}

/** 50 → "50분", 80 → "1시간 20분" */
export function minutesLabel(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}시간` : `${h}시간 ${rest}분`;
}

/** The leg from the previous stop. null means the time could not be calculated. */
export function legLabel(leg: Pick<Leg, 'mode' | 'minutes'> | null): string {
  if (!leg) return '이동 시간 모름';
  return `${leg.mode === 'walk' ? '걸어서' : '차로'} ${minutesLabel(leg.minutes)}`;
}

const signed = (n: number, unit: (v: number) => string): string =>
  `${n > 0 ? '+' : '-'}${unit(Math.abs(n))}`;

/** What changes when the alternative is taken. */
export function deltaLabel(delta: Alternative['delta']): string {
  const parts: string[] = [];
  if (delta.walkMinutes !== 0) parts.push(`걷기 ${signed(delta.walkMinutes, minutesLabel)}`);
  if (delta.driveMinutes !== 0) parts.push(`운전 ${signed(delta.driveMinutes, minutesLabel)}`);
  if (delta.costPerPerson !== 0) parts.push(`경비 ${signed(delta.costPerPerson, won)}`);
  return parts.length > 0 ? parts.join(' · ') : '이동과 경비는 그대로';
}

export function limitLabel(min: number | null): string {
  if (min === null) return '한도 없음';
  return min === 0 ? '기다리지 않음' : `${minutesLabel(min)}까지`;
}

export function partyLabel(count: number, withElder: boolean): string {
  return withElder ? `${count}명 · 어르신 동행` : `${count}명`;
}

export function costLabel(cost: number | null): string {
  if (cost === null) return '값 모름';
  return cost === 0 ? '무료' : `1인 ${won(cost)}`;
}

const daysLabel = (days: number[]): string => {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return '매일';
  return sorted.map((d) => WEEKDAY[d]).join('·');
};

/** Opening hours as short lines. null hours → one line saying it is not known. */
export function hoursLines(place: Pick<Place, 'hours' | 'closedDays'>): string[] {
  const lines =
    place.hours === null
      ? ['여는 시간 모름']
      : place.hours.map((h) => `${daysLabel(h.days)} ${h.open}~${h.close}`);
  if (place.closedDays.length > 0) lines.push(`쉬는 날 ${daysLabel(place.closedDays)}요일`);
  return lines;
}

/** 'https://www.example.com/a/b' → 'example.com' */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
