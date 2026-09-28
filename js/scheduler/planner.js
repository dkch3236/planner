import { MIN, id, day, addDays, at, iso, ms, overlap } from '../utils/date.js';
import { activeLeaves } from '../domain/todo.js';
import { routineStatus, opportunities } from '../domain/routine.js';
import { roomy, gaps, legalRange, freeBlocks } from './availability.js';
export function pressure(t, now) {
  const hours = Math.max(1, (ms(t.deadline) - now) / 3600000);
  return (
    ({ MUST: 100, SHOULD: 45, OPTIONAL: 10 }[t.importance] || 0) +
    t.desire * 4 +
    (t.remainingWorkMin / hours) * 10
  );
}
export function plan(s, now, { full = false } = {}) {
  const end = at(addDays(now, 7), '00:00'),
    blocks = [],
    warnings = [];
  const append = (o) => {
    if (ms(o.plannedEnd) > now && ms(o.plannedStart) < end) blocks.push(o);
  };
  for (const o of s.fixedOccurrences.filter(
    (o) => o.status === 'PLANNED' && o.id !== s.execution?.sourceId,
  ))
    append({
      ...o,
      sourceId: o.id,
      sourceType: 'FIXED',
      locked: true,
      assignedWorkMin: 0,
      reservedMin: (ms(o.plannedEnd) - ms(o.plannedStart)) / MIN,
    });
  for (const o of s.sleepOccurrences.filter(
    (o) => o.status !== 'CLOSED' && o.id !== s.execution?.sourceId,
  ))
    append({
      ...o,
      sourceId: o.id,
      sourceType: 'SLEEP',
      locked: true,
      assignedWorkMin: 0,
      reservedMin: (ms(o.plannedEnd) - ms(o.plannedStart)) / MIN,
    });
  for (const p of s.personalPlans.filter((p) => !p.closed && p.id !== s.execution?.planId))
    append({ ...p, locked: true });
  if (s.execution) {
    const e = s.execution;
    blocks.push({
      ...e,
      id: `active-${e.id}`,
      plannedStart: e.startedAt,
      plannedEnd: iso(Math.max(now + 15 * MIN, ms(e.expectedEnd))),
      locked: true,
      active: true,
    });
  }
  const remaining = new Map(activeLeaves(s).map((t) => [t.id, t.remainingWorkMin]));
  if (s.execution?.sourceType === 'TODO')
    remaining.set(
      s.execution.sourceId,
      Math.max(0, (remaining.get(s.execution.sourceId) || 0) - s.execution.assignedWorkMin),
    );
  const plannedRoutine = new Map();
  const capacityReservations = [];
  const register = (b) => {
    // Distant work has no public start/end. Temporary footprints verify window capacity.
    if (!b.plannedStart) {
      const source = (b.sourceType === 'TODO' ? s.todos : s.routines).find(
        (x) => x.id === b.sourceId,
      );
      const range = legalRange(source, b.sourceType, b.date);
      let footprint;
      for (const [a, z] of gaps(at(b.date, '00:00'), at(addDays(b.date, 1), '00:00'), [
        ...blocks,
        ...capacityReservations,
      ])) {
        const start = Math.max(a, range[0]),
          end = start + (b.reservedMin + 15) * MIN;
        if (end <= Math.min(z, range[1])) {
          footprint = { plannedStart: iso(start), plannedEnd: iso(end) };
          break;
        }
      }
      if (!footprint) return false;
      capacityReservations.push(footprint);
    }
    blocks.push(b);
    if (b.sourceType === 'TODO')
      remaining.set(b.sourceId, Math.max(0, remaining.get(b.sourceId) - b.assignedWorkMin));
    if (b.sourceType === 'ROUTINE') {
      const dates = plannedRoutine.get(b.sourceId) || new Set();
      dates.add(b.date || day(b.plannedStart));
      plannedRoutine.set(b.sourceId, dates);
    }
    return true;
  };
  const routineNeeded = (r, d) => {
    const rs = routineStatus(s, r, d);
    const dates = plannedRoutine.get(r.id) || new Set();
    const used = [...dates].filter((x) => x >= rs.start && x <= rs.end).length;
    return (
      rs.available &&
      !rs.doneToday &&
      !dates.has(d) &&
      rs.remaining > used &&
      !(s.execution?.sourceId === r.id && day(s.execution.startedAt) === d)
    );
  };
  // Exact constraints are placed before movable reservations, across all seven days.
  for (let offset = 0; offset < 7; offset++) {
    const d = addDays(now, offset);
    const exact = [
      ...activeLeaves(s)
        .filter((t) => t.timeConstraint === 'FIXED' && day(t.fixedStart) === d && !t.unavailableDates?.includes(d))
        .map((source) => ({ source, type: 'TODO' })),
      ...s.routines
        .filter((r) => r.status === 'ACTIVE' && r.constraint === 'FIXED' && routineNeeded(r, d))
        .map((source) => ({ source, type: 'ROUTINE' })),
    ];
    for (const { source, type } of exact) {
      const range = legalRange(source, type, d);
      if (range[0] < now || range[1] > end || range[1] <= range[0]) continue;
      const work =
        type === 'TODO'
          ? Math.min(s.settings.maxFocus, remaining.get(source.id) || 0)
          : source.duration;
      if (work <= 0) continue;
      const old = s.livePlan.find(
        (b) =>
          b.sourceId === source.id &&
          (b.date || day(b.plannedStart)) === d &&
          !b.active &&
          !s.resolvedPlanIds.includes(b.id),
      );
      const block = {
        id: old?.id || id(),
        sourceId: source.id,
        sourceType: type,
        title: source.title,
        date: d,
        assignedWorkMin: work,
        reservedMin: (range[1] - range[0]) / MIN,
        plannedStart: iso(range[0]),
        plannedEnd: iso(range[1]),
        locked: true,
        focusLike: true,
      };
      if (work > block.reservedMin || blocks.some((b) => b.plannedStart && overlap(b, block))) {
        warnings.push({
          sourceId: source.id,
          message: `${source.title}: 고정 시간 충돌로 배치하지 못했어요.`,
        });
        continue;
      }
      register(block);
    }
  }
  // Keep unaffected appointments in place: local replanning is the default.
  for (const old of s.livePlan
    .filter((b) => ['TODO', 'ROUTINE'].includes(b.sourceType))
    .sort(
      (a, b) => ms(a.plannedStart || `${a.date}T12:00`) - ms(b.plannedStart || `${b.date}T12:00`),
    )) {
    if (
      old.active ||
      blocks.some((b) => b.id === old.id) ||
      s.resolvedPlanIds.includes(old.id) ||
      s.unconfirmed.some((x) => x.id === old.id) ||
      s.execution?.planId === old.id ||
      (full && !old.locked)
    )
      continue;
    const source = (old.sourceType === 'TODO' ? s.todos : s.routines).find(
      (x) => x.id === old.sourceId && x.status === 'ACTIVE',
    );
    if (!source) continue;
    const d = old.date || day(old.plannedStart);
    if (d < day(now) || d >= addDays(now, 7)) continue;
    if (
      (old.sourceType === 'TODO' && !(remaining.get(source.id) > 0)) ||
      (old.sourceType === 'ROUTINE' && !routineNeeded(source, d))
    )
      continue;
    if (!old.plannedStart) {
      if (d < addDays(now, 3)) continue;
      const range = legalRange(source, old.sourceType, d);
      if (range[1] - Math.max(at(d, '00:00'), range[0]) < old.reservedMin * MIN) continue;
      register({
        ...old,
        title: source.title,
        assignedWorkMin:
          old.sourceType === 'TODO'
            ? Math.min(old.assignedWorkMin, remaining.get(source.id))
            : old.assignedWorkMin,
      });
      continue;
    }
    if (ms(old.plannedEnd) <= now) continue;
    const range = legalRange(source, old.sourceType, d);
    if (
      ms(old.plannedStart) < range[0] ||
      ms(old.plannedEnd) > range[1] ||
      (!old.locked && blocks.some((x) => x.plannedStart && overlap(x, old)))
    )
      continue;
    if (
      old.focusLike &&
      !old.locked &&
      blocks.some(
        (x) =>
          x.focusLike &&
          x.plannedStart &&
          ((ms(old.plannedStart) >= ms(x.plannedEnd) &&
            ms(old.plannedStart) - ms(x.plannedEnd) < 15 * MIN) ||
            (ms(x.plannedStart) >= ms(old.plannedEnd) &&
              ms(x.plannedStart) - ms(old.plannedEnd) < 15 * MIN)),
      )
    )
      continue;
    register({
      ...old,
      title: source.title,
      assignedWorkMin:
        old.sourceType === 'TODO'
          ? Math.min(old.assignedWorkMin, remaining.get(source.id))
          : old.assignedWorkMin,
    });
  }
  for (let offset = 0; offset < 7; offset++) {
    const d = addDays(now, offset),
      start = Math.max(now, at(d, '00:00')),
      stop = at(addDays(d, 1), '00:00');
    const hardReserved = blocks.filter((b) => b.locked && b.plannedStart);
    const capacity = gaps(start, stop, hardReserved).reduce((n, [a, b]) => n + (b - a) / MIN, 0);
    let used = blocks
      .filter(
        (b) => (b.date || day(b.plannedStart)) === d && ['TODO', 'ROUTINE'].includes(b.sourceType),
      )
      .reduce((n, b) => n + b.reservedMin, 0);
    const items = [
      ...s.routines
        .filter((r) => r.status === 'ACTIVE' && r.constraint !== 'FIXED' && routineNeeded(r, d))
        .map((r) => ({
          source: r,
          type: 'ROUTINE',
          score:
            70 +
            (60 * routineStatus(s, r, d).remaining) / Math.max(1, opportunities(s, r, d).length),
        })),
      ...activeLeaves(s)
        .filter(
          (t) =>
            t.timeConstraint !== 'FIXED' &&
            (remaining.get(t.id) || 0) > 0 &&
            !t.unavailableDates?.includes(d),
        )
        .map((t) => ({ source: t, type: 'TODO', score: pressure(t, now) })),
    ].sort((a, b) => b.score - a.score);
    for (const { source, type } of items) {
      const exact =
        type === 'TODO' ? source.timeConstraint === 'FIXED' : source.constraint === 'FIXED';
      const critical =
        type === 'TODO' && source.importance === 'MUST' && ms(source.deadline) < stop;
      let count = 0;
      while (
        count++ < 30 &&
        (type === 'TODO' ? (remaining.get(source.id) || 0) > 0 : routineNeeded(source, d))
      ) {
        let work =
          type === 'TODO'
            ? Math.min(s.settings.maxFocus, remaining.get(source.id))
            : source.duration;
        let reserved = roomy(work);
        const range = legalRange(source, type, d);
        if (range[1] <= start || range[0] >= stop) break;
        if (!critical && !exact && used + reserved > capacity * s.settings.density) {
          if (
            type === 'ROUTINE' &&
            source.minimum < work &&
            used + roomy(source.minimum) <= capacity * s.settings.density
          ) {
            work = source.minimum;
            reserved = roomy(work);
          } else break;
        }
        let slot;
        if (offset >= 3 && !exact) {
          const allowance = (range[1] - Math.max(start, range[0])) / MIN;
          if (allowance < reserved) break;
          slot = null;
        } else {
          for (const [a, b] of gaps(start, stop, blocks)) {
            let from = Math.max(a, range[0]);
            const previous = blocks.find((x) => x.focusLike && ms(x.plannedEnd) === a);
            if (previous) from = Math.max(from, a + 15 * MIN);
            const next = blocks.find((x) => x.focusLike && ms(x.plannedStart) === b);
            const until = next ? b - 15 * MIN : b;
            if (exact && from > range[0]) continue;
            const to = from + reserved * MIN;
            if (to <= Math.min(until, range[1])) {
              slot = [from, to];
              break;
            }
          }
          if (!slot) break;
        }
        const block = {
          id: id(),
          sourceId: source.id,
          sourceType: type,
          title: source.title,
          date: d,
          assignedWorkMin: work,
          reservedMin: reserved,
          plannedStart: slot ? iso(slot[0]) : null,
          plannedEnd: slot ? iso(slot[1]) : null,
          focusLike: true,
          locked: exact,
          critical,
        };
        if (!register(block)) break;
        used += reserved;
        if (type === 'ROUTINE' || exact) break;
      }
    }
  }
  const timed = blocks
    .filter((b) => b.plannedStart)
    .sort((a, b) => ms(a.plannedStart) - ms(b.plannedStart));
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[i].locked && timed[j].locked && overlap(timed[i], timed[j]))
        warnings.push({
          sourceId: timed[j].sourceId,
          message: `${timed[i].title} / ${timed[j].title}: 보호된 일정이 겹쳐요. 직접 시간을 조정해 주세요.`,
        });
    }
  for (let i = 0; i < timed.length - 1; i++) {
    const a = timed[i],
      b = timed[i + 1],
      space = (ms(b.plannedStart) - ms(a.plannedEnd)) / MIN;
    if (a.focusLike && b.focusLike && space >= 15) {
      blocks.push({
        id: `prep-${b.id}`,
        sourceType: 'PREP',
        title: '작업 전환 시간',
        plannedStart: iso(ms(b.plannedStart) - 15 * MIN),
        plannedEnd: b.plannedStart,
        reservedMin: 15,
        assignedWorkMin: 0,
        nextId: b.id,
      });
    }
  }
  for (let i = 0; i < 7; i++) {
    const d = addDays(now, i),
      free = freeBlocks(Math.max(now, at(d, '00:00')), at(addDays(d, 1), '00:00'), blocks);
    if (i < 3) blocks.push(...free);
    else {
      const reserved = blocks
        .filter((b) => b.date === d && !b.plannedStart)
        .reduce((n, b) => n + b.reservedMin + 15, 0);
      const available = Math.max(0, free.reduce((n, b) => n + b.reservedMin, 0) - reserved);
      if (available > 0)
        blocks.push({
          id: `free-${d}`,
          sourceType: 'FREE',
          title: `자유시간 약 ${Math.floor(available)}분`,
          date: d,
          assignedWorkMin: 0,
          reservedMin: available,
          plannedStart: null,
          plannedEnd: null,
          locked: false,
          focusLike: false,
        });
    }
  }
  for (const [sourceId, min] of remaining)
    if (min > 0)
      warnings.push({
        sourceId,
        message: `${s.todos.find((t) => t.id === sourceId)?.title}: ${min}분을 아직 배치하지 못했어요. 마감·가용시간을 확인해 주세요.`,
      });
  for (const r of s.routines.filter((r) => r.status === 'ACTIVE')) {
    const rs = routineStatus(s, r, now);
    const allocated = [...(plannedRoutine.get(r.id) || [])].filter(
      (d) => d >= rs.start && d <= rs.end,
    ).length;
    if (rs.remaining > allocated)
      warnings.push({
        sourceId: r.id,
        message: `${r.title}: 현재 주기에 ${rs.remaining - allocated}회 미배정 · 수행 기회를 확인해 주세요.`,
        status: 'UNAVAILABLE',
      });
  }
  return {
    blocks: blocks.sort(
      (a, b) => ms(a.plannedStart || `${a.date}T23:59`) - ms(b.plannedStart || `${b.date}T23:59`),
    ),
    warnings,
  };
}
