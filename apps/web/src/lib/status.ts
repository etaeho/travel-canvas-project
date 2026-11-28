import type { Place, PlanItem } from '@needed/core';

export type Tone = 'good' | 'bad' | 'info' | 'idle';
export interface Badge {
  label: string;
  tone: Tone;
}

type Verification = Place['verification']['status'];

/** The label for how far a place has been checked. Only 'verified' may read "확인됨". */
export function verificationBadge(status: Verification | undefined): Badge {
  if (status === 'verified') return { label: '확인됨', tone: 'good' };
  if (status === 'partial') return { label: '일부 확인', tone: 'idle' };
  return { label: '확인 전', tone: 'idle' };
}

/**
 * The status badge of one itinerary item.
 * Closed wins. "확인됨" needs both the plan and the data to agree.
 */
export function itemBadge(itemStatus: PlanItem['status'], verification: Verification | undefined): Badge {
  if (itemStatus === 'closed') return { label: '쉬는 날', tone: 'bad' };
  if (itemStatus === 'unverified') return { label: '확인 전', tone: 'idle' };
  return verificationBadge(verification);
}
