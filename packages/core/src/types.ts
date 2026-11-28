export type Category = 'stay' | 'meal' | 'cafe' | 'sight' | 'activity' | 'bar';

/** Shared with the data team. Do not rename fields. */
export interface Place {
  id: string;
  name: string;
  category: Category;
  lat: number | null;
  lng: number | null;
  address: string | null;
  /** days: 0=Sun..6=Sat, times 'HH:MM' */
  hours: { days: number[]; open: string; close: string }[] | null;
  /** weekly closed days, 0=Sun..6=Sat */
  closedDays: number[];
  stayMinutes: number | null;
  /** KRW */
  costPerPerson: number | null;
  tags: string[];
  elderNote: string | null;
  verification: {
    status: 'verified' | 'partial' | 'unverified';
    checkedAt: string | null;
    sources: string[];
    notes: string | null;
  };
}

export interface Prefs {
  /** null = no limit this trip */
  maxWalkMin: number | null;
  /** null = no limit this trip */
  maxWaitMin: number | null;
  hasCar: boolean;
  likes: string[];
  mood: string[];
}

export type TravelMode = 'walk' | 'car';

export interface TravelEstimate {
  minutes: number;
  meters: number;
  mode: TravelMode;
  source: 'estimate';
}

export interface TripRequest {
  city: string;
  /** 'YYYY-MM-DD' */
  startDate: string;
  endDate: string;
  party: { count: number; withElder: boolean };
  budgetPerPerson: number | null;
  stayId: string | null;
  /** place ids */
  mustVisit: string[];
  fixed: { placeId: string; date: string; start: string; end: string }[];
  /** 'HH:MM'. The first day starts then. Default 09:30. */
  arriveAt?: string;
  /** 'HH:MM'. The last day must end by then. Default 20:30. */
  leaveBy?: string;
}

export interface Leg extends TravelEstimate {
  /** true only for a walking leg longer than the effective maxWalkMin */
  overLimit: boolean;
}

export interface Alternative {
  placeId: string;
  name: string;
  /** Korean, one line */
  reason: string;
  delta: { walkMinutes: number; driveMinutes: number; costPerPerson: number };
}

export interface PlanItem {
  placeId: string;
  name: string;
  category: Category;
  /** 'HH:MM' */
  start: string;
  end: string;
  /** the user's must-visit (or the user's chosen stay) */
  mine: boolean;
  /** user-fixed time */
  fixed: boolean;
  legFromPrev: Leg | null;
  status: 'ok' | 'closed' | 'unverified';
  alternatives: Alternative[];
}

/** How the day's order was chosen. Used by explainOrder. */
export interface OrderStats {
  /** walk + drive minutes of the chosen order */
  travelMinutes: number;
  walkMinutes: number;
  driveMinutes: number;
  /** travel minutes of the worst comparable order that was considered */
  worstTravelMinutes: number;
  /** number of orders evaluated */
  considered: number;
  method: 'exhaustive' | 'heuristic';
  /** a night-view place was moved to the evening, changing the order */
  nightMoved: boolean;
}

export interface PlanDay {
  date: string;
  items: PlanItem[];
  order: OrderStats;
}

export interface Plan {
  days: PlanDay[];
  totals: { walkMinutes: number; driveMinutes: number; costPerPerson: number };
  /** Korean, short */
  warnings: string[];
}

/** What swapItem needs to recalculate a plan. Pass the same values planTrip got. */
export interface PlanContext {
  request: TripRequest;
  prefs: Prefs;
  places: Place[];
}
