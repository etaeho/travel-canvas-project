import type { Place, Prefs, TripRequest } from '@needed/core';
import placesJson from '../../../data/gyeongju/places.json';
import tripJson from '../../../data/gyeongju/trip-2026-12-05.json';

export const PLACES = placesJson as Place[];
export const TRIP_TITLE: string = tripJson.title;
export const DEFAULT_PREFS = tripJson.prefs as Prefs;
export const DEFAULT_REQUEST = tripJson.request as TripRequest;

const tagsInData = new Set(PLACES.flatMap((p) => p.tags));
const present = (tags: string[]): string[] => tags.filter((t) => tagsInData.has(t));

/** Choices on the taste screen. Only tags that exist in the place data, so every choice has an effect. */
export const LIKE_TAGS = present(['한식', '유네스코', '박물관', '사찰', '고분', '전통차', '베이커리']);
export const MOOD_TAGS = present(['야경', '한옥', '실내', '연못', '평지']);

export const WALK_CHOICES = [5, 10, 15, 20, 30];
export const WAIT_CHOICES = [0, 10, 20, 30, 40, 60];

const byId = new Map(PLACES.map((p) => [p.id, p]));
export const placeOf = (id: string): Place | undefined => byId.get(id);
export const nameOf = (id: string): string => byId.get(id)?.name ?? id;
