import { createState } from '../js/state/schema.js';
import { applyAction } from '../js/domain/actions.js';
import { at, iso } from '../js/utils/date.js';

export const DAY1 = '2026-09-28';
export const DAY2 = '2026-09-29';
export function twoDayFixture() {
  const evening = at('2026-09-27', '18:00');
  let state = createState(evening, false);
  const act = (type, payload, now = evening) => {
    state = applyAction(state, { type, payload }, now);
  };
  for (const [title, work, deadline] of [
    ['연구 발표 준비', 90, `${DAY2}T18:00`],
    ['밀린 이메일 정리', 30, `${DAY1}T18:00`],
    ['논문 읽기', 60, `${DAY2}T20:00`],
  ])
    act('SAVE_TODO', {
      title,
      remainingWorkMin: work,
      deadline,
      importance: 'SHOULD',
      desire: 3,
      timeConstraint: 'WINDOW',
      windowStart: '09:00',
      windowEnd: '18:00',
    });
  act('SAVE_ROUTINE', {
    title: '영어 듣기',
    basis: 'TIME',
    duration: 20,
    minimum: 5,
    constraint: 'WINDOW',
    windowStart: '09:00',
    windowEnd: '21:00',
    frequency: 'WINDOW',
    everyDays: 1,
    times: 1,
    anchorDate: DAY1,
    weekdays: [],
    unavailableDates: [],
  });
  for (const [title, start, end] of [
    ['연구실 미팅', `${DAY1}T11:00`, `${DAY1}T12:00`],
    ['점심 약속', `${DAY1}T12:00`, `${DAY1}T13:00`],
    ['둘째 날 미팅', `${DAY2}T14:00`, `${DAY2}T15:00`],
  ])
    act('SAVE_FIXED', { title, start, end, recurrence: 'ONCE', weekdays: [] });
  act('SLEEP', {}, at('2026-09-27', '23:00'));
  state.ui.virtualNow = iso(at(DAY1, '07:30'));
  return state;
}
