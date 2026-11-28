import type { Place } from './types';

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error(`Invalid time: ${hhmm}`);
  }
  return h * 60 + m;
}

export function toHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

const parseDate = (date: string): Date => {
  const d = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  return d;
};

/** 0=Sun..6=Sat */
export function weekdayOf(date: string): number {
  return parseDate(date).getUTCDay();
}

export function datesBetween(start: string, end: string): string[] {
  const from = parseDate(start).getTime();
  const to = parseDate(end).getTime();
  if (to < from) throw new Error(`endDate ${end} is before startDate ${start}`);
  const out: string[] = [];
  for (let t = from; t <= to; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** e.g. "12월 5일(토)" */
export function dateLabel(date: string): string {
  const d = parseDate(date);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WEEKDAY_KO[d.getUTCDay()]})`;
}

export function won(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Opening intervals in minutes for one weekday.
 * [] = closed that day. null = hours unknown (no known restriction).
 */
export function openIntervals(place: Place, weekday: number): [number, number][] | null {
  if (place.closedDays.includes(weekday)) return [];
  if (!place.hours) return null;
  return place.hours
    .filter((h) => h.days.includes(weekday))
    .map((h): [number, number] => {
      const open = toMin(h.open);
      let close = toMin(h.close);
      if (close <= open) close += 1440; // closes after midnight
      return [open, close];
    })
    .sort((x, y) => x[0] - y[0]);
}

/** true when the whole visit fits one opening interval, or hours are unknown */
export function isOpenDuring(place: Place, weekday: number, start: number, end: number): boolean {
  const ivs = openIntervals(place, weekday);
  if (ivs === null) return true;
  return ivs.some(([o, c]) => o <= start && end <= c);
}
