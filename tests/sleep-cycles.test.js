import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/state/schema.js';
import { applyAction } from '../js/domain/actions.js';
import { replanFuture } from '../js/scheduler/replan.js';
import { materialize } from '../js/domain/occurrences.js';
import { resolveCurrentView } from '../js/scheduler/currentView.js';
import { at, iso, ms, overlap } from '../js/utils/date.js';
const morning = at('2026-09-29', '00:30');
const act = (s, type, t, payload = {}) => applyAction(s, { type, payload }, t, t);
const finish = (s, t) => act(s, 'FINISH', t, { outcome: 'DONE', confirmedFocusMin: 0 });
function state() {
  const s = createState(morning, false);
  s.todos = [
    {
      id: 'work',
      title: '작업',
      status: 'ACTIVE',
      parentId: null,
      remainingWorkMin: 180,
      initialWorkMin: 180,
      importance: 'MUST',
      desire: 2,
      timeConstraint: 'FLEXIBLE',
      deadline: iso(at('2026-10-01', '12:00')),
    },
  ];
  replanFuture(s, morning);
  return s;
}
function tonight(s) {
  return s.sleepOccurrences.find(
    (o) => o.kind !== 'EXTRA' && o.plannedStart === iso(at('2026-09-29', '23:00')),
  );
}
function assertNextNight(s) {
  const midnight = at('2026-09-30', '00:01');
  replanFuture(s, midnight);
  assert.equal(resolveCurrentView(s, midnight).kind, 'SLEEP_PROMPT');
  const night = tonight(s);
  assert.equal(night.status, 'PLANNED');
  assert.ok(
    !s.livePlan.some((b) => b.sourceType === 'TODO' && b.plannedStart && overlap(b, night)),
  );
}
test('00:30 sleep, 07:00 wake, and 23:00 sleep use two separate cycles on the same calendar date', () => {
  let s = act(state(), 'SLEEP', morning);
  const first = s.execution.sourceId;
  s = finish(s, at('2026-09-29', '07:00'));
  assertNextNight(structuredClone(s));
  s = act(s, 'SLEEP', at('2026-09-29', '23:00'));
  assert.notEqual(s.execution.sourceId, first);
  assert.equal(s.execution.expectedEnd, iso(at('2026-09-30', '07:00')));
});
test('sleep started after planned wake time cannot consume the upcoming night', () => {
  let s = act(state(), 'SLEEP', at('2026-09-29', '07:30'));
  assert.notEqual(s.execution.sourceId, tonight(s).id);
  s = finish(s, at('2026-09-29', '10:00'));
  assertNextNight(s);
});
test('another sleep after an early wake does not close the future scheduled night', () => {
  let s = act(state(), 'SLEEP', morning);
  s = finish(s, at('2026-09-29', '02:00'));
  s = act(s, 'SLEEP', at('2026-09-29', '03:00'));
  assert.notEqual(s.execution.sourceId, tonight(s).id);
  s = finish(s, at('2026-09-29', '07:00'));
  assertNextNight(s);
});
test('legacy night closed by an earlier morning sleep is restored without rewriting any recorded history', () => {
  const s = state(),
    old = tonight(s);
  Object.assign(old, {
    status: 'CLOSED',
    actualStart: iso(morning),
    actualEnd: iso(at('2026-09-29', '07:00')),
  });
  s.sessions = [
    {
      id: 'session',
      sourceId: old.id,
      sourceType: 'SLEEP',
      actualStart: old.actualStart,
      actualEnd: old.actualEnd,
    },
  ];
  s.timeline = [
    {
      id: 'record',
      sourceId: old.id,
      sourceType: 'SLEEP',
      start: old.actualStart,
      end: old.actualEnd,
    },
  ];
  const history = structuredClone({ sessions: s.sessions, timeline: s.timeline });
  materialize(s, at('2026-09-29', '12:00'));
  assert.equal(old.kind, 'EXTRA');
  assert.notEqual(tonight(s).id, old.id);
  const count = s.sleepOccurrences.length;
  materialize(s, at('2026-09-29', '12:00'));
  assert.equal(s.sleepOccurrences.length, count);
  assert.deepEqual({ sessions: s.sessions, timeline: s.timeline }, history);
  assertNextNight(s);
});
test('legacy extra sleep on a date does not prevent creating that dates scheduled cycle', () => {
  const s = createState(morning, false);
  s.sleepOccurrences = [
    {
      id: 'extra',
      date: '2026-09-29',
      title: '추가 수면',
      plannedStart: iso(morning),
      plannedEnd: iso(at('2026-09-29', '08:30')),
      status: 'CLOSED',
      actualStart: iso(morning),
      actualEnd: iso(at('2026-09-29', '07:00')),
    },
  ];
  materialize(s, at('2026-09-29', '12:00'));
  assert.ok(tonight(s));
  assert.equal(s.sleepOccurrences.find((o) => o.id === 'extra').status, 'CLOSED');
});
