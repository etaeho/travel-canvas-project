// Synthetic places for tests only. None of these are real places.
import type { Place, Prefs, TripRequest, Category } from '../src/index';

export const BASE = { lat: 35.835, lng: 129.21 };

export function place(
  id: string,
  category: Category,
  dLat: number,
  dLng: number,
  extra: Partial<Place> = {},
): Place {
  return {
    id,
    name: `테스트 장소 ${id}`,
    category,
    lat: BASE.lat + dLat,
    lng: BASE.lng + dLng,
    address: null,
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: '09:00', close: '21:00' }],
    closedDays: [],
    stayMinutes: category === 'meal' ? 60 : 40,
    costPerPerson: 0,
    tags: [],
    elderNote: null,
    verification: { status: 'verified', checkedAt: '2026-11-28', sources: ['test'], notes: null },
    ...extra,
  };
}

export const prefs = (over: Partial<Prefs> = {}): Prefs => ({
  maxWalkMin: null,
  maxWaitMin: null,
  hasCar: false,
  likes: [],
  mood: [],
  ...over,
});

export const request = (over: Partial<TripRequest> = {}): TripRequest => ({
  city: '테스트 도시',
  startDate: '2026-12-05',
  endDate: '2026-12-05',
  party: { count: 2, withElder: false },
  budgetPerPerson: null,
  stayId: null,
  mustVisit: [],
  fixed: [],
  ...over,
});

export function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) =>
    permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]),
  );
}
