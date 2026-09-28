import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/state/schema.js';
import { createStore } from '../js/state/store.js';
import { applyAction } from '../js/domain/actions.js';
import { timelineForm } from '../js/ui/forms.js';
import { week } from '../js/ui/views.js';
import { backgroundFor, paperToday } from '../js/ui/today.js';
import { sourceIcon } from '../js/ui/icons.js';
import { materialize } from '../js/domain/occurrences.js';
import { at, addDays, iso, ms, MIN, day } from '../js/utils/date.js';
import { todayPreview } from '../js/ui/today-preview.js';
const now = at('2026-09-29', '12:00');

test('browsing calendar dates does not reschedule existing work', () => {
  const store = createStore({ initialState: todayPreview(now) });
  const before = structuredClone(store.get().livePlan);
  store.ui({ tab: 'week', weekStart: addDays(now, 20) });
  assert.deepEqual(store.get().livePlan, before);
});

test('recommended timeline bounds survive sub-second form round trip without overlapping adjacent records', () => {
  let s = createState(now, false);
  const start = at('2026-09-29', '09:00') + 47321,
    end = start + 20 * MIN + 127;
  s.timeline = [
    { id: 'before', start: iso(start - MIN), end: iso(start) },
    { id: 'after', start: iso(end), end: iso(end + MIN) },
  ];
  const form = timelineForm({ start: iso(start), end: iso(end) }, now);
  const value = (name) => form.match(new RegExp(`name="${name}"[^>]*value="([^"]+)"`))[1];
  assert.equal(ms(value('start')), start);
  assert.equal(ms(value('end')), end);
  s = applyAction(
    s,
    {
      type: 'TIMELINE',
      payload: { start: value('start'), end: value('end'), title: '빈 구간', sourceType: 'REST' },
    },
    now,
  );
  assert.equal(s.timeline.length, 3);
  assert.throws(
    () =>
      applyAction(
        s,
        { type: 'TIMELINE', payload: { start: iso(start - 1), end: iso(end), sourceType: 'REST' } },
        now,
      ),
    /겹/,
  );
});
test('fixed events on tomorrow, +3 and +6 days are stored and rendered, including mobile date selection', () => {
  for (const offset of [1, 3, 6]) {
    const d = addDays(now, offset),
      title = `다른 날짜 ${offset}`,
      icon = 'icons/illustrated/icon_coffee.webp';
    const s = applyAction(
      createState(now, false),
      {
        type: 'SAVE_FIXED',
        payload: {
          title,
          start: iso(at(d, '13:00')),
          end: iso(at(d, '14:00')),
          recurrence: 'ONCE',
          weekdays: [],
          icon,
        },
      },
      now,
    );
    s.ui.weekDay = d;
    const html = week(s, now);
    assert.match(html, new RegExp(`selected-day[\\s\\S]*${title}`));
    assert.ok(html.includes(title));
    assert.ok(html.includes(icon));
    const b = s.livePlan.find((b) => b.title === title);
    assert.ok(b);
    assert.equal(sourceIcon(s, b), icon);
  }
});
test('calendar can display a registered fixed event beyond planning horizon without moving current plans', () => {
  const d = addDays(now, 20);
  const s = applyAction(
    createState(now, false),
    {
      type: 'SAVE_FIXED',
      payload: {
        title: '먼 날짜 약속',
        start: iso(at(d, '13:00')),
        end: iso(at(d, '14:00')),
        recurrence: 'ONCE',
        weekdays: [],
      },
    },
    now,
  );
  const before = structuredClone(s.livePlan);
  materialize(s, now, `${d}T12:00:00`);
  s.ui.weekStart = d;
  assert.ok(week(s, now).includes('먼 날짜 약속'));
  assert.deepEqual(s.livePlan, before);
});
test('today exclusion applies to fixed-time Todos and restores without changing demand', () => {
  let s = createState(now, false);
  s = applyAction(
    s,
    {
      type: 'SAVE_TODO',
      payload: {
        title: '오후 할 일',
        remainingWorkMin: 30,
        deadline: iso(now + 5 * MIN * 60),
        importance: 'SHOULD',
        desire: 3,
        timeConstraint: 'FIXED',
        fixedStart: iso(now + MIN * 60),
        fixedEnd: iso(now + MIN * 90),
      },
    },
    now,
  );
  const id = s.todos[0].id;
  s = applyAction(s, { type: 'UNAVAILABLE', payload: { id, sourceType: 'TODO' } }, now);
  assert.ok(!s.livePlan.some((b) => b.sourceId === id));
  assert.equal(s.todos[0].remainingWorkMin, 30);
  s = applyAction(
    s,
    { type: 'UNAVAILABLE', payload: { id, sourceType: 'TODO', restore: true } },
    now,
  );
  assert.ok(s.livePlan.some((b) => b.sourceId === id));
});
test('excluding active work requires completion input and atomically preserves confirmed progress', () => {
  let s = todayPreview(now);
  const e = s.execution;
  const t = ms(e.startedAt) + 38 * MIN;
  assert.throws(
    () =>
      applyAction(
        s,
        { type: 'UNAVAILABLE', payload: { id: e.sourceId, sourceType: 'TODO' } },
        t,
        now,
      ),
    /종료 내용/,
  );
  s = applyAction(
    s,
    {
      type: 'UNAVAILABLE',
      payload: {
        id: e.sourceId,
        sourceType: 'TODO',
        finish: { actualStart: e.startedAt, actualEnd: iso(t), confirmedFocusMin: 20 },
      },
    },
    t,
    now,
  );
  assert.equal(s.execution, null);
  assert.equal(s.todos.find((x) => x.id === e.sourceId).remainingWorkMin, 25);
  assert.equal(s.sessions.length, 1);
  assert.ok(!s.livePlan.some((b) => b.sourceId === e.sourceId));
});
test('approved daypart boundaries and button order are applied', () => {
  for (const [hour, period] of [
    [4, 'night'],
    [5, 'morning'],
    [8, 'morning'],
    [9, 'noon'],
    [16, 'noon'],
    [17, 'sunset'],
    [18, 'sunset'],
    [19, 'evening'],
    [20, 'evening'],
    [21, 'night'],
  ])
    assert.ok(
      backgroundFor(at('2026-09-29', `${String(hour).padStart(2, '0')}:00`)).includes(period),
    );
  const s = todayPreview(now);
  const html = paperToday(s, now, '');
  assert.ok(
    html.indexOf('class="paper-button switch"') < html.indexOf('class="paper-button done"'),
  );
  assert.ok(html.indexOf('class="paper-button done"') < html.indexOf('class="paper-button stop"'));
});

test('routine exclusion only removes today and can be restored with its icon and target intact', () => {
  let s = todayPreview(now);
  const routine = { ...s.routines[0], icon: 'icons/illustrated/icon_coffee.webp' };
  s = applyAction(s, { type: 'SAVE_ROUTINE', payload: routine }, now);
  s = applyAction(
    s,
    { type: 'UNAVAILABLE', payload: { id: routine.id, sourceType: 'ROUTINE' } },
    now,
  );
  assert.ok(
    !s.livePlan.some(
      (b) => b.sourceId === routine.id && day(b.plannedStart || `${b.date}T12:00`) === day(now),
    ),
  );
  assert.ok(
    s.livePlan.some(
      (b) => b.sourceId === routine.id && day(b.plannedStart || `${b.date}T12:00`) > day(now),
    ),
  );
  assert.equal(s.routines[0].duration, routine.duration);
  s = applyAction(
    s,
    { type: 'UNAVAILABLE', payload: { id: routine.id, sourceType: 'ROUTINE', restore: true } },
    now,
  );
  const block = s.livePlan.find(
    (b) => b.sourceId === routine.id && day(b.plannedStart || `${b.date}T12:00`) === day(now),
  );
  assert.ok(block);
  assert.equal(sourceIcon(s, block), routine.icon);
});

test('todo icon edits survive scheduling and clearing restores automatic selection', () => {
  let s = todayPreview(now);
  const todo = { ...s.todos[1], icon: 'icons/illustrated/icon_coffee.webp' };
  s = applyAction(s, { type: 'SAVE_TODO', payload: todo }, now);
  assert.equal(
    sourceIcon(
      s,
      s.livePlan.find((b) => b.sourceId === todo.id),
    ),
    todo.icon,
  );
  s = applyAction(s, { type: 'SAVE_TODO', payload: { ...todo, icon: '' } }, now);
  assert.equal(
    sourceIcon(
      s,
      s.livePlan.find((b) => b.sourceId === todo.id),
    ),
    null,
  );
});
