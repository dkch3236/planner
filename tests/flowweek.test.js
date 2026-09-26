import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/state/schema.js';
import { applyAction } from '../js/domain/actions.js';
import { routineStatus, windowFor } from '../js/domain/routine.js';
import { materialize } from '../js/domain/occurrences.js';
import { progress, depth, activeLeaves } from '../js/domain/todo.js';
import { startExecution } from '../js/domain/execution.js';
import { replanFuture, reconcile, candidates } from '../js/scheduler/replan.js';
import { resolveCurrentView } from '../js/scheduler/currentView.js';
import { MIN, at, addDays, day, iso, ms, overlap } from '../js/utils/date.js';
import { legalRange } from '../js/scheduler/availability.js';
import { today, manage, week, adjustments } from '../js/ui/views.js';
const now = at('2026-09-24', '09:00');
const todo = (extra = {}) => ({
  id: 't1',
  title: '발표 준비',
  parentId: null,
  remainingWorkMin: 90,
  initialWorkMin: 90,
  deadline: iso(at('2026-09-26', '18:00')),
  importance: 'SHOULD',
  desire: 3,
  timeConstraint: 'FLEXIBLE',
  status: 'ACTIVE',
  ...extra,
});
const routine = (extra = {}) => ({
  id: 'r1',
  title: '영어',
  basis: 'TIME',
  duration: 20,
  minimum: 5,
  constraint: 'ANYTIME',
  frequency: 'WINDOW',
  everyDays: 3,
  times: 2,
  anchorDate: '2026-09-24',
  weekdays: [4],
  status: 'ACTIVE',
  unavailableDates: [],
  ...extra,
});
function fixture(todos = [todo()], routines = []) {
  const s = createState(now, false);
  s.todos = todos;
  s.routines = routines;
  replanFuture(s, now);
  return s;
}
const action = (s, type, payload = {}, when = now) => applyAction(s, { type, payload }, when);
const start = (s, id = 't1', when = now) =>
  action(s, 'MANUAL', { sourceId: id, mode: 'PULL_FROM_FREE' }, when);
const finish = (s, outcome = 'DONE', focus = 40, when = now + 40 * MIN, extra = {}) =>
  action(
    s,
    'FINISH',
    {
      outcome,
      confirmedFocusMin: focus,
      actualStart: s.execution.startedAt,
      actualEnd: iso(when),
      ...extra,
    },
    when,
  );
test('planning never starts execution or creates history', () => {
  const s = fixture();
  assert.equal(s.execution, null);
  assert.equal(s.timeline.length, 0);
  assert.equal(resolveCurrentView(s, now).kind, 'PLANNED_CURRENT');
});
test('90 min demand splits into 45 work / 60 reserved with recovery', () => {
  const s = fixture(),
    blocks = s.livePlan.filter((b) => b.sourceId === 't1');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].assignedWorkMin, 45);
  assert.equal(blocks[0].reservedMin, 60);
  assert.ok(ms(blocks[1].plannedStart) - ms(blocks[0].plannedEnd) >= 15 * MIN);
});
test('completed block subtracts assigned work, not elapsed minutes', () => {
  const s = finish(start(fixture()));
  assert.equal(s.todos[0].remainingWorkMin, 45);
  assert.equal(s.sessions[0].confirmedFocusMin, 40);
  assert.equal(s.sessions[0].appliedWorkMin, 45);
  assert.equal(s.execution, null);
  assert.equal(s.pendingSaved.minutes, 20);
  assert.equal(resolveCurrentView(s, now + 40 * MIN).kind, 'FREE');
});
test('incomplete subtracts confirmed focus; additional estimate is required at zero', () => {
  const s = start(fixture([todo({ remainingWorkMin: 30 })]));
  assert.throws(() => finish(s, 'INCOMPLETE', 30, now + 30 * MIN), /얼마나/);
  assert.equal(s.todos[0].remainingWorkMin, 30);
  const result = finish(s, 'INCOMPLETE', 30, now + 30 * MIN, { additionalMin: 15 });
  assert.equal(result.todos[0].remainingWorkMin, 15);
  assert.equal(result.todos[0].status, 'ACTIVE');
});
test('wall clock and focus are separate; explicit interval leaves gaps', () => {
  let s = start(fixture());
  s = finish(s, 'INCOMPLETE', 30, now + 90 * MIN, { actualEnd: iso(now + 30 * MIN) });
  assert.equal(s.todos[0].remainingWorkMin, 60);
  assert.equal(ms(s.timeline[0].end) - ms(s.timeline[0].start), 30 * MIN);
});
test('one active execution only', () => {
  const s = start(fixture());
  assert.throws(() => startExecution(s, { id: 'x', sourceType: 'REST' }, now), /진행 중/);
});
test('completed leaf disappears from active leaves and updates ancestor', () => {
  const parent = todo({ id: 'parent', remainingWorkMin: 25, initialWorkMin: 25 });
  const child = todo({ id: 'child', parentId: 'parent', remainingWorkMin: 25, initialWorkMin: 25 });
  const s = finish(start(fixture([parent, child]), 'child'), 'DONE', 20, now + 20 * MIN);
  assert.equal(activeLeaves(s).length, 0);
  assert.equal(s.todos[0].status, 'COMPLETED');
  assert.equal(progress(s.todos, s.todos[0]).remaining, 0);
  assert.equal(depth([child, parent], child), 1);
});
test('routine anchored windows do not restart on early satisfaction', () => {
  const r = routine();
  const s = fixture([], [r]);
  s.sessions = [
    { sourceId: r.id, satisfied: true, date: '2026-09-24' },
    { sourceId: r.id, satisfied: true, date: '2026-09-25' },
  ];
  assert.equal(routineStatus(s, r, '2026-09-25').remaining, 0);
  assert.deepEqual(windowFor(r, '2026-09-26'), { start: '2026-09-24', end: '2026-09-26' });
  assert.equal(routineStatus(s, r, '2026-09-27').remaining, 2);
});
test('routine multiple completions in one day count once', () => {
  const r = routine(),
    s = fixture([], [r]);
  s.sessions = [
    { sourceId: r.id, satisfied: true, date: '2026-09-24' },
    { sourceId: r.id, satisfied: true, date: '2026-09-24' },
  ];
  assert.equal(routineStatus(s, r, now).remaining, 1);
});
test('weekday routine does not migrate; unavailable has no missed penalty', () => {
  const r = routine({ frequency: 'WEEKDAYS', weekdays: [5] }),
    s = fixture([], [r]);
  assert.ok(
    s.livePlan
      .filter((b) => b.sourceId === 'r1')
      .every((b) => new Date(b.date + 'T12:00').getDay() === 5),
  );
  assert.equal(routineStatus(s, r, now).status, 'UNAVAILABLE');
  assert.equal(candidates(s, now).length, 0);
});
test('routine completion requires confirmed minimum or completion flag', () => {
  let s = start(fixture([], [routine()]), 'r1');
  s = finish(s, 'DONE', 5, now + 5 * MIN);
  assert.equal(routineStatus(s, s.routines[0], now).doneToday, true);
  assert.equal(candidates(s, now).length, 0);
});
test('sleep occurrence closes once and remains closed on replan', () => {
  let s = fixture([], []);
  const when = at('2026-09-24', '23:10');
  s = action(s, 'SLEEP', {}, when);
  const oid = s.execution.sourceId;
  s = finish(s, 'DONE', 0, when + 8 * 60 * MIN);
  replanFuture(s, when + 8 * 60 * MIN);
  materialize(s, when);
  assert.equal(s.sleepOccurrences.filter((o) => o.id === oid).length, 1);
  assert.equal(s.sleepOccurrences.find((o) => o.id === oid).status, 'CLOSED');
  assert.ok(!s.livePlan.some((b) => b.sourceId === oid));
});
test('fixed event completes with actual times and can be missed', () => {
  let s = fixture([], []);
  s = action(s, 'SAVE_FIXED', {
    title: '회의',
    start: '2026-09-24T10:00',
    end: '2026-09-24T11:00',
    recurrence: 'ONCE',
    weekdays: [],
  });
  let b = s.livePlan.find((b) => b.sourceType === 'FIXED');
  s = action(s, 'START', { id: b.id }, now + 60 * MIN);
  s = finish(s, 'DONE', 0, now + 115 * MIN);
  assert.equal(s.fixedOccurrences.find((o) => o.id === b.sourceId).status, 'COMPLETED');
  assert.equal(s.timeline.length, 1);
});
test('fixed occurrence edits distinguish one and future series', () => {
  let s = fixture([], []);
  s = action(s, 'SAVE_FIXED', {
    title: '회의',
    start: '2026-09-24T10:00',
    end: '2026-09-24T11:00',
    recurrence: 'WEEKLY',
    weekdays: [4, 5],
  });
  const o = s.fixedOccurrences.find((o) => o.date === '2026-09-24');
  s = action(s, 'EDIT_FIXED', {
    id: o.id,
    title: '이번만',
    plannedStart: iso(at(o.date, '10:00')),
    plannedEnd: iso(at(o.date, '11:00')),
    scope: 'ONE',
  });
  assert.equal(s.fixedOccurrences.find((o) => o.date === '2026-09-25').title, '회의');
  s = action(s, 'DELETE_FIXED', { id: o.id, scope: 'FUTURE' });
  assert.ok(s.fixedOccurrences.every((o) => o.status === 'CANCELLED'));
});
test('past plan becomes unconfirmed, never auto-success/history', () => {
  const s = fixture();
  reconcile(s, now + 4 * 60 * MIN);
  assert.equal(s.unconfirmed.length, 2);
  assert.equal(s.timeline.length, 0);
  assert.equal(s.sessions.length, 0);
  assert.equal(s.todos[0].remainingWorkMin, 90);
});
test('unconfirmed done/missed removes entry immediately', () => {
  let s = fixture();
  reconcile(s, now + 4 * 60 * MIN);
  const first = s.unconfirmed[0];
  s = action(
    s,
    'CONFIRM',
    {
      id: first.id,
      outcome: 'DONE',
      actualStart: first.plannedStart,
      actualEnd: first.plannedEnd,
      confirmedFocusMin: 45,
    },
    now + 4 * 60 * MIN,
  );
  assert.ok(!s.unconfirmed.some((b) => b.id === first.id));
  const last = s.unconfirmed[0];
  s = action(s, 'CONFIRM', { id: last.id, outcome: 'MISSED' }, now + 4 * 60 * MIN);
  assert.equal(s.unconfirmed.length, 0);
  assert.equal(s.todos[0].remainingWorkMin, 45);
});
test('local replan protects timeline, fixed, locked and unrelated future ids', () => {
  let s = fixture([todo(), todo({ id: 't2', remainingWorkMin: 25 })]);
  const old = s.livePlan.find((b) => b.sourceId === 't2');
  s = action(s, 'LOCK', { id: old.id });
  s.timeline = [
    { id: 'history', title: '과거', start: iso(now - 60 * MIN), end: iso(now - 30 * MIN) },
  ];
  const before = JSON.stringify(s.timeline);
  s = action(s, 'SAVE_TODO', {
    ...todo({ id: undefined, title: '새 할 일', remainingWorkMin: 15 }),
  });
  assert.equal(JSON.stringify(s.timeline), before);
  assert.ok(s.livePlan.some((b) => b.id === old.id && b.plannedStart === old.plannedStart));
});
test('planned reorder does not fail displaced work', () => {
  const s = action(fixture([todo(), todo({ id: 't2' })]), 'MANUAL', {
    sourceId: 't2',
    mode: 'REORDER_PLANNED',
  });
  assert.equal(s.execution.sourceId, 't2');
  assert.equal(s.sessions.length, 0);
  assert.equal(s.todos[0].remainingWorkMin, 90);
  assert.ok(s.livePlan.some((b) => b.sourceId === 't1'));
});
test('switch records incomplete work atomically and starts selected execution', () => {
  let s = start(fixture([todo(), todo({ id: 't2' })]));
  s = action(
    s,
    'SWITCH',
    {
      sourceId: 't2',
      finish: { confirmedFocusMin: 20, actualStart: iso(now), actualEnd: iso(now + 20 * MIN) },
    },
    now + 20 * MIN,
  );
  assert.equal(s.execution.sourceId, 't2');
  assert.equal(s.todos[0].remainingWorkMin, 70);
  assert.equal(s.sessions[0].outcome, 'INCOMPLETE');
  assert.equal(s.timeline.length, 1);
});
test('free credit added only after early finish followed by pull', () => {
  let s = finish(start(fixture()));
  assert.equal(s.freeCreditToday.minutes, 0);
  s = action(s, 'MANUAL', { sourceId: 't1', mode: 'PULL_FROM_FREE' }, now + 40 * MIN);
  assert.equal(s.freeCreditToday.minutes, 20);
  assert.equal(s.pendingSaved, null);
});
test('rest after early finish earns no credit', () => {
  let s = finish(start(fixture()));
  s = action(s, 'REST', {}, now + 40 * MIN);
  assert.equal(s.freeCreditToday.minutes, 0);
  assert.equal(s.execution.sourceType, 'REST');
});
test('reward can rearrange future flexible work without credit', () => {
  const s = action(fixture(), 'REWARD', { title: '베이킹', minutes: 60 });
  assert.equal(s.execution.sourceType, 'REWARD');
  assert.equal(s.freeCreditToday.minutes, 0);
  assert.equal(s.todos[0].remainingWorkMin, 90);
  assert.ok(
    s.livePlan
      .filter((b) => b.sourceId === 't1')
      .every((b) => ms(b.plannedStart) >= now + 60 * MIN),
  );
});
test('reward cannot displace fixed, locked, critical must or last routine opportunity', () => {
  let s = fixture();
  const b = s.livePlan.find((b) => b.sourceId === 't1');
  s = action(s, 'LOCK', { id: b.id });
  assert.throws(() => action(s, 'REWARD', { title: '베이킹', minutes: 60 }), /옮길 수/);
  s = fixture([todo({ importance: 'MUST', deadline: iso(now + 3 * 60 * MIN) })]);
  assert.throws(() => action(s, 'REWARD', { title: '베이킹', minutes: 60 }), /옮길 수/);
});
test('later reward reserves actual free slot', () => {
  let s = fixture();
  const free = s.livePlan.find(
    (b) => b.sourceType === 'FREE' && day(b.plannedStart) === day(now) && b.reservedMin >= 60,
  );
  s = action(s, 'REWARD', { title: '베이킹', minutes: 60, start: free.plannedStart });
  assert.equal(s.execution, null);
  assert.ok(s.livePlan.some((b) => b.sourceType === 'REWARD'));
});
test('timeline edits do not change performance or todo demand', () => {
  let s = finish(start(fixture()));
  const before = JSON.stringify(s.sessions),
    work = s.todos[0].remainingWorkMin,
    t = s.timeline[0];
  s = action(
    s,
    'TIMELINE',
    { ...t, title: '실제 한 활동', end: iso(now + 30 * MIN) },
    now + 40 * MIN,
  );
  assert.equal(JSON.stringify(s.sessions), before);
  assert.equal(s.todos[0].remainingWorkMin, work);
});
test('rolling seven days, distant flexible work has no exact time', () => {
  const s = fixture([todo({ remainingWorkMin: 10000, deadline: iso(at('2026-10-05', '18:00')) })]);
  const distant = s.livePlan.filter((b) => b.sourceType === 'TODO' && b.date >= '2026-09-27');
  assert.ok(distant.length > 0);
  assert.ok(distant.every((b) => b.plannedStart === null));
  assert.ok(s.livePlan.every((b) => (b.date || day(b.plannedStart)) <= '2026-09-30'));
});
test('density leaves explicit free blocks and blocks do not overlap', () => {
  const s = fixture([todo({ remainingWorkMin: 10000, deadline: iso(at('2026-10-05', '18:00')) })]);
  const timed = s.livePlan.filter((b) => b.plannedStart);
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++)
      assert.ok(!overlap(timed[i], timed[j]), `${timed[i].title} overlaps ${timed[j].title}`);
  assert.ok(timed.some((b) => b.sourceType === 'FREE'));
});
test('new fixed-time routines evict flexible work and keep exact times for seven days', () => {
  let s = fixture();
  s = action(s, 'SAVE_ROUTINE', {
    ...routine({ id: undefined, constraint: 'FIXED', fixedTime: '09:00', everyDays: 1, times: 1 }),
  });
  const exact = s.livePlan.filter((b) => b.sourceType === 'ROUTINE');
  assert.equal(exact.length, 7);
  assert.ok(exact.every((b) => b.plannedStart && new Date(b.plannedStart).getHours() === 9));
  const other = s.livePlan.filter((b) => b.sourceType === 'TODO' && b.plannedStart);
  assert.ok(other.every((b) => exact.every((e) => !overlap(e, b))));
});
test('inserting work before preserved focus blocks retains recovery on both sides', () => {
  let s = fixture([todo({ remainingWorkMin: 45 })]);
  s.livePlan.find((b) => b.sourceId === 't1').plannedStart = iso(now + 60 * MIN);
  s.livePlan.find((b) => b.sourceId === 't1').plannedEnd = iso(now + 120 * MIN);
  s = action(s, 'SAVE_TODO', {
    ...todo({ id: undefined, title: '짧은 일', remainingWorkMin: 25 }),
  });
  const focus = s.livePlan
    .filter((b) => b.focusLike && b.plannedStart)
    .sort((a, b) => ms(a.plannedStart) - ms(b.plannedStart));
  for (let i = 1; i < focus.length; i++)
    assert.ok(ms(focus[i].plannedStart) - ms(focus[i - 1].plannedEnd) >= 15 * MIN);
});
test('distant free allocation subtracts date-only reserved work', () => {
  const s = fixture([todo({ remainingWorkMin: 10000, deadline: iso(at('2026-10-05', '18:00')) })]);
  const free = s.livePlan.find((b) => b.sourceType === 'FREE' && b.date === '2026-09-27');
  assert.equal(free.plannedStart, null);
  assert.ok(free.reservedMin < 16 * 60);
});
test('daily routine can move within its actual window but cannot lose its opportunity', () => {
  const s = fixture([], [routine({ everyDays: 1, times: 1 })]);
  assert.equal(
    action(s, 'REWARD', { title: '베이킹', minutes: 60 }).execution.sourceType,
    'REWARD',
  );
  const narrow = fixture(
    [],
    [
      routine({
        everyDays: 1,
        times: 1,
        constraint: 'WINDOW',
        windowStart: '09:00',
        windowEnd: '09:40',
      }),
    ],
  );
  assert.throws(() => action(narrow, 'REWARD', { title: '베이킹', minutes: 60 }), /수행 기회/);
});
test('fixed missed confirmation changes occurrence without inventing history', () => {
  let s = fixture([], []);
  s = action(s, 'SAVE_FIXED', {
    title: '회의',
    start: '2026-09-24T10:00',
    end: '2026-09-24T11:00',
    recurrence: 'ONCE',
    weekdays: [],
  });
  reconcile(s, now + 180 * MIN);
  s = action(s, 'CONFIRM', { id: s.unconfirmed[0].id, outcome: 'MISSED' }, now + 180 * MIN);
  assert.equal(s.fixedOccurrences[0].status, 'MISSED');
  assert.equal(s.timeline.length, 0);
});
test('window constrained Todo never ignores its deadline', () => {
  const source = todo({
    timeConstraint: 'WINDOW',
    windowStart: '09:00',
    windowEnd: '18:00',
    deadline: iso(now + 30 * MIN),
  });
  assert.equal(legalRange(source, 'TODO', day(now))[1], now + 30 * MIN);
  const s = fixture([source]);
  assert.ok(!s.livePlan.some((b) => b.sourceId === source.id && ms(b.plannedEnd) > now + 30 * MIN));
});
test('distant narrow windows are not overallocated', () => {
  const s = fixture([
    todo({
      remainingWorkMin: 600,
      timeConstraint: 'WINDOW',
      windowStart: '09:00',
      windowEnd: '10:00',
      deadline: iso(at('2026-10-05', '18:00')),
    }),
  ]);
  assert.ok(s.livePlan.filter((b) => b.sourceId === 't1' && b.date === '2026-09-27').length <= 1);
});
test('new fixed conflict preserves a locked block and reports the conflict', () => {
  let s = fixture();
  const before = s.livePlan.find((b) => b.sourceId === 't1');
  s = action(s, 'LOCK', { id: before.id });
  s = action(s, 'SAVE_FIXED', {
    title: '겹치는 회의',
    start: '2026-09-24T09:00',
    end: '2026-09-24T10:00',
    recurrence: 'ONCE',
    weekdays: [],
  });
  assert.ok(s.livePlan.some((b) => b.id === before.id && b.plannedStart === before.plannedStart));
  assert.ok(s.diagnostics.some((x) => x.message.includes('보호된 일정')));
});
test('multi-day fixed occurrence preserves the full duration', () => {
  const s = action(fixture([], []), 'SAVE_FIXED', {
    title: '이틀 행사',
    start: '2026-09-24T10:00',
    end: '2026-09-26T10:00',
    recurrence: 'ONCE',
    weekdays: [],
  });
  const event = s.fixedOccurrences[0];
  assert.equal(ms(event.plannedEnd) - ms(event.plannedStart), 48 * 60 * MIN);
});
test('all screens render and past gaps are editable without implying FREE', () => {
  const s = fixture();
  for (const view of [today, manage, week, adjustments])
    assert.equal(typeof view(s, now), 'string');
  assert.match(week(s, now), /미기록 시간/);
  assert.match(week(s, now), /data-start=/);
});
test('an overdue execution is never converted into an unconfirmed plan', () => {
  const s = start(fixture([todo({ remainingWorkMin: 45 })]));
  reconcile(s, now + 3 * 60 * MIN);
  assert.equal(s.unconfirmed.length, 0);
  assert.equal(resolveCurrentView(s, now + 3 * 60 * MIN).kind, 'EXECUTING');
  assert.equal(s.todos[0].remainingWorkMin, 45);
});
import { settleFocus, toggleFocus } from '../js/domain/focus.js';
import { previewReward, remainingFreeSlots } from '../js/scheduler/replan.js';
import { finishForm } from '../js/ui/forms.js';
import { validateFinish } from '../js/domain/execution.js';

test('incomplete early finish neither offers nor credits saved time', () => {
  let s = finish(start(fixture()), 'INCOMPLETE', 25, now + 25 * MIN);
  assert.equal(s.pendingSaved, null);
  s = start(s, 't1', now + 25 * MIN);
  assert.equal(s.freeCreditToday.minutes, 0);
});
test('saved interval expires and cannot hide current fixed event', () => {
  let s = finish(start(fixture()));
  s.livePlan.push({
    id: 'meeting',
    sourceType: 'FIXED',
    plannedStart: iso(now + 45 * MIN),
    plannedEnd: iso(now + 120 * MIN),
  });
  assert.equal(resolveCurrentView(s, now + 50 * MIN).kind, 'PLANNED_CURRENT');
  reconcile(s, now + 120 * MIN);
  assert.equal(s.pendingSaved, null);
});
test('delayed pull credits only remaining saved interval', () => {
  let s = finish(start(fixture()));
  s = start(s, 't1', now + 50 * MIN);
  assert.equal(s.freeCreditToday.minutes, 10);
});
test('past free slots are excluded and rejected atomically', () => {
  const s = fixture();
  s.livePlan.push({
    id: 'stale',
    sourceType: 'FREE',
    plannedStart: iso(now - 120 * MIN),
    plannedEnd: iso(now - 30 * MIN),
    reservedMin: 90,
  });
  assert.ok(remainingFreeSlots(s, now).every((b) => ms(b.plannedStart) >= now));
  const before = JSON.stringify(s);
  assert.throws(
    () => action(s, 'REWARD', { title: '산책', minutes: 30, start: iso(now - 90 * MIN) }),
    /자유시간/,
  );
  assert.equal(JSON.stringify(s), before);
});
test('past confirmation preserves current execution and does not create saved credit', () => {
  let s = fixture([todo(), todo({ id: 't2', title: '다른 작업' })]);
  const past = {
    ...s.livePlan.find((b) => b.sourceId === 't1'),
    id: 'past',
    plannedStart: iso(now - 60 * MIN),
    plannedEnd: iso(now - 15 * MIN),
  };
  s.unconfirmed.push(past);
  s = start(s, 't2');
  const execution = structuredClone(s.execution);
  s = action(s, 'CONFIRM', {
    id: 'past',
    outcome: 'DONE',
    actualStart: past.plannedStart,
    actualEnd: past.plannedEnd,
    confirmedFocusMin: 30,
  });
  assert.equal(s.execution.id, execution.id);
  assert.equal(s.execution.startedAt, execution.startedAt);
  assert.equal(s.todos[0].remainingWorkMin, 45);
  assert.equal(s.pendingSaved, null);
  assert.equal(
    s.unconfirmed.some((b) => b.id === 'past'),
    false,
  );
});
test('late execution explicitly opts in and preserves original deadline and window', () => {
  const s = fixture([
    todo({
      deadline: iso(now - MIN),
      timeConstraint: 'WINDOW',
      windowStart: '09:00',
      windowEnd: '11:00',
    }),
  ]);
  assert.equal(candidates(s, now).length, 0);
  const late = action(s, 'MANUAL', { sourceId: 't1', mode: 'PULL_FROM_FREE', allowOverdue: true });
  assert.equal(late.execution.overdue, true);
  assert.equal(late.todos[0].deadline, s.todos[0].deadline);
  assert.throws(
    () =>
      action(
        s,
        'MANUAL',
        { sourceId: 't1', mode: 'PULL_FROM_FREE', allowOverdue: true },
        now + 150 * MIN,
      ),
    /제약/,
  );
});
test('timer counts explicit running intervals only; idle reading is not treated as rest', () => {
  const s = fixture();
  startExecution(
    s,
    s.livePlan.find((b) => b.sourceId === 't1'),
    now,
    1000,
  );
  settleFocus(s.execution, 31000);
  assert.equal(s.execution.measuredFocusMin, 0.5);
  toggleFocus(s.execution, 61000);
  assert.equal(s.execution.measuredFocusMin, 1);
  settleFocus(s.execution, 121000);
  assert.equal(s.execution.measuredFocusMin, 1);
  toggleFocus(s.execution, 121000);
  settleFocus(s.execution, 151000);
  assert.equal(s.execution.measuredFocusMin, 1.5);
  settleFocus(s.execution, 300000);
  assert.equal(s.execution.timerStatus, 'PAUSED');
  assert.equal(s.execution.measuredFocusMin, 1.5);
});
test('non-work activities have no focus timer or focus confirmation', () => {
  let s = action(fixture([]), 'REST');
  assert.equal(s.execution.timerStatus, null);
  assert.doesNotMatch(finishForm(s.execution, now + 30 * MIN, 'DONE'), /confirmedFocusMin/);
  s = finish(s, 'DONE', 30, now + 30 * MIN);
  assert.equal(s.sessions[0].confirmedFocusMin, 0);
});
test('switch validates before leaving form and failed switches preserve all state', () => {
  const s = start(fixture([todo({ remainingWorkMin: 20 })]));
  const input = { outcome: 'INCOMPLETE', confirmedFocusMin: 20 };
  assert.throws(() => validateFinish(s, input, now + 20 * MIN), /추가/);
  const before = JSON.stringify(s);
  assert.throws(() =>
    action(
      s,
      'SWITCH',
      { sourceId: 'missing', finish: { ...input, additionalMin: 15 } },
      now + 20 * MIN,
    ),
  );
  assert.equal(JSON.stringify(s), before);
});
test('switch can enter a current fixed event atomically without moving it', () => {
  let s = action(fixture(), 'SAVE_FIXED', {
    title: '회의',
    start: iso(now + 60 * MIN),
    end: iso(now + 120 * MIN),
    recurrence: 'ONCE',
    weekdays: [],
  });
  s = start(s);
  const fixed = s.livePlan.find((b) => b.sourceType === 'FIXED');
  s = action(
    s,
    'SWITCH',
    { targetId: fixed.id, finish: { outcome: 'INCOMPLETE', confirmedFocusMin: 25 } },
    now + 60 * MIN,
  );
  assert.equal(s.execution.sourceType, 'FIXED');
  assert.equal(s.execution.plannedStart, fixed.plannedStart);
  assert.equal(s.sessions[0].outcome, 'INCOMPLETE');
});
test('rest to sleep is a single transition with separate records', () => {
  let s = action(fixture([]), 'REST');
  s = action(s, 'SLEEP', {}, now + 30 * MIN);
  assert.equal(s.sessions[0].sourceType, 'REST');
  assert.equal(s.sessions[0].confirmedFocusMin, 0);
  assert.equal(s.execution.sourceType, 'SLEEP');
});
test('overnight history clips onto both dates and keeps original editable record', () => {
  const s = fixture([]);
  s.timeline.push({
    id: 'overnight',
    title: '수면',
    sourceType: 'SLEEP',
    start: '2026-09-23T23:00',
    end: '2026-09-24T07:00',
  });
  assert.match(week(s, now), /실제 · 00:00 – 07:00/);
  s.ui.historyDate = '2026-09-23';
  assert.match(week(s, now), /실제 · 23:00 – 00:00/);
  assert.equal(s.timeline[0].start, '2026-09-23T23:00');
});
test('reward preview is read-only, can commit, and detects stale source changes', () => {
  const s = fixture();
  const before = JSON.stringify(s);
  const p = previewReward(s, { title: '산책', minutes: 60 }, now);
  assert.equal(JSON.stringify(s), before);
  assert.ok(p.changes.length > 0);
  const next = action(
    s,
    'REWARD',
    { title: '산책', minutes: 60, previewSignature: p.signature },
    now + 1000,
  );
  assert.equal(next.execution.sourceType, 'REWARD');
  s.todos[0].remainingWorkMin = 100;
  assert.throws(
    () => action(s, 'REWARD', { title: '산책', minutes: 60, previewSignature: p.signature }),
    /다시 선택/,
  );
});
import { load } from '../js/state/persistence.js';
import { createStore } from '../js/state/store.js';
import { preciseLocalInput, stopwatch } from '../js/utils/date.js';
test('version one migration preserves history and pauses active focus without offline accrual', () => {
  const original = start(fixture());
  original.schemaVersion = 1;
  original.execution.measuredFocusMin = 12;
  delete original.execution.timerStatus;
  original.pendingSaved = { minutes: 100, until: iso(now + 100 * MIN) };
  original.ui.virtualNow = iso(now + 15 * MIN);
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => JSON.stringify(original), setItem: () => {} };
  try {
    const migrated = load();
    assert.equal(migrated.schemaVersion, 2);
    assert.deepEqual(migrated.sessions, original.sessions);
    assert.deepEqual(migrated.timeline, original.timeline);
    assert.equal(migrated.pendingSaved, null);
    const store = createStore();
    assert.equal(store.get().execution.timerStatus, 'PAUSED');
    assert.equal(store.get().execution.measuredFocusMin, 12);
    assert.equal(store.get().execution.id, original.execution.id);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
test('short focus sessions keep seconds in the confirmation form and long timers do not wrap', () => {
  const s = fixture();
  startExecution(
    s,
    s.livePlan.find((b) => b.sourceId === 't1'),
    now + 1000,
    1000,
  );
  settleFocus(s.execution, 59000);
  const markup = finishForm(s.execution, now + 59000, 'INCOMPLETE');
  assert.ok(markup.includes(preciseLocalInput(now + 1000)));
  assert.ok(markup.includes(preciseLocalInput(now + 59000)));
  assert.match(markup, /step="1"/);
  const done = finish(s, 'INCOMPLETE', 0.9, now + 59000);
  assert.equal(done.sessions[0].confirmedFocusMin, 0.9);
  assert.equal(stopwatch(1500), '25:00:00');
});
