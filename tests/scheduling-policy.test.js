import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/state/schema.js';
import { createStore } from '../js/state/store.js';
import { applyAction } from '../js/domain/actions.js';
import { routineStatus } from '../js/domain/routine.js';
import { fixedManagementEntries } from '../js/domain/occurrences.js';
import { isRewardTodo } from '../js/domain/preferences.js';
import { replanFuture, candidates } from '../js/scheduler/replan.js';
import { resolveCurrentView } from '../js/scheduler/currentView.js';
import { today, week } from '../js/ui/views.js';
import { at, iso, ms, day, MIN, addDays, overlap } from '../js/utils/date.js';
const now = at('2026-09-28', '09:00');
const todo = (id, desire = 2, extra = {}) => ({
  id,
  title: id,
  parentId: null,
  status: 'ACTIVE',
  importance: 'SHOULD',
  desire,
  remainingWorkMin: 90,
  initialWorkMin: 90,
  deadline: iso(at('2026-10-01', '22:00')),
  timeConstraint: 'FLEXIBLE',
  ...extra,
});
const routine = (extra) => ({
  id: 'routine',
  title: '운동',
  status: 'ACTIVE',
  duration: 20,
  minimum: 5,
  basis: 'TIME',
  constraint: 'ANYTIME',
  frequency: 'WEEKLY_COUNT',
  times: 3,
  anchorDate: '2026-09-28',
  availableWeekdays: [1, 2, 3, 4, 5],
  ...extra,
});
const action = (s, type, payload = {}, when = now) => applyAction(s, { type, payload }, when, when);

test('unstarted overnight sleep remains protected and visible after midnight, including before wake time', () => {
  const s = createState(now, false);
  s.todos = [todo('작업')];
  for (const when of [
    at('2026-09-28', '23:50'),
    at('2026-09-29', '00:10'),
    at('2026-09-29', '06:50'),
  ]) {
    replanFuture(s, when);
    assert.equal(resolveCurrentView(s, when).kind, 'SLEEP_PROMPT');
    const sleep = s.livePlan.find(
      (b) => b.sourceType === 'SLEEP' && ms(b.plannedStart) <= when && ms(b.plannedEnd) > when,
    );
    assert.ok(sleep);
    assert.ok(
      !s.livePlan.some((b) => b.sourceType === 'TODO' && b.plannedStart && overlap(b, sleep)),
    );
    assert.ok(today(s, when).includes('자러가기'));
    s.ui.weekStart = day(when);
    assert.ok(week(s, when).split('</section>')[0].includes('수면'));
  }
  const late = at('2026-09-29', '00:15');
  const sleeping = action(s, 'SLEEP', {}, late);
  assert.equal(sleeping.execution.expectedEnd, iso(at('2026-09-29', '07:00')));
  assert.equal(sleeping.execution.startedAt, iso(late));
});
test('an open app refreshes the seven-day horizon on date rollover without inventing sleep records', () => {
  const s = createState(now, false);
  s.ui.virtualNow = iso(at('2026-09-28', '23:59'));
  replanFuture(s, ms(s.ui.virtualNow));
  const store = createStore({ initialState: s });
  store.clock(at('2026-09-29', '00:01'));
  store.tick();
  assert.ok(store.get().sleepOccurrences.some((o) => o.date === '2026-10-05'));
  assert.equal(store.get().sessions.length, 0);
  assert.equal(resolveCurrentView(store.get(), at('2026-09-29', '00:01')).kind, 'SLEEP_PROMPT');
});
test('daily fixed events are seven occurrences but one management entry, including future series edits', () => {
  let s = action(createState(now, false), 'SAVE_FIXED', {
    title: '점심',
    start: iso(at('2026-09-28', '12:00')),
    end: iso(at('2026-09-28', '13:00')),
    recurrence: 'DAILY',
    weekdays: [],
  });
  assert.equal(s.fixedOccurrences.length, 7);
  assert.equal(fixedManagementEntries(s, now).length, 1);
  const o = s.fixedOccurrences.find((o) => o.date === '2026-09-30');
  s = action(s, 'EDIT_FIXED', {
    id: o.id,
    scope: 'FUTURE',
    title: '점심 수정',
    plannedStart: iso(at(o.date, '12:30')),
    plannedEnd: iso(at(o.date, '13:30')),
  });
  assert.equal(fixedManagementEntries(s, now).length, 1);
  assert.equal(
    s.fixedOccurrences.find((x) => x.status === 'PLANNED' && x.date === o.date).title,
    '점심 수정',
  );
});
test('far future fixed event can be edited from management before its occurrence has been materialized', () => {
  let s = action(createState(now, false), 'SAVE_FIXED', {
    title: '다음달 약속',
    start: iso(at('2026-11-01', '12:00')),
    end: iso(at('2026-11-01', '13:00')),
    recurrence: 'ONCE',
    weekdays: [],
  });
  const { occurrence: o } = fixedManagementEntries(s, now)[0];
  assert.equal(s.fixedOccurrences.length, 0);
  s = action(s, 'EDIT_FIXED', {
    id: o.id,
    originalDate: o.date,
    scope: 'ONE',
    title: '수정한 약속',
    plannedStart: o.plannedStart,
    plannedEnd: o.plannedEnd,
  });
  assert.equal(s.fixedOccurrences.find((x) => x.id === o.id).title, '수정한 약속');
});
test('daily routine and weekday-only weekly quota are independent recurrence rules', () => {
  const s = createState(now, false);
  s.routines = [
    routine({}),
    routine({ id: 'daily', frequency: 'DAILY', times: 99, availableWeekdays: [1] }),
  ];
  replanFuture(s, now);
  const weekly = s.livePlan.filter((b) => b.sourceId === 'routine');
  assert.equal(weekly.length, 3);
  assert.ok(weekly.every((b) => [1, 2, 3, 4, 5].includes(new Date(`${b.date}T12:00`).getDay())));
  assert.equal(s.livePlan.filter((b) => b.sourceId === 'daily').length, 7);
  s.sessions = [1, 2].map((_, i) => ({
    sourceId: 'routine',
    satisfied: true,
    date: addDays(now, i),
  }));
  assert.equal(routineStatus(s, s.routines[0], '2026-09-30').remaining, 1);
  assert.equal(routineStatus(s, s.routines[0], '2026-10-03').available, false);
  assert.equal(routineStatus(s, s.routines[0], '2026-10-05').remaining, 3);
});
test('weekly quota validates selected opportunity days and legacy N-day routines keep all days', () => {
  assert.throws(
    () => action(createState(now, false), 'SAVE_ROUTINE', routine({ times: 6 })),
    /요일 수/,
  );
  const r = routine({
    frequency: 'WINDOW',
    everyDays: 7,
    availableWeekdays: undefined,
    weekdays: [1],
  });
  assert.equal(routineStatus(createState(now, false), r, '2026-10-03').available, true);
});
test('long flexible work alternates preferences block by block instead of exhausting one Todo first', () => {
  const s = createState(now, false);
  s.todos = [todo('필요한 작업', 1), todo('좋아하는 작업', 5, { importance: 'OPTIONAL' })];
  replanFuture(s, now);
  const blocks = s.livePlan.filter((b) => b.sourceType === 'TODO' && b.date === day(now));
  assert.deepEqual(
    blocks.map((b) => b.sourceId),
    ['필요한 작업', '좋아하는 작업', '필요한 작업', '좋아하는 작업'],
  );
  assert.equal(blocks[1].rewardRole, true);
});
test('alternation respects urgent deadlines and fixed sleep boundaries', () => {
  const s = createState(now, false);
  s.todos = [
    todo('급한 필수', 1, { importance: 'MUST', deadline: iso(now + 3 * 60 * MIN) }),
    todo('보상', 5, { importance: 'OPTIONAL' }),
  ];
  replanFuture(s, now);
  const blocks = s.livePlan.filter((b) => b.sourceType === 'TODO' && b.date === day(now));
  assert.deepEqual(
    blocks.slice(0, 2).map((b) => b.sourceId),
    ['급한 필수', '급한 필수'],
  );
  assert.ok(
    blocks
      .filter((b) => b.sourceId === '급한 필수')
      .every((b) => ms(b.plannedEnd) <= now + 3 * 60 * MIN),
  );
});
test('automatic reward Todo starts the existing source and records progress exactly once', () => {
  let s = createState(now, false);
  s.todos = [todo('그림', 5, { importance: 'OPTIONAL', remainingWorkMin: 45 })];
  replanFuture(s, now);
  assert.ok(isRewardTodo(s.todos[0]));
  assert.ok(candidates(s, now).some((b) => b.sourceId === '그림'));
  s = action(s, 'REWARD_TODO', { sourceId: '그림' });
  s = action(s, 'FINISH', { outcome: 'DONE', confirmedFocusMin: 30 }, now + 30 * MIN);
  assert.equal(s.todos[0].remainingWorkMin, 0);
  assert.equal(s.sessions.length, 1);
  assert.equal(s.personalPlans.length, 0);
});

test('adding a preferred activity rebalances movable work without moving locked appointments', () => {
  let s = action(createState(now, false), 'SAVE_TODO', todo('work', 1));
  s = action(s, 'SAVE_TODO', todo('fun', 5, { importance: 'OPTIONAL' }));
  assert.deepEqual(
    s.livePlan.filter((b) => b.sourceType === 'TODO' && b.date === day(now)).map((b) => b.title),
    ['work', 'fun', 'work', 'fun'],
  );
});

test('automatic reward cannot consume the last routine opportunity and failed start is atomic', () => {
  const s = createState(now, false);
  s.todos = [todo('fun', 5, { importance: 'OPTIONAL', remainingWorkMin: 45 })];
  s.routines = [
    routine({
      frequency: 'WEEKDAYS',
      weekdays: [1],
      constraint: 'WINDOW',
      windowStart: '09:00',
      windowEnd: '10:00',
      duration: 30,
      minimum: 30,
    }),
  ];
  replanFuture(s, now);
  const before = structuredClone(s);
  assert.throws(() => action(s, 'REWARD_TODO', { sourceId: 'fun' }), /수행 기회/);
  assert.deepEqual(s, before);
});
