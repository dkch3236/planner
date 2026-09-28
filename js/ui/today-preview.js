import { createState } from '../state/schema.js';
import { executionFor } from '../domain/execution.js';
import { day, at, iso, MIN } from '../utils/date.js';

// Explicit opt-in, memory-only fixture. Never replaces the user's saved planner.
export function todayPreview(realNow = Date.now()) {
  const date = day(realNow),
    now = at(date, '11:08') + 39_000;
  const s = createState(now, false);
  s.ui.previewClock = { start: now, realStart: realNow };
  const todo = (id, title, minutes) => ({
    id,
    title,
    parentId: null,
    remainingWorkMin: minutes,
    initialWorkMin: minutes,
    deadline: iso(at(date, '22:00')),
    importance: 'SHOULD',
    desire: 3,
    timeConstraint: 'FLEXIBLE',
    status: 'ACTIVE',
  });
  s.todos = [
    todo('preview-report', '보고서 작성하기', 45),
    todo('preview-slides', '발표 준비하기', 45),
  ];
  s.routines = [
    {
      id: 'preview-stretch',
      title: '가볍게 몸 움직이기',
      basis: 'TIME',
      duration: 10,
      minimum: 5,
      constraint: 'ANYTIME',
      frequency: 'WINDOW',
      everyDays: 1,
      times: 1,
      anchorDate: date,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      status: 'ACTIVE',
      unavailableDates: [],
    },
  ];
  const block = (id, title, type, start, end, work = 0, sourceId = id) => ({
    id,
    sourceId,
    title,
    sourceType: type,
    plannedStart: iso(at(date, start)),
    plannedEnd: iso(at(date, end)),
    reservedMin: (at(date, end) - at(date, start)) / MIN,
    assignedWorkMin: work,
    focusLike: ['TODO', 'ROUTINE'].includes(type),
    locked: type === 'FIXED',
  });
  const current = block(
    'preview-active',
    '보고서 작성하기',
    'TODO',
    '10:30',
    '11:20',
    45,
    'preview-report',
  );
  s.execution = executionFor(current, at(date, '10:31'), realNow);
  s.execution.expectedEnd = iso(at(date, '11:21'));
  s.execution.measuredFocusMin = 32 + 7 / 60;
  s.execution.focusIntervals = [
    { start: at(date, '10:31'), end: at(date, '10:42') },
    { start: at(date, '10:46'), end: at(date, '10:58') },
    { start: at(date, '10:59') + 32_000, end: now },
  ];
  s.livePlan = [
    { ...current, active: true },
    block(
      'preview-routine',
      '가볍게 몸 움직이기',
      'ROUTINE',
      '11:21',
      '11:31',
      10,
      'preview-stretch',
    ),
    block('preview-prep', '발표 준비하기', 'TODO', '11:31', '12:16', 45, 'preview-slides'),
    block('preview-lunch', '점심식사', 'FIXED', '12:16', '13:46'),
    block('preview-free-1', '자유시간', 'FREE', '13:46', '14:00'),
    block('preview-cafe', '친구들과 카페 약속', 'FIXED', '14:00', '17:00'),
    block('preview-dinner', '저녁식사', 'FIXED', '17:00', '19:00'),
    block('preview-free-2', '자유시간', 'FREE', '19:00', '23:00'),
  ];
  s.fixedOccurrences = s.livePlan
    .filter((b) => b.sourceType === 'FIXED')
    .map((b) => ({ ...b, status: 'PLANNED' }));
  s.freeCreditToday = { date, minutes: 20 };
  s.unconfirmed = Array.from({ length: 3 }, (_, i) =>
    block(
      `preview-unconfirmed-${i}`,
      ['아침 독서', '산책', '메모 정리'][i],
      'ROUTINE',
      `0${7 + i}:00`,
      `0${7 + i}:15`,
      15,
      'preview-stretch',
    ),
  );
  return s;
}
