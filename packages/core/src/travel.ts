import type { Place, TravelEstimate, TravelMode } from './types';

export const WALK_DETOUR = 1.3;
export const WALK_KMH = 4.5;
export const WALK_KMH_ELDER = 3.5;
export const CAR_DETOUR = 1.4;
export const CAR_KMH = 30;
/** parking and walking from the car */
export const CAR_FIXED_MIN = 5;
/** with a car, walk a leg up to this long when maxWalkMin is null */
export const DEFAULT_WALK_OR_DRIVE_MIN = 10;

const EARTH_RADIUS_M = 6_371_000;

export type Coords = Pick<Place, 'lat' | 'lng'>;

export interface TravelOptions {
  withElder?: boolean;
  mode?: TravelMode;
}

export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Straight-line estimate. Returns null when either place has no coordinates:
 * a travel time is never invented.
 */
export function estimateTravel(a: Coords, b: Coords, opts: TravelOptions = {}): TravelEstimate | null {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  const straight = haversineMeters(a.lat, a.lng, b.lat, b.lng);
  const mode = opts.mode ?? 'walk';
  if (mode === 'car') {
    const meters = straight * CAR_DETOUR;
    return {
      minutes: Math.ceil((meters / 1000 / CAR_KMH) * 60) + CAR_FIXED_MIN,
      meters: Math.round(meters),
      mode: 'car',
      source: 'estimate',
    };
  }
  const meters = straight * WALK_DETOUR;
  const kmh = opts.withElder ? WALK_KMH_ELDER : WALK_KMH;
  return {
    minutes: Math.ceil((meters / 1000 / kmh) * 60),
    meters: Math.round(meters),
    mode: 'walk',
    source: 'estimate',
  };
}

/**
 * The leg a party would actually take.
 * No car: always walk. With a car: walk if it is within the walk limit, else drive.
 */
export function chooseTravel(
  a: Coords,
  b: Coords,
  opts: { withElder: boolean; hasCar: boolean; maxWalkMin: number | null },
): TravelEstimate | null {
  const walk = estimateTravel(a, b, { withElder: opts.withElder, mode: 'walk' });
  if (walk === null || !opts.hasCar) return walk;
  const limit = opts.maxWalkMin ?? DEFAULT_WALK_OR_DRIVE_MIN;
  return walk.minutes <= limit ? walk : estimateTravel(a, b, { mode: 'car' });
}
