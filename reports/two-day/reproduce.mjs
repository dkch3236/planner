// Characterization probes: these assert what was observed, not desired product behavior.
// Run from project root: node reports/two-day/reproduce.mjs
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createState } from '../../js/state/schema.js';
import { applyAction } from '../../js/domain/actions.js';
import { replanFuture, reconcile, candidates } from '../../js/scheduler/replan.js';
import { resolveCurrentView } from '../../js/scheduler/currentView.js';
import { week } from '../../js/ui/views.js';
import { MIN, at, iso, ms } from '../../js/utils/date.js';
import { twoDayFixture, DAY1, DAY2 } from '../../tests/two-day-fixture.mjs';

const checks = [];
const act = (s, type, payload, now) => applyAction(s, { type, payload }, now);
function run(id, title, fn) {
  try {
    checks.push({ id, title, ...fn(), reproduced: true });
  } catch (error) {
    checks.push({ id, title, reproduced: false, error: error.message });
  }
}
function awake() {
  const s = twoDayFixture();
  return act(
    s,
    'FINISH',
    {
      outcome: 'DONE',
      confirmedFocusMin: 0,
      actualStart: s.execution.startedAt,
      actualEnd: iso(at(DAY1, '07:30')),
    },
    at(DAY1, '07:30'),
  );
}

run('F01', '미완료 종료가 추가 자유시간을 적립한다', () => {
  let s = awake();
  const sourceId = s.todos.find((t) => t.title === '연구 발표 준비').id;
  s = act(s, 'MANUAL', { sourceId, mode: 'PULL_FROM_FREE' }, at(DAY1, '09:00'));
  s = act(s, 'FINISH', { outcome: 'INCOMPLETE', confirmedFocusMin: 25 }, at(DAY1, '09:25'));
  assert.equal(s.todos.find((t) => t.id === sourceId).remainingWorkMin, 65);
  assert.equal(s.pendingSaved.minutes, 35);
  const emailId = s.todos.find((t) => t.title === '밀린 이메일 정리').id;
  s = act(s, 'MANUAL', { sourceId: emailId, mode: 'PULL_FROM_FREE' }, at(DAY1, '09:25'));
  assert.equal(s.freeCreditToday.minutes, 35);
  return {
    expected: '미완료로 남긴 작업을 자유시간의 순증가로 인정하지 않기',
    observed: { remaining: 65, credited: 35 },
  };
});
run('F02', '만료된 조기종료 안내가 고정 일정을 가린다', () => {
  let s = awake();
  const sourceId = s.todos[0].id;
  s = act(s, 'MANUAL', { sourceId, mode: 'PULL_FROM_FREE' }, at(DAY1, '09:00'));
  s = act(s, 'FINISH', { outcome: 'DONE', confirmedFocusMin: 20 }, at(DAY1, '09:20'));
  const later = at(DAY1, '11:00');
  reconcile(s, later);
  assert.ok(s.livePlan.some((b) => b.sourceType === 'FIXED' && ms(b.plannedStart) === later));
  assert.equal(resolveCurrentView(s, later).kind, 'FREE');
  return {
    expected: '11시 현재 미팅을 보여주기',
    observed: {
      view: resolveCurrentView(s, later),
      expiredAt: s.pendingSaved.until,
      now: iso(later),
    },
  };
});
run('F03', '날짜가 바뀌면 밤새 잔 수면 기록이 주간에서 사라진다', () => {
  const s = awake(),
    history = s.timeline.find((t) => t.sourceType === 'SLEEP');
  assert.ok(history);
  const html = week(s, at(DAY1, '07:30'));
  assert.ok(!html.includes(`data-id="${history.id}"`));
  return {
    expected: '오늘 00:00~07:30 수면 구간을 잘라 표시하기',
    observed: { stored: history, visibleInWeek: false },
  };
});
run('F04', '다른 기회가 있는 일일 루틴도 마지막 기회로 판단한다', () => {
  const now = at(DAY2, '07:10');
  let s = createState(now, false);
  s = act(
    s,
    'SAVE_ROUTINE',
    {
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
      anchorDate: DAY2,
      weekdays: [],
    },
    now,
  );
  assert.throws(() => act(s, 'REWARD', { title: '아침 요리', minutes: 120 }, now), /마지막/);
  const trial = structuredClone(s);
  trial.personalPlans.push({
    id: 'feasibility-only',
    sourceId: 'feasibility-only',
    title: '아침 요리',
    sourceType: 'REWARD',
    locked: true,
    assignedWorkMin: 0,
    reservedMin: 120,
    plannedStart: iso(now),
    plannedEnd: iso(now + 120 * MIN),
  });
  replanFuture(trial, now);
  const relocated = trial.livePlan.find((b) => b.sourceType === 'ROUTINE');
  assert.ok(relocated);
  assert.ok(ms(relocated.plannedStart) >= now + 120 * MIN);
  assert.ok(ms(relocated.plannedEnd) <= at(DAY2, '21:00'));
  return {
    expected: '현재 창 안의 다른 수행 기회가 있으면 재배치 허용',
    observed: { rejected: true, feasibleAlternative: relocated },
  };
});
run('F05', '지난 시간의 보상 예약을 받아들인 뒤 미래 계획에서 사라진다', () => {
  const before = at(DAY2, '15:55'),
    now = at(DAY2, '18:00');
  let s = createState(before, false);
  replanFuture(s, before);
  s = act(s, 'REWARD', { title: '영화 보기', minutes: 90, start: iso(before) }, now);
  assert.equal(s.personalPlans.length, 1);
  assert.equal(s.livePlan.filter((b) => b.sourceType === 'REWARD').length, 0);
  assert.equal(s.unconfirmed.length, 0);
  return {
    expected: '과거 시작 시각을 거절하거나 현재 이후로 보정하기',
    observed: { accepted: s.personalPlans[0], futureBlocks: 0, unconfirmed: 0 },
  };
});
run('F06', '겹치지 않는 과거 확인도 현재 실행 때문에 차단한다', () => {
  let s = awake();
  reconcile(s, at(DAY1, '13:05'));
  const past = s.unconfirmed.find((b) => b.title === '점심 약속');
  assert.ok(past);
  s = act(s, 'REST', {}, at(DAY1, '13:10'));
  assert.throws(
    () =>
      act(
        s,
        'CONFIRM',
        {
          id: past.id,
          outcome: 'DONE',
          confirmedFocusMin: 0,
          actualStart: past.plannedStart,
          actualEnd: past.plannedEnd,
        },
        at(DAY1, '13:15'),
      ),
    /현재 활동을 마친/,
  );
  return {
    expected: '현재 실행과 별개로 12~13시 기록을 확인하기',
    observed: {
      past: [past.plannedStart, past.plannedEnd],
      activeStart: s.execution.startedAt,
      rejected: true,
    },
  };
});
run('F07', '마감 지난 할 일은 ACTIVE이지만 시작 후보에서 사라진다', () => {
  const now = at(DAY2, '09:00');
  const s = awake();
  replanFuture(s, now);
  const email = s.todos.find((t) => t.title === '밀린 이메일 정리');
  assert.equal(email.status, 'ACTIVE');
  assert.ok(!candidates(s, now).some((c) => c.sourceId === email.id));
  const changed = act(s, 'SAVE_TODO', { ...email, deadline: iso(at(DAY2, '18:00')) }, now);
  assert.ok(candidates(changed, now).some((c) => c.sourceId === email.id));
  return {
    expected: '원래 마감을 보존하면서 늦게라도 수행하는 선택 제공',
    observed: { active: true, selectableBeforeDeadlineEdit: false, selectableAfterEdit: true },
  };
});
run('F08', '작업 전환 실패 시 현재 실행과 요구량은 보존된다', () => {
  let s = awake();
  const sourceId = s.todos[0].id;
  s = act(s, 'MANUAL', { sourceId, mode: 'PULL_FROM_FREE' }, at(DAY1, '09:00'));
  const original = JSON.stringify(s);
  assert.throws(() =>
    act(s, 'SWITCH', { sourceId: 'missing', finish: { confirmedFocusMin: 10 } }, at(DAY1, '09:10')),
  );
  assert.equal(JSON.stringify(s), original);
  return { expected: '실패 시 원래 실행 유지', observed: '정상: 원본 상태와 실행 보존' };
});
await writeFile(new URL('./domain-probes.json', import.meta.url), JSON.stringify(checks, null, 2));
console.log(
  JSON.stringify(
    checks.map(({ id, title, reproduced }) => ({ id, title, reproduced })),
    null,
    2,
  ),
);
if (checks.some((c) => !c.reproduced)) process.exitCode = 1;
