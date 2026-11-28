import { useState } from 'react';
import { explainOrder, type Place, type Plan, type PlanItem, type TripRequest } from '@needed/core';
import { PlaceSheet } from '../components/PlaceSheet';
import { Tag } from '../components/controls';
import { PLACES, placeOf } from '../data';
import { costView, unknownLegCount } from '../lib/cost';
import {
  costLabel,
  dateLabel,
  dateRangeLabel,
  deltaLabel,
  legLabel,
  minutesLabel,
  nightsLabel,
  partyLabel,
  won,
} from '../lib/format';
import { itemBadge, verificationBadge } from '../lib/status';

type TabKey = 'plan' | 'stay' | 'cost';
const TABS: [TabKey, string][] = [
  ['plan', '일정'],
  ['stay', '숙소'],
  ['cost', '경비'],
];

export function PlanScreen(props: {
  title: string;
  request: TripRequest;
  plan: Plan;
  notice: string | null;
  onSwap: (dayIndex: number, itemIndex: number, altPlaceId: string) => void;
  onChooseStay: (stayId: string | null) => void;
  onEdit: () => void;
}) {
  const { title, request, plan, notice, onSwap, onChooseStay, onEdit } = props;
  const [tab, setTab] = useState<TabKey>('plan');
  const [sheet, setSheet] = useState<Place | null>(null);
  const cost = costView(plan, PLACES);
  const unknownLegs = unknownLegCount(plan);
  const stay = request.stayId ? placeOf(request.stayId) : undefined;

  return (
    <div className="screen plan">
      <header className="planhead">
        <h1>{title}</h1>
        <div className="planmeta">
          <span>
            {dateRangeLabel(request.startDate, request.endDate)} · {nightsLabel(request.startDate, request.endDate)}
          </span>
          <span>{partyLabel(request.party.count, request.party.withElder)}</span>
          <span>숙소 · {stay ? stay.name : '정하지 않음'}</span>
        </div>
        <button type="button" className="btn onaccent" onClick={onEdit}>
          조건 고치기
        </button>
      </header>

      <div className="stats" aria-label="합계">
        <div>
          <b data-testid="total-walk">{minutesLabel(plan.totals.walkMinutes)}</b>
          <span>걷는 시간</span>
        </div>
        <div>
          <b data-testid="total-drive">{minutesLabel(plan.totals.driveMinutes)}</b>
          <span>운전 시간</span>
        </div>
        <div>
          <b data-testid="total-cost">{won(plan.totals.costPerPerson)}</b>
          <span>{cost.unknownCount > 0 ? '1인 경비 · 아는 값만' : '1인 경비'}</span>
        </div>
      </div>
      {cost.unknownCount > 0 || unknownLegs > 0 ? (
        <p className="unknowns" data-testid="unknowns">
          {unknownLegs > 0 ? <span>이동 시간을 모르는 구간 {unknownLegs}곳은 합계에서 빠졌습니다. </span> : null}
          {cost.unknownCount > 0 ? <span>경비는 모르는 값 {cost.unknownCount}곳을 뺀 합계입니다.</span> : null}
        </p>
      ) : null}

      <p className="notice" role="status" aria-live="polite" data-testid="notice" hidden={!notice}>
        {notice}
      </p>

      {plan.warnings.length > 0 ? (
        <details className="warnings" open>
          <summary>확인할 것 {plan.warnings.length}건</summary>
          <ul data-testid="warnings">
            {plan.warnings.map((w, i) => (
              <li key={`${i}-${w}`}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="tabs" role="tablist" aria-label="일정표">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            className={tab === key ? 'tab on' : 'tab'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'plan' ? <DaysTab plan={plan} onSwap={onSwap} onOpen={setSheet} /> : null}
        {tab === 'stay' ? <StayTab stayId={request.stayId} onChoose={onChooseStay} onOpen={setSheet} /> : null}
        {tab === 'cost' ? <CostTab plan={plan} budget={request.budgetPerPerson} /> : null}
      </div>

      {sheet ? <PlaceSheet key={sheet.id} place={sheet} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

function DaysTab(props: {
  plan: Plan;
  onSwap: (dayIndex: number, itemIndex: number, altPlaceId: string) => void;
  onOpen: (place: Place) => void;
}) {
  const { plan, onSwap, onOpen } = props;
  const [closed, setClosed] = useState<Record<number, boolean>>({});
  const [altOpen, setAltOpen] = useState<string | null>(null);

  return (
    <>
      {plan.days.map((day, d) => {
        const open = !closed[d];
        return (
          <section key={day.date} className="day" data-testid="day" data-date={day.date}>
            <button
              type="button"
              className="dayhead"
              aria-expanded={open}
              onClick={() => setClosed((c) => ({ ...c, [d]: open }))}
            >
              <span className="daynum">
                <small>DAY</small>
                <b>{d + 1}</b>
              </span>
              <span className="daytitle">
                {dateLabel(day.date)}
                <small>{day.items.length}곳</small>
              </span>
              <span className="daytoggle">{open ? '접기' : '펴기'}</span>
            </button>
            {open ? (
              <div className="dayin">
                <p className="sumbox">{explainOrder(plan, d)}</p>
                {day.items.length === 0 ? <p className="hint">이 날은 넣은 곳이 없습니다.</p> : null}
                <ol className="tl">
                  {day.items.map((item, i) => (
                    <Item
                      key={`${item.placeId}-${i}`}
                      item={item}
                      first={i === 0}
                      altOpen={altOpen === `${d}-${i}`}
                      onToggleAlts={() => setAltOpen(altOpen === `${d}-${i}` ? null : `${d}-${i}`)}
                      onSwap={(alt) => {
                        setAltOpen(null);
                        onSwap(d, i, alt);
                      }}
                      onOpen={onOpen}
                    />
                  ))}
                </ol>
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

function Item(props: {
  item: PlanItem;
  first: boolean;
  altOpen: boolean;
  onToggleAlts: () => void;
  onSwap: (altPlaceId: string) => void;
  onOpen: (place: Place) => void;
}) {
  const { item, first, altOpen, onToggleAlts, onSwap, onOpen } = props;
  const place = placeOf(item.placeId);
  const badge = itemBadge(item.status, place?.verification.status);
  const canSwap = !item.mine && !item.fixed;
  const over = item.legFromPrev?.overLimit === true;

  return (
    <li className={item.status === 'closed' ? 'tl-item bad' : 'tl-item'} data-testid="item" data-place={item.placeId}>
      {first ? null : (
        <div className={over ? 'leg over' : 'leg'} data-testid="leg">
          {legLabel(item.legFromPrev)}
          {over ? <Tag tone="bad">걷는 한도 넘음</Tag> : null}
        </div>
      )}
      <div className="tl-row">
        <time>
          {item.start}
          {item.end !== item.start ? <span>~{item.end}</span> : null}
        </time>
        <div className="tl-body">
          <button
            type="button"
            className="namebtn"
            disabled={!place}
            onClick={() => place && onOpen(place)}
            aria-label={`${item.name} 자세히 보기`}
          >
            {item.name}
          </button>
          <div className="badges">
            {item.mine ? <Tag tone="info">내가 고른 곳</Tag> : null}
            {item.fixed ? <Tag tone="info">시간 고정</Tag> : null}
            <Tag tone={badge.tone}>{badge.label}</Tag>
            <span className="mv">{costLabel(place?.costPerPerson ?? null)}</span>
          </div>
          {canSwap ? (
            item.alternatives.length > 0 ? (
              <button type="button" className="altbtn" aria-expanded={altOpen} onClick={onToggleAlts} data-testid="alt-toggle">
                대안 {item.alternatives.length}곳
              </button>
            ) : (
              <p className="hint" data-testid="no-alts">
                바꿀 만한 대안이 없습니다.
              </p>
            )
          ) : null}
          {canSwap && altOpen ? (
            <ul className="alts" data-testid="alts">
              {item.alternatives.map((alt) => {
                const altPlace = placeOf(alt.placeId);
                const altBadge = verificationBadge(altPlace?.verification.status);
                return (
                  <li key={alt.placeId} className="alt" data-testid="alt" data-place={alt.placeId}>
                    <div className="alt-text">
                      <b>{alt.name}</b> <Tag tone={altBadge.tone}>{altBadge.label}</Tag>
                      <p>{alt.reason}</p>
                      <small data-testid="alt-delta">{deltaLabel(alt.delta)}</small>
                    </div>
                    <button type="button" className="btn small" onClick={() => onSwap(alt.placeId)} aria-label={`${alt.name} · 바꾸기`}>
                      바꾸기
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function StayTab(props: {
  stayId: string | null;
  onChoose: (stayId: string | null) => void;
  onOpen: (place: Place) => void;
}) {
  const { stayId, onChoose, onOpen } = props;
  const stays = PLACES.filter((p) => p.category === 'stay');
  return (
    <>
      <p className="sumbox">숙소를 고르면 일정을 다시 짭니다. 바꿔 둔 대안은 처음 추천으로 돌아갑니다.</p>
      {stays.length === 0 ? <p className="hint">목록에 숙소가 없습니다.</p> : null}
      <div className="cards">
        {stays.map((s) => {
          const on = s.id === stayId;
          const badge = verificationBadge(s.verification.status);
          return (
            <article key={s.id} className={on ? 'scard on' : 'scard'} data-testid="stay" data-place={s.id}>
              <div className="badges">
                {s.tags.map((t) => (
                  <Tag key={t} tone="idle">
                    {t}
                  </Tag>
                ))}
                <Tag tone={badge.tone}>{badge.label}</Tag>
              </div>
              <h3>{s.name}</h3>
              <p>{s.address ?? '주소 모름'}</p>
              <p>숙박료: {costLabel(s.costPerPerson)}</p>
              {s.lat === null || s.lng === null ? <p>위치 값이 없어 숙소까지 이동 시간은 모릅니다.</p> : null}
              {s.elderNote ? <p>{s.elderNote}</p> : null}
              <div className="scard-actions">
                <button type="button" className="btn ghost" onClick={() => onOpen(s)}>
                  자세히
                </button>
                <button type="button" className={on ? 'btn primary' : 'btn'} aria-pressed={on} onClick={() => onChoose(on ? null : s.id)}>
                  {on ? '✓ 선택됨 · 풀기' : '이 숙소로'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="hint">빈 방과 숙박료는 확인하지 않았습니다.</p>
    </>
  );
}

function CostTab(props: { plan: Plan; budget: number | null }) {
  const { plan, budget } = props;
  const view = costView(plan, PLACES);
  const total = plan.totals.costPerPerson;
  const left = budget === null ? null : budget - total;
  return (
    <>
      <div className="total">
        <span>{view.unknownCount > 0 ? '1인 경비 · 아는 값만 더했습니다' : '1인 예상 경비'}</span>
        <b data-testid="cost-total">{won(total)}</b>
        {view.unknownCount > 0 ? <span data-testid="cost-unknown">값을 모르는 곳 {view.unknownCount}곳. 실제로는 더 듭니다.</span> : null}
      </div>
      {budget === null ? (
        <p className="hint" data-testid="budget-line">
          예산을 넣지 않아 견주지 않았습니다.
        </p>
      ) : (
        <p className={left !== null && left < 0 ? 'budget over' : 'budget'} data-testid="budget-line">
          {left !== null && left < 0
            ? `예산 ${won(budget)}을 ${won(-left)} 넘습니다.`
            : `예산 ${won(budget)} 중 ${won(left ?? 0)} 남습니다.`}
          {view.unknownCount > 0 ? ' 모르는 값은 뺀 셈입니다.' : ''}
        </p>
      )}
      {view.matchesPlan ? (
        <ul className="brows">
          {view.rows.map((row) => (
            <li key={row.category} className="brow" data-testid="cost-row">
              <span>{row.label}</span>
              <b>{row.known.length > 0 ? won(row.sum) : '값 모름'}</b>
              {row.known.length > 0 ? <small>{row.known.join(', ')}</small> : null}
              {row.unknown.length > 0 ? <small>값 모름 {row.unknown.length}곳: {row.unknown.join(', ')}</small> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">종류별로 나눈 값이 합계와 맞지 않아 보여 주지 않습니다.</p>
      )}
      <p className="hint">경주까지 오가는 값과 주차료는 뺐습니다. 일정이나 숙소를 바꾸면 다시 계산합니다.</p>
    </>
  );
}
