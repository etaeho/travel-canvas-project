import { useMemo, useState } from 'react';
import { mergePrefs, type Prefs } from '@needed/core';
import type { Draft, Pick } from '../lib/draft';
import { pickProblems, setOverride } from '../lib/draft';
import { CATEGORY_LABEL, CATEGORY_ORDER, dateLabel, limitLabel, tripDates } from '../lib/format';
import { LIKE_TAGS, MOOD_TAGS, PLACES, WAIT_CHOICES, WALK_CHOICES, nameOf, placeOf } from '../data';
import { Chips, LimitSelect, Tag, YesNo } from '../components/controls';

const PREF_LABEL: Record<keyof Prefs, string> = {
  maxWalkMin: '한 번에 걷는 시간',
  maxWaitMin: '웨이팅',
  hasCar: '차',
  likes: '좋아하는 것',
  mood: '분위기',
};
const PREF_KEYS: (keyof Prefs)[] = ['maxWalkMin', 'maxWaitMin', 'hasCar', 'likes', 'mood'];

function prefText(key: keyof Prefs, prefs: Prefs): string {
  if (key === 'maxWalkMin') return limitLabel(prefs.maxWalkMin);
  if (key === 'maxWaitMin') return limitLabel(prefs.maxWaitMin);
  if (key === 'hasCar') return prefs.hasCar ? '가져감' : '안 가져감';
  const list = key === 'likes' ? prefs.likes : prefs.mood;
  return list.length > 0 ? list.join(', ') : '고르지 않음';
}

export function PicksScreen(props: {
  draft: Draft;
  prefs: Prefs;
  step: string;
  onChange: (patch: Partial<Draft>) => void;
  onBack: () => void;
  onPlan: () => void;
}) {
  const { draft, prefs, step, onChange, onBack, onPlan } = props;
  const [query, setQuery] = useState('');
  const dates = tripDates(draft.startDate, draft.endDate);
  const picked = new Set(draft.picks.map((p) => p.placeId));
  const problems = pickProblems(draft, nameOf);
  const { effective, overriddenKeys } = mergePrefs(prefs, draft.overrides);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = PLACES.filter(
      (p) =>
        p.category !== 'stay' &&
        (q === '' || p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q))),
    );
    return CATEGORY_ORDER.map((c) => ({ category: c, places: hit.filter((p) => p.category === c) })).filter(
      (g) => g.places.length > 0,
    );
  }, [query]);

  const setPicks = (picks: Pick[]) => onChange({ picks });
  const toggle = (id: string) =>
    setPicks(picked.has(id) ? draft.picks.filter((p) => p.placeId !== id) : [...draft.picks, { placeId: id, fixed: null }]);
  const patchPick = (id: string, fixed: Pick['fixed']) =>
    setPicks(draft.picks.map((p) => (p.placeId === id ? { ...p, fixed } : p)));
  const override = <K extends keyof Prefs>(key: K, value: Prefs[K] | undefined) =>
    onChange({ overrides: setOverride(draft.overrides, key, value) });

  return (
    <form
      className="screen"
      onSubmit={(e) => {
        e.preventDefault();
        if (problems.length === 0) onPlan();
      }}
    >
      <header className="screen-head">
        <span className="eyebrow">{step} · 꼭 갈 곳</span>
        <h1>꼭 가고 싶은 곳이 있나요?</h1>
        <p className="muted">고른 곳은 반드시 들어갑니다. 없으면 비워 두세요.</p>
      </header>

      <section className="block" aria-label="고른 곳">
        <h2>고른 곳 {draft.picks.length}곳</h2>
        {draft.picks.length === 0 ? <p className="hint">아직 고른 곳이 없습니다.</p> : null}
        <ul className="picked">
          {draft.picks.map((p) => {
            const place = placeOf(p.placeId);
            const fid = `fix-${p.placeId}`;
            return (
              <li key={p.placeId} className="pickcard" data-testid="picked">
                <div className="pickcard-top">
                  <b>{nameOf(p.placeId)}</b>
                  {place ? <Tag tone="idle">{CATEGORY_LABEL[place.category]}</Tag> : null}
                  <button type="button" className="btn small ghost" onClick={() => toggle(p.placeId)}>
                    빼기
                  </button>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={p.fixed !== null}
                    onChange={(e) =>
                      patchPick(
                        p.placeId,
                        e.target.checked ? { date: dates[0] ?? draft.startDate, start: '12:00', end: '13:00' } : null,
                      )
                    }
                  />
                  날짜와 시간을 정합니다
                </label>
                {p.fixed ? (
                  <div className="fixrow">
                    <label htmlFor={`${fid}-date`}>날짜</label>
                    <select
                      id={`${fid}-date`}
                      value={p.fixed.date}
                      onChange={(e) => patchPick(p.placeId, { ...p.fixed!, date: e.target.value })}
                    >
                      {(dates.includes(p.fixed.date) ? dates : [p.fixed.date, ...dates]).map((d) => (
                        <option key={d} value={d}>
                          {dateLabel(d)}
                        </option>
                      ))}
                    </select>
                    <label htmlFor={`${fid}-start`}>시작</label>
                    <input
                      id={`${fid}-start`}
                      type="time"
                      value={p.fixed.start}
                      onChange={(e) => patchPick(p.placeId, { ...p.fixed!, start: e.target.value })}
                    />
                    <label htmlFor={`${fid}-end`}>끝</label>
                    <input
                      id={`${fid}-end`}
                      type="time"
                      value={p.fixed.end}
                      onChange={(e) => patchPick(p.placeId, { ...p.fixed!, end: e.target.value })}
                    />
                    <p className="hint">정한 시간은 움직이지 않습니다.</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="block" aria-label="장소 찾기">
        <h2>
          <label htmlFor="place-search">장소 찾기</label>
        </h2>
        <input
          id="place-search"
          type="search"
          placeholder="이름이나 종류로 찾기"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {groups.length === 0 ? <p className="hint">찾는 곳이 목록에 없습니다.</p> : null}
        {groups.map((g) => (
          <div key={g.category} className="group">
            <h3>
              {CATEGORY_LABEL[g.category]} {g.places.length}곳
            </h3>
            <ul className="placelist">
              {g.places.map((p) => {
                const on = picked.has(p.id);
                return (
                  <li key={p.id}>
                    <button type="button" className={on ? 'placebtn on' : 'placebtn'} aria-pressed={on} onClick={() => toggle(p.id)}>
                      <span className="placebtn-name">{p.name}</span>
                      <span className="placebtn-tags">{p.tags.slice(0, 3).join(' · ')}</span>
                      <span className="placebtn-state">{on ? '✓ 고름' : '+ 더하기'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className="block" aria-label="이번 여행만 다른 것">
        <h2>이번 여행만 다른 것</h2>
        <p className="hint">켜면 이번 여행에만 씁니다. 저장한 취향은 그대로입니다.</p>
        {PREF_KEYS.map((key) => {
          const on = overriddenKeys.includes(key);
          return (
            <div key={key} className={on ? 'ovr on' : 'ovr'} data-testid={`override-${key}`}>
              <div className="ovr-top">
                <span className="ovr-name">
                  {PREF_LABEL[key]}
                  {on ? <Tag tone="info">이번만</Tag> : null}
                </span>
                <span className="ovr-value">{prefText(key, effective)}</span>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => override(key, e.target.checked ? prefs[key] : undefined)}
                />
                이번만 다르게
              </label>
              {on && key === 'maxWalkMin' ? (
                <LimitSelect id="ovr-walk" value={effective.maxWalkMin} choices={WALK_CHOICES} onChange={(v) => override('maxWalkMin', v)} />
              ) : null}
              {on && key === 'maxWaitMin' ? (
                <LimitSelect id="ovr-wait" value={effective.maxWaitMin} choices={WAIT_CHOICES} onChange={(v) => override('maxWaitMin', v)} />
              ) : null}
              {on && key === 'hasCar' ? (
                <YesNo label="이번에 차를 가져가나요" value={effective.hasCar} onChange={(v) => override('hasCar', v)} />
              ) : null}
              {on && key === 'likes' ? (
                <Chips label="이번에 좋아하는 것" options={LIKE_TAGS} selected={effective.likes} onChange={(v) => override('likes', v)} />
              ) : null}
              {on && key === 'mood' ? (
                <Chips label="이번에 좋아하는 분위기" options={MOOD_TAGS} selected={effective.mood} onChange={(v) => override('mood', v)} />
              ) : null}
            </div>
          );
        })}
      </section>

      {problems.length > 0 ? (
        <ul className="problems" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <div className="actions">
        <button type="button" className="btn ghost" onClick={onBack}>
          이전
        </button>
        <button type="submit" className="btn primary" disabled={problems.length > 0}>
          일정 만들기
        </button>
      </div>
    </form>
  );
}
