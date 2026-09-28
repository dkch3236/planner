import { MIN, id, iso, ms, day } from '../utils/date.js';
import { updateParents } from './todo.js';
export function executionFor(block, now, realNow = Date.now()) {
  const focusLike = ['TODO', 'ROUTINE'].includes(block.sourceType);
  return {
    id: id(),
    planId: block.id,
    sourceId: block.sourceId,
    sourceType: block.sourceType,
    title: block.title,
    focusLike,
    assignedWorkMin: block.assignedWorkMin || 0,
    reservedMin: block.reservedMin || 0,
    plannedStart: block.plannedStart || iso(now),
    plannedEnd: block.plannedEnd || iso(now + 30 * MIN),
    startedAt: iso(now),
    expectedEnd: block.plannedEnd || iso(now + 30 * MIN),
    measuredFocusMin: 0,
    focusIntervals: [],
    timerStatus: focusLike ? 'RUNNING' : null,
    focusCheckpoint: realNow,
    suspicious: false,
    overdue: !!block.overdue,
  };
}
export function startExecution(s, block, now, realNow = Date.now()) {
  if (s.execution) throw Error('진행 중인 활동이 있어요. 먼저 끝내거나 전환해 주세요.');
  if (block.sourceType === 'SLEEP') {
    const o = s.sleepOccurrences.find((x) => x.id === block.sourceId);
    if (!o || o.status === 'CLOSED') throw Error('이미 종료한 수면입니다.');
    o.status = 'SLEEPING';
    o.actualStart = iso(now);
  }
  s.execution = executionFor(block, now, realNow);
  s.pendingSaved = null;
}
export function recordExecution(s, e, input, now) {
  if (!e) throw Error('진행 중인 활동이 없어요.');
  const start = ms(input.actualStart || e.startedAt),
    end = ms(input.actualEnd || iso(now));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end > now)
    throw Error('실제 시작·종료 시각을 확인해 주세요.');
  const focus = e.focusLike ? Number(input.confirmedFocusMin ?? e.measuredFocusMin) : 0;
  if (!Number.isFinite(focus) || focus < 0 || focus > (end - start) / MIN + 0.1)
    throw Error('집중 시간은 실제 활동 구간 안으로 입력해 주세요.');
  if (
    input.outcome !== 'MISSED' &&
    input.recordTimeline !== false &&
    s.timeline.some((t) => start < ms(t.end) && ms(t.start) < end)
  )
    throw Error('다른 생활 기록과 시간이 겹쳐요. 실제 구간을 수정해 주세요.');
  let applied = 0,
    satisfied = false;
  if (e.sourceType === 'TODO') {
    const t = s.todos.find((t) => t.id === e.sourceId);
    const done = input.outcome === 'DONE';
    applied = done
      ? Math.min(t.remainingWorkMin, e.assignedWorkMin)
      : Math.min(t.remainingWorkMin, focus);
    const remaining = t.remainingWorkMin - applied;
    if (!done && remaining <= 0 && !(Number(input.additionalMin) > 0))
      throw Error('아직 얼마나 더 필요할까요? 추가 남은 시간을 입력해 주세요.');
    t.remainingWorkMin = remaining > 0 ? remaining : done ? 0 : Number(input.additionalMin);
    t.initialWorkMin = Math.max(t.initialWorkMin, t.remainingWorkMin + applied);
    t.status = t.remainingWorkMin <= 0 ? 'COMPLETED' : 'ACTIVE';
    satisfied = done;
    updateParents(s);
  }
  if (e.sourceType === 'ROUTINE') {
    const r = s.routines.find((r) => r.id === e.sourceId);
    satisfied = r.basis === 'COMPLETION' ? input.outcome === 'DONE' : focus >= r.minimum;
  }
  if (e.sourceType === 'FIXED') {
    const o = s.fixedOccurrences.find((o) => o.id === e.sourceId);
    Object.assign(o, {
      status: input.outcome === 'MISSED' ? 'MISSED' : 'COMPLETED',
      actualStart: iso(start),
      actualEnd: iso(end),
    });
  }
  if (e.sourceType === 'SLEEP') {
    Object.assign(
      s.sleepOccurrences.find((o) => o.id === e.sourceId),
      { status: 'CLOSED', actualStart: iso(start), actualEnd: iso(end) },
    );
  }
  s.sessions.push({
    id: id(),
    executionId: e.id,
    sourceId: e.sourceId,
    sourceType: e.sourceType,
    date: day(start),
    wallClockElapsed: (end - start) / MIN,
    measuredFocusMin: e.measuredFocusMin,
    actualStart: iso(start),
    actualEnd: iso(end),
    overdue: !!e.overdue,
    confirmedFocusMin: focus,
    appliedWorkMin: applied,
    satisfied,
    outcome: input.outcome,
  });
  // Reality is entered explicitly; uncovered wall-clock time remains unrecorded.
  if (input.outcome !== 'MISSED' && input.recordTimeline !== false) {
    s.timeline.push({
      id: id(),
      sourceId: e.sourceId,
      sourceType: e.sourceType,
      title: e.title,
      start: iso(start),
      end: iso(end),
    });
  }
  s.resolvedPlanIds.push(e.planId);
  s.unconfirmed = s.unconfirmed.filter((x) => x.id !== e.planId);
  const personal = s.personalPlans.find((x) => x.id === e.planId);
  if (personal) personal.closed = true;
  return { start, end };
}
export function validateFinish(s, input, now) {
  recordExecution(structuredClone(s), s.execution, input, now);
}
export function finishExecution(s, input, now) {
  const e = s.execution;
  const { end } = recordExecution(s, e, input, now);
  const saved = Math.max(0, Math.floor((ms(e.expectedEnd) - now) / MIN));
  s.pendingSaved =
    saved > 0 && e.sourceType === 'TODO' && input.outcome === 'DONE' && Math.abs(end - now) < MIN
      ? { minutes: saved, until: e.expectedEnd }
      : null;
  s.execution = null;
}
