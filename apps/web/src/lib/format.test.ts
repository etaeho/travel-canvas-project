import { describe, expect, it } from 'vitest';
import {
  costLabel,
  dateLabel,
  dateRangeLabel,
  deltaLabel,
  hoursLines,
  legLabel,
  limitLabel,
  minutesLabel,
  nightsLabel,
  partyLabel,
  sourceHost,
  tripDates,
  won,
} from './format';

describe('won', () => {
  it('adds commas and the unit', () => {
    expect(won(6000)).toBe('6,000원');
    expect(won(0)).toBe('0원');
    expect(won(-3000)).toBe('-3,000원');
    expect(won(1234567)).toBe('1,234,567원');
  });
});

describe('dates', () => {
  it('labels a date with its weekday', () => {
    expect(dateLabel('2026-12-05')).toBe('12월 5일(토)');
    expect(dateLabel('2026-12-06')).toBe('12월 6일(일)');
  });
  it('returns the text as is when it is not a date', () => {
    expect(dateLabel('')).toBe('');
  });
  it('labels a range', () => {
    expect(dateRangeLabel('2026-12-05', '2026-12-06')).toBe('12월 5일(토) ~ 12월 6일(일)');
    expect(dateRangeLabel('2026-12-05', '2026-12-05')).toBe('12월 5일(토)');
  });
  it('lists the trip dates and rejects a backwards range', () => {
    expect(tripDates('2026-12-05', '2026-12-06')).toEqual(['2026-12-05', '2026-12-06']);
    expect(tripDates('2026-12-06', '2026-12-05')).toEqual([]);
    expect(tripDates('', '2026-12-05')).toEqual([]);
  });
  it('counts nights', () => {
    expect(nightsLabel('2026-12-05', '2026-12-06')).toBe('1박 2일');
    expect(nightsLabel('2026-12-05', '2026-12-05')).toBe('당일');
  });
});

describe('minutes and legs', () => {
  it('writes minutes plainly', () => {
    expect(minutesLabel(0)).toBe('0분');
    expect(minutesLabel(50)).toBe('50분');
    expect(minutesLabel(60)).toBe('1시간');
    expect(minutesLabel(80)).toBe('1시간 20분');
  });
  it('labels a leg by how the party moves', () => {
    expect(legLabel({ mode: 'walk', minutes: 6 })).toBe('걸어서 6분');
    expect(legLabel({ mode: 'car', minutes: 12 })).toBe('차로 12분');
  });
  it('says so when the time is not known', () => {
    expect(legLabel(null)).toBe('이동 시간 모름');
  });
});

describe('deltaLabel', () => {
  it('lists only what changes, with a sign', () => {
    expect(deltaLabel({ walkMinutes: 3, driveMinutes: -26, costPerPerson: -3000 })).toBe(
      '걷기 +3분 · 운전 -26분 · 경비 -3,000원',
    );
    expect(deltaLabel({ walkMinutes: 0, driveMinutes: 0, costPerPerson: 4000 })).toBe('경비 +4,000원');
  });
  it('says nothing changes when all are zero', () => {
    expect(deltaLabel({ walkMinutes: 0, driveMinutes: 0, costPerPerson: 0 })).toBe('이동과 경비는 그대로');
  });
});

describe('small labels', () => {
  it('labels a limit', () => {
    expect(limitLabel(10)).toBe('10분까지');
    expect(limitLabel(0)).toBe('기다리지 않음');
    expect(limitLabel(null)).toBe('한도 없음');
  });
  it('labels the party', () => {
    expect(partyLabel(5, true)).toBe('5명 · 어르신 동행');
    expect(partyLabel(2, false)).toBe('2명');
  });
  it('never shows an unknown cost as 0원', () => {
    expect(costLabel(null)).toBe('값 모름');
    expect(costLabel(0)).toBe('무료');
    expect(costLabel(3000)).toBe('1인 3,000원');
  });
  it('shortens a source link to its host', () => {
    expect(sourceHost('https://www.gyeongju.go.kr/news/page.do?a=1')).toBe('gyeongju.go.kr');
    expect(sourceHost('not a url')).toBe('not a url');
  });
});

describe('hoursLines', () => {
  it('writes every day as 매일', () => {
    expect(
      hoursLines({ hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: '09:00', close: '17:00' }], closedDays: [] }),
    ).toEqual(['매일 09:00~17:00']);
  });
  it('names the days and the closed day', () => {
    expect(
      hoursLines({ hours: [{ days: [2, 3, 4, 5, 6, 0], open: '11:00', close: '20:00' }], closedDays: [1] }),
    ).toEqual(['일·화·수·목·금·토 11:00~20:00', '쉬는 날 월요일']);
  });
  it('says so when hours are not known', () => {
    expect(hoursLines({ hours: null, closedDays: [] })).toEqual(['여는 시간 모름']);
  });
});
