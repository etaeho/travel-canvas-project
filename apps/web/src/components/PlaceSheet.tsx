import { useEffect, useRef } from 'react';
import type { Place } from '@needed/core';
import { CATEGORY_LABEL, costLabel, hoursLines, sourceHost } from '../lib/format';
import { verificationBadge } from '../lib/status';
import { Tag } from './controls';

export function PlaceSheet(props: { place: Place; onClose: () => void }) {
  const { place, onClose } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const badge = verificationBadge(place.verification.status);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="sheet-in">
        <div className="sheet-head">
          <div>
            <span className="eyebrow">{CATEGORY_LABEL[place.category]}</span>
            <h2 id="sheet-title">{place.name}</h2>
          </div>
          <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>
            닫기
          </button>
        </div>

        <dl className="facts">
          <dt>확인 상태</dt>
          <dd>
            <Tag tone={badge.tone}>{badge.label}</Tag>
            {place.verification.checkedAt ? <span className="muted"> {place.verification.checkedAt}에 봤습니다.</span> : null}
          </dd>
          <dt>주소</dt>
          <dd>{place.address ?? '주소 모름'}</dd>
          <dt>여는 시간</dt>
          <dd>
            {hoursLines(place).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </dd>
          <dt>값</dt>
          <dd>{costLabel(place.costPerPerson)}</dd>
          <dt>위치 값</dt>
          <dd>{place.lat === null || place.lng === null ? '없음. 이동 시간을 계산하지 못합니다.' : '있음'}</dd>
          <dt>어르신과 갈 때</dt>
          <dd>{place.elderNote ?? '찾은 내용이 없습니다.'}</dd>
          <dt>확인하며 적은 것</dt>
          <dd>{place.verification.notes ?? '없습니다.'}</dd>
          <dt>출처</dt>
          <dd>
            {place.verification.sources.length === 0 ? (
              '출처가 없습니다.'
            ) : (
              <ul className="sources">
                {place.verification.sources.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {sourceHost(url)}
                      <span className="sr"> (새 창)</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </div>
    </dialog>
  );
}
