import { useState } from 'react';
import type { Prefs } from '@needed/core';
import { Chips, LimitSelect, Row, YesNo } from '../components/controls';
import { LIKE_TAGS, MOOD_TAGS, WAIT_CHOICES, WALK_CHOICES } from '../data';

export function PrefsScreen(props: {
  initial: Prefs;
  firstRun: boolean;
  onSave: (prefs: Prefs) => void;
  onCancel?: () => void;
}) {
  const { initial, firstRun, onSave, onCancel } = props;
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const set = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));

  return (
    <form
      className="screen"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(prefs);
      }}
    >
      <header className="screen-head">
        <span className="eyebrow">{firstRun ? '질문 1 / 3 · 취향' : '취향'}</span>
        <h1>어떤 여행을 좋아하나요?</h1>
        <p className="muted">한 번만 묻습니다. 모든 여행에 씁니다.</p>
      </header>

      <Row label="한 번에 걷는 시간" htmlFor="pref-walk">
        <LimitSelect id="pref-walk" value={prefs.maxWalkMin} choices={WALK_CHOICES} onChange={(v) => set({ maxWalkMin: v })} />
      </Row>
      <Row label="기다릴 수 있는 웨이팅" htmlFor="pref-wait">
        <LimitSelect id="pref-wait" value={prefs.maxWaitMin} choices={WAIT_CHOICES} onChange={(v) => set({ maxWaitMin: v })} />
      </Row>
      <Row label="차를 가져가나요">
        <YesNo label="차를 가져가나요" value={prefs.hasCar} onChange={(v) => set({ hasCar: v })} />
      </Row>

      <section className="block">
        <h2>좋아하는 것</h2>
        <Chips label="좋아하는 것" options={LIKE_TAGS} selected={prefs.likes} onChange={(likes) => set({ likes })} />
      </section>
      <section className="block">
        <h2>좋아하는 분위기</h2>
        <Chips label="좋아하는 분위기" options={MOOD_TAGS} selected={prefs.mood} onChange={(mood) => set({ mood })} />
        <p className="hint">고르지 않아도 됩니다.</p>
      </section>

      <div className="actions">
        {onCancel ? (
          <button type="button" className="btn ghost" onClick={onCancel}>
            취소
          </button>
        ) : null}
        <button type="submit" className="btn primary">
          {firstRun ? '저장하고 다음' : '저장'}
        </button>
      </div>
    </form>
  );
}
