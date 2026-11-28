import type { Draft } from '../lib/draft';
import { tripProblems } from '../lib/draft';
import { dateRangeLabel, nightsLabel } from '../lib/format';
import { Row, YesNo } from '../components/controls';

/** The planner's own defaults when a time is left empty (packages/core, TripRequest). */
const DEFAULT_ARRIVE = '09:30';
const DEFAULT_LEAVE = '20:30';

export function TripScreen(props: {
  draft: Draft;
  step: string;
  onChange: (patch: Partial<Draft>) => void;
  onNext: () => void;
  onEditPrefs: () => void;
}) {
  const { draft, step, onChange, onNext, onEditPrefs } = props;
  const problems = tripProblems(draft);
  const nights = nightsLabel(draft.startDate, draft.endDate);

  return (
    <form
      className="screen"
      onSubmit={(e) => {
        e.preventDefault();
        if (problems.length === 0) onNext();
      }}
    >
      <header className="screen-head">
        <span className="eyebrow">{step} · 여행 조건</span>
        <h1>어디로, 언제, 누구와?</h1>
      </header>

      <Row label="어디로" hint="지금은 경주만 됩니다.">
        <strong>{draft.city}</strong>
      </Row>
      <Row label="가는 날" htmlFor="trip-start">
        <input
          id="trip-start"
          type="date"
          required
          value={draft.startDate}
          onChange={(e) => onChange({ startDate: e.target.value })}
        />
      </Row>
      <Row label="오는 날" htmlFor="trip-end" hint={nights ? `${dateRangeLabel(draft.startDate, draft.endDate)} · ${nights}` : undefined}>
        <input
          id="trip-end"
          type="date"
          required
          min={draft.startDate}
          value={draft.endDate}
          onChange={(e) => onChange({ endDate: e.target.value })}
        />
      </Row>
      <Row label="인원" htmlFor="trip-count">
        <div className="stepper">
          <button type="button" aria-label="한 명 줄이기" disabled={draft.count <= 1} onClick={() => onChange({ count: draft.count - 1 })}>
            −
          </button>
          <input
            id="trip-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            value={draft.count}
            onChange={(e) => onChange({ count: Math.max(1, Math.min(30, Math.round(Number(e.target.value) || 1))) })}
          />
          <button type="button" aria-label="한 명 늘리기" disabled={draft.count >= 30} onClick={() => onChange({ count: draft.count + 1 })}>
            +
          </button>
        </div>
      </Row>
      <Row label="어르신이 함께 가나요" hint="함께 가면 덜 걷고 덜 다니게 짭니다.">
        <YesNo label="어르신이 함께 가나요" value={draft.withElder} onChange={(v) => onChange({ withElder: v })} />
      </Row>
      <Row label="한 사람 예산 (선택)" htmlFor="trip-budget" hint="비워 두면 예산을 따지지 않습니다. 오가는 교통비는 뺀 값입니다.">
        <span className="unit">
          <input
            id="trip-budget"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder="없음"
            value={draft.budgetPerPerson === null ? '' : draft.budgetPerPerson / 10000}
            onChange={(e) =>
              onChange({ budgetPerPerson: e.target.value === '' ? null : Math.round(Number(e.target.value) * 10000) })
            }
          />
          만 원
        </span>
      </Row>
      <Row label="도착 시각" htmlFor="trip-arrive" hint={`첫날 경주에 닿는 시각입니다. 비워 두면 ${DEFAULT_ARRIVE}부터 짭니다.`}>
        <input id="trip-arrive" type="time" value={draft.arriveAt} onChange={(e) => onChange({ arriveAt: e.target.value })} />
      </Row>
      <Row label="떠나는 시각" htmlFor="trip-leave" hint={`마지막 날 경주를 떠나는 시각입니다. 비워 두면 ${DEFAULT_LEAVE}까지 짭니다.`}>
        <input id="trip-leave" type="time" value={draft.leaveBy} onChange={(e) => onChange({ leaveBy: e.target.value })} />
      </Row>

      {problems.length > 0 ? (
        <ul className="problems" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <div className="actions">
        <button type="button" className="btn ghost" onClick={onEditPrefs}>
          취향 고치기
        </button>
        <button type="submit" className="btn primary" disabled={problems.length > 0}>
          다음
        </button>
      </div>
    </form>
  );
}
