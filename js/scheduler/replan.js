import { MIN, id, ms, iso, day, at, addDays, overlap } from '../utils/date.js';
import { materialize } from '../domain/occurrences.js';
import { routineStatus } from '../domain/routine.js';
import { activeLeaves } from '../domain/todo.js';
import { plan, pressure } from './planner.js';
import { hard, roomy, legalRange } from './availability.js';
export function reconcile(s, now) {
  if (s.pendingSaved && ms(s.pendingSaved.until) <= now) s.pendingSaved = null;
  materialize(s, now);
  for (const b of s.livePlan) {
    if (
      b.active ||
      !['TODO', 'ROUTINE', 'FIXED', 'REWARD'].includes(b.sourceType) ||
      !b.plannedEnd ||
      ms(b.plannedEnd) > now ||
      s.execution?.planId === b.id ||
      s.resolvedPlanIds.includes(b.id) ||
      s.unconfirmed.some((x) => x.id === b.id)
    )
      continue;
    s.unconfirmed.push({ ...b, status: 'UNCONFIRMED' });
  }
  if (s.freeCreditToday.date !== day(now)) {
    s.freeCreditToday = { date: day(now), minutes: 0 };
    s.pendingSaved = null;
  }
}
export function replanFuture(s, now, options) {
  materialize(s, now);
  const result = plan(s, now, options);
  s.livePlan = result.blocks;
  s.diagnostics = result.warnings;
}
export function candidates(s, now, { allowOverdue = false } = {}) {
  const d = day(now),
    result = [];
  for (const [type, items] of [
    ['TODO', activeLeaves(s)],
    ['ROUTINE', s.routines.filter((r) => r.status === 'ACTIVE')],
  ])
    for (const source of items) {
      if (
        (type === 'TODO' &&
          (source.timeConstraint === 'FIXED' || source.unavailableDates?.includes(d))) ||
        (type === 'ROUTINE' &&
          (source.constraint === 'FIXED' ||
            !routineStatus(s, source, d).available ||
            routineStatus(s, source, d).doneToday ||
            !routineStatus(s, source, d).remaining))
      )
        continue;
      const work =
          type === 'TODO'
            ? Math.min(source.remainingWorkMin, s.settings.maxFocus)
            : source.duration,
        reserved = roomy(work),
        range = legalRange(
          allowOverdue && type === 'TODO' && ms(source.deadline) < now
            ? { ...source, deadline: iso(at(addDays(d, 1), '00:00')) }
            : source,
          type,
          d,
        );
      if (now < range[0] || now + reserved * MIN > range[1]) continue;
      const b = {
        id: id(),
        sourceId: source.id,
        overdue: type === 'TODO' && ms(source.deadline) < now,
        sourceType: type,
        title: source.title,
        date: d,
        assignedWorkMin: work,
        reservedMin: reserved,
        plannedStart: iso(now),
        plannedEnd: iso(now + reserved * MIN),
        focusLike: true,
        locked: false,
      };
      if (
        s.livePlan.some(
          (x) =>
            x.plannedStart && !x.active && hard(x) && x.sourceId !== source.id && overlap(x, b),
        )
      )
        continue;
      if (s.livePlan.some((x) => x.sourceId === source.id && x.locked)) continue;
      result.push(b);
    }
  return result.sort((a, b) => {
    const rank = (x) => {
      const old = s.livePlan.find((y) => y.sourceId === x.sourceId);
      return old ? (old.date === d ? 0 : 1) : 2;
    };
    return rank(a) - rank(b);
  });
}
export function manualReschedule(s, selected, mode, now) {
  if (
    !['PULL_FROM_FREE', 'REORDER_PLANNED', 'SWITCH_EXECUTION', 'PULL_FREE_FOR_REWARD'].includes(
      mode,
    )
  )
    throw Error('알 수 없는 계획 조정입니다.');
  if (s.execution) throw Error('현재 활동을 먼저 마쳐 주세요.');
  if (mode === 'PULL_FREE_FOR_REWARD') {
    if (!Number.isFinite(selected.minutes) || selected.minutes <= 0 || !selected.title?.trim())
      throw Error('활동 이름과 양수인 활동시간을 입력해 주세요.');
    const target = {
      ...selected,
      id: id(),
      sourceType: 'REWARD',
      assignedWorkMin: 0,
      reservedMin: selected.minutes,
      plannedStart: iso(now),
      plannedEnd: iso(now + selected.minutes * MIN),
      locked: true,
      focusLike: false,
    };
    if (day(now) !== day(now + selected.minutes * MIN))
      throw Error('오늘 안에서 가능한 시간을 선택해 주세요.');
    const conflicts = s.livePlan.filter((b) => b.plannedStart && overlap(b, target));
    if (conflicts.some((b) => hard(b)))
      throw Error('고정 일정·수면·잠금·긴급 마감은 옮길 수 없어요.');
    const todayFree = remainingFreeSlots(s, now).reduce((n, b) => n + b.reservedMin, 0);
    if (todayFree < selected.minutes) throw Error('오늘 남은 자유시간이 부족해요.');
    const trial = structuredClone(s);
    trial.personalPlans.push(target);
    replanFuture(trial, now);
    assertRetainedWork(s, trial, now);
    Object.assign(s, trial);
    return target;
  }
  const candidate = candidates(s, now, { allowOverdue: selected.allowOverdue === true }).find(
    (b) => b.sourceId === selected.sourceId,
  );
  if (!candidate) throw Error('지금 시작 가능한 작업이 아니에요. 시간 제약을 확인해 주세요.');
  s.livePlan = s.livePlan.filter((b) => b.sourceId !== candidate.sourceId || b.locked);
  if (s.pendingSaved && mode === 'PULL_FROM_FREE') {
    s.freeCreditToday.minutes += Math.max(
      0,
      Math.min(
        s.pendingSaved.minutes,
        (ms(s.pendingSaved.until) - now) / MIN,
        candidate.assignedWorkMin,
      ),
    );
    s.pendingSaved = null;
  }
  return candidate;
}

export function assertRetainedWork(s, trial, now, exceptSourceId = null) {
  for (const b of s.livePlan.filter(
    (b) =>
      b.sourceId !== exceptSourceId &&
      ['TODO', 'ROUTINE'].includes(b.sourceType) &&
      (!b.plannedEnd || ms(b.plannedEnd) > now),
  )) {
    const r = b.sourceType === 'ROUTINE' ? s.routines.find((r) => r.id === b.sourceId) : null;
    const w = r ? routineStatus(s, r, b.date || day(b.plannedStart)) : null;
    const eligible = (x) =>
      x.sourceId === b.sourceId &&
      (!x.plannedEnd || ms(x.plannedEnd) > now) &&
      (!w ||
        ((x.date || day(x.plannedStart)) >= w.start && (x.date || day(x.plannedStart)) <= w.end));
    const before = s.livePlan.filter(eligible).reduce((n, x) => n + x.assignedWorkMin, 0);
    const after = trial.livePlan.filter(eligible).reduce((n, x) => n + x.assignedWorkMin, 0);
    if (after < before) throw Error('다른 작업의 마감·수행 기회를 지키면서 옮길 공간이 없어요.');
  }
}

export function remainingFreeSlots(s, now) {
  return s.livePlan
    .filter(
      (b) =>
        b.sourceType === 'FREE' &&
        b.plannedStart &&
        ms(b.plannedEnd) > now &&
        day(b.plannedStart) === day(now),
    )
    .map((b) => {
      const start = Math.max(now, ms(b.plannedStart));
      return { ...b, plannedStart: iso(start), reservedMin: (ms(b.plannedEnd) - start) / MIN };
    });
}
export function previewReward(s, selected, now) {
  const trial = structuredClone(s);
  manualReschedule(trial, selected, 'PULL_FREE_FOR_REWARD', now);
  const signature = (state) =>
    JSON.stringify(
      state.livePlan
        .filter((b) => ['TODO', 'ROUTINE'].includes(b.sourceType))
        .map((b) => [b.sourceId, b.date, b.plannedStart, b.plannedEnd, b.assignedWorkMin])
        .sort(),
    );
  const before = s.livePlan.filter((b) => ['TODO', 'ROUTINE'].includes(b.sourceType));
  const changes = before
    .filter(
      (b) =>
        !trial.livePlan.some(
          (x) =>
            x.sourceId === b.sourceId &&
            x.plannedStart === b.plannedStart &&
            x.date === b.date &&
            x.assignedWorkMin === b.assignedWorkMin,
        ),
    )
    .map((b) => ({
      title: b.title,
      from: b.plannedStart || b.date,
      to: trial.livePlan
        .filter((x) => x.sourceId === b.sourceId)
        .map((x) => x.plannedStart || x.date),
    }));
  return {
    changes,
    signature: JSON.stringify([
      signature(s),
      s.settings,
      s.todos,
      s.routines,
      s.fixedOccurrences,
      s.personalPlans,
      s.sessions,
      s.execution,
    ]),
  };
}
