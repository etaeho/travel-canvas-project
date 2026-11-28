import { dateLabel } from './time';
import type { Plan } from './types';

/** One short Korean sentence pair: how long the chosen order takes and how it compares. */
export function explainOrder(plan: Plan, dayIndex: number): string {
  const day = plan.days[dayIndex];
  if (!day) throw new Error(`No day at index ${dayIndex}`);
  const { walkMinutes, driveMinutes, travelMinutes, worstTravelMinutes, considered } = day.order;
  const night = day.order.nightMoved ? ' 야경이 좋은 곳은 저녁으로 옮겼다.' : '';
  const parts = [`걸어서 ${walkMinutes}분`];
  if (driveMinutes > 0) parts.push(`차로 ${driveMinutes}분`);
  const head = `${dateLabel(day.date)} 순서는 ${parts.join(', ')} 걸린다.`;
  if (considered <= 1) return `${head} 견줄 다른 순서가 없다.${night}`;
  const saved = worstTravelMinutes - travelMinutes;
  if (saved <= 0) return `${head} 견준 다른 순서와 차이가 없다.${night}`;
  return `${head} 가장 오래 걸리는 순서보다 ${saved}분 짧다.${night}`;
}
