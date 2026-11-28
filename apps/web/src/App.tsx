import { useEffect, useState } from 'react';
import { mergePrefs, planTrip, swapItem, type Plan, type PlanContext, type Prefs } from '@needed/core';
import { DEFAULT_PREFS, DEFAULT_REQUEST, PLACES, TRIP_TITLE, nameOf } from './data';
import { buildRequest, draftFromRequest, type Draft } from './lib/draft';
import { minutesLabel, won } from './lib/format';
import { loadDraft, loadPrefs, saveDraft, savePrefs } from './lib/storage';
import { PicksScreen } from './screens/PicksScreen';
import { PlanScreen } from './screens/PlanScreen';
import { PrefsScreen } from './screens/PrefsScreen';
import { TripScreen } from './screens/TripScreen';

type Screen = 'prefs' | 'trip' | 'picks' | 'plan';

/** One sentence on what a swap did to the three totals. */
function swapNotice(from: string, to: string, before: Plan['totals'], after: Plan['totals']): string {
  const parts: string[] = [];
  if (before.walkMinutes !== after.walkMinutes) {
    parts.push(`걷는 시간 ${minutesLabel(before.walkMinutes)} → ${minutesLabel(after.walkMinutes)}`);
  }
  if (before.driveMinutes !== after.driveMinutes) {
    parts.push(`운전 시간 ${minutesLabel(before.driveMinutes)} → ${minutesLabel(after.driveMinutes)}`);
  }
  if (before.costPerPerson !== after.costPerPerson) {
    parts.push(`1인 경비 ${won(before.costPerPerson)} → ${won(after.costPerPerson)}`);
  }
  const head = `${from} 대신 ${to}에 갑니다.`;
  return parts.length > 0 ? `${head} ${parts.join(', ')}.` : `${head} 합계는 그대로입니다.`;
}

export function App() {
  const [prefs, setPrefs] = useState<Prefs | null>(() => loadPrefs());
  const [draft, setDraft] = useState<Draft>(() => loadDraft() ?? draftFromRequest(DEFAULT_REQUEST));
  const [screen, setScreen] = useState<Screen>(() => (loadPrefs() ? 'trip' : 'prefs'));
  const [firstRun] = useState(() => loadPrefs() === null);
  const [result, setResult] = useState<{ plan: Plan; ctx: PlanContext } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const step = (n: number) => (firstRun ? `질문 ${n + 1} / 3` : `질문 ${n} / 2`);

  const makePlan = (next: Draft, base: Prefs): boolean => {
    try {
      const request = buildRequest(next);
      const effective = mergePrefs(base, next.overrides).effective;
      setResult({ plan: planTrip(request, effective, PLACES), ctx: { request, prefs: effective, places: PLACES } });
      setError(null);
      setNotice(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const swap = (dayIndex: number, itemIndex: number, altPlaceId: string) => {
    if (!result) return;
    try {
      const from = result.plan.days[dayIndex]?.items[itemIndex]?.name ?? '';
      const plan = swapItem(result.plan, dayIndex, itemIndex, altPlaceId, result.ctx);
      setNotice(swapNotice(from, nameOf(altPlaceId), result.plan.totals, plan.totals));
      setResult({ plan, ctx: result.ctx });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const chooseStay = (stayId: string | null) => {
    if (!prefs) return;
    const next = { ...draft, stayId };
    setDraft(next);
    if (makePlan(next, prefs)) {
      setNotice(stayId ? `숙소는 ${nameOf(stayId)}. 일정을 다시 짰습니다.` : '숙소를 풀었습니다. 일정을 다시 짰습니다.');
    }
  };

  return (
    <main className="app">
      <div className="brand">니디드</div>
      {error ? (
        <p className="problems" role="alert">
          일정을 만들지 못했습니다. {error}
        </p>
      ) : null}

      {screen === 'prefs' || !prefs ? (
        <PrefsScreen
          initial={prefs ?? DEFAULT_PREFS}
          firstRun={!prefs}
          onSave={(p) => {
            savePrefs(p);
            setPrefs(p);
            setScreen('trip');
          }}
          onCancel={prefs ? () => setScreen('trip') : undefined}
        />
      ) : screen === 'trip' ? (
        <TripScreen draft={draft} step={step(1)} onChange={patch} onNext={() => setScreen('picks')} onEditPrefs={() => setScreen('prefs')} />
      ) : screen === 'picks' ? (
        <PicksScreen
          draft={draft}
          prefs={prefs}
          step={step(2)}
          onChange={patch}
          onBack={() => setScreen('trip')}
          onPlan={() => {
            if (makePlan(draft, prefs)) setScreen('plan');
          }}
        />
      ) : result ? (
        <PlanScreen
          title={TRIP_TITLE}
          request={result.ctx.request}
          plan={result.plan}
          notice={notice}
          onSwap={swap}
          onChooseStay={chooseStay}
          onEdit={() => setScreen('trip')}
        />
      ) : null}
    </main>
  );
}
