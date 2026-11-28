import { describe, expect, it } from 'vitest';
import { PLACES } from '../data';
import { itemBadge, verificationBadge } from './status';

describe('verificationBadge', () => {
  it('maps each data status to its label', () => {
    expect(verificationBadge('verified').label).toBe('확인됨');
    expect(verificationBadge('partial').label).toBe('일부 확인');
    expect(verificationBadge('unverified').label).toBe('확인 전');
  });
  it('treats a missing place as not checked', () => {
    expect(verificationBadge(undefined).label).toBe('확인 전');
  });
  it('never calls a Gyeongju place 확인됨 unless the data says verified', () => {
    for (const p of PLACES) {
      const label = verificationBadge(p.verification.status).label;
      expect(label === '확인됨').toBe(p.verification.status === 'verified');
    }
  });
});

describe('itemBadge', () => {
  it('shows a closed day first', () => {
    expect(itemBadge('closed', 'verified')).toEqual({ label: '쉬는 날', tone: 'bad' });
  });
  it('shows 확인됨 only when the plan is ok and the data is verified', () => {
    expect(itemBadge('ok', 'verified').label).toBe('확인됨');
    expect(itemBadge('ok', 'partial').label).toBe('일부 확인');
    expect(itemBadge('ok', 'unverified').label).toBe('확인 전');
    expect(itemBadge('unverified', 'verified').label).toBe('확인 전');
    expect(itemBadge('ok', undefined).label).toBe('확인 전');
  });
});
