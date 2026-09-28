import { id, MIN, iso, ms, day, time, at, addDays, overlap } from '../utils/date.js';
import { startExecution, finishExecution, executionFor, recordExecution } from './execution.js';
import { reconcile, replanFuture, manualReschedule, candidates } from '../scheduler/replan.js';
import { updateParents, children } from './todo.js';
import { editFixed } from './occurrences.js';
import { settleFocus, toggleFocus } from './focus.js';
import { remainingFreeSlots, previewReward } from '../scheduler/replan.js';
const positive = (v, label) => {
  if (!Number.isFinite(Number(v)) || Number(v) <= 0)
    throw Error(`${label}을 0보다 크게 입력해 주세요.`);
  return Number(v);
};
function validateSource(v, type) {
  if (!v.title?.trim()) throw Error('이름을 입력해 주세요.');
  if (type === 'TODO') {
    positive(v.remainingWorkMin, '예상시간');
    if (!Number.isFinite(ms(v.deadline))) throw Error('마감을 입력해 주세요.');
    if (v.timeConstraint === 'FIXED' && !(ms(v.fixedEnd) > ms(v.fixedStart)))
      throw Error('고정 시작·종료를 확인해 주세요.');
    if (v.timeConstraint === 'FIXED' && ms(v.fixedEnd) > ms(v.deadline))
      throw Error('고정 종료 시각은 마감 이내여야 해요.');
  } else {
    positive(v.duration, '예상시간');
    positive(v.minimum, '최소시간');
    if (v.minimum > v.duration) throw Error('최소시간은 예상시간 이하여야 해요.');
    if (v.frequency === 'WINDOW') {
      positive(v.everyDays, '주기');
      positive(v.times, '횟수');
      if (!Number.isInteger(v.everyDays) || !Number.isInteger(v.times))
        throw Error('주기와 횟수는 정수로 입력해 주세요.');
      if (v.times > v.everyDays) throw Error('횟수는 주기 일수 이하여야 해요.');
    } else if (!v.weekdays.length) throw Error('요일을 하나 이상 선택해 주세요.');
  }
  if ((v.timeConstraint || v.constraint) === 'WINDOW' && !(v.windowEnd > v.windowStart))
    throw Error('시간 범위의 끝은 시작보다 뒤여야 해요.');
}
export function applyAction(state, action, now, realNow = Date.now()) {
  const s = structuredClone(state),
    p = action.payload || {};
  settleFocus(s.execution, realNow, now);
  reconcile(s, now);
  switch (action.type) {
    case 'SAVE_TODO': {
      validateSource(p, 'TODO');
      const old = s.todos.find((t) => t.id === p.id);
      if (old)
        Object.assign(old, p, { initialWorkMin: Math.max(old.initialWorkMin, p.remainingWorkMin) });
      else {
        if (p.parentId && s.execution?.sourceId === p.parentId)
          throw Error('상위 작업을 마친 뒤 하위 할 일을 추가해 주세요.');
        s.todos.push({
          ...p,
          id: id(),
          parentId: p.parentId || null,
          initialWorkMin: p.remainingWorkMin,
          status: 'ACTIVE',
        });
      }
      updateParents(s);
      break;
    }
    case 'SAVE_ROUTINE': {
      validateSource(p, 'ROUTINE');
      const old = s.routines.find((r) => r.id === p.id);
      if (old) Object.assign(old, p);
      else s.routines.push({ ...p, id: id(), status: 'ACTIVE', unavailableDates: [] });
      break;
    }
    case 'SAVE_FIXED': {
      if (!p.title?.trim() || !(ms(p.end) > ms(p.start)))
        throw Error('제목과 시작·종료 시각을 확인해 주세요.');
      if (p.recurrence === 'WEEKLY' && !p.weekdays.length)
        throw Error('반복 요일을 선택해 주세요.');
      s.fixedSeries.push({
        id: id(),
        title: p.title,
        icon: p.icon || '',
        startDate: day(p.start),
        startTime: time(p.start),
        endTime: time(p.end),
        durationMin: (ms(p.end) - ms(p.start)) / MIN,
        recurrence: p.recurrence,
        weekdays: p.weekdays,
      });
      break;
    }
    case 'EDIT_FIXED': {
      const o = s.fixedOccurrences.find((o) => o.id === p.id);
      if (!(ms(p.plannedEnd) > ms(p.plannedStart))) throw Error('일정 종료 시각을 확인해 주세요.');
      editFixed(s, o, p, p.scope);
      break;
    }
    case 'DELETE_FIXED': {
      const o = s.fixedOccurrences.find((o) => o.id === p.id);
      if (s.execution?.sourceId === o.id) throw Error('진행 중인 일정을 먼저 마쳐 주세요.');
      editFixed(s, o, { status: 'CANCELLED' }, p.scope);
      s.livePlan = s.livePlan.filter(
        (b) => !s.fixedOccurrences.some((o) => o.id === b.sourceId && o.status === 'CANCELLED'),
      );
      break;
    }
    case 'CANCEL_TODO': {
      const ids = new Set([p.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const t of s.todos)
          if (ids.has(t.parentId) && !ids.has(t.id)) {
            ids.add(t.id);
            changed = true;
          }
      }
      if (ids.has(s.execution?.sourceId)) throw Error('진행 중인 작업을 먼저 마쳐 주세요.');
      s.todos.filter((t) => ids.has(t.id)).forEach((t) => (t.status = 'CANCELLED'));
      updateParents(s);
      break;
    }
    case 'UNAVAILABLE': {
      const collection = p.sourceType === 'TODO' ? s.todos : s.routines;
      if (!collection.some(x=>x.id===p.id)) throw Error('할 일 또는 루틴을 찾을 수 없습니다.');
      const ids = new Set([p.id]);
      if (p.sourceType === 'TODO') {
        let added = true;
        while(added) {
          added = false;
          for(const t of collection) if(ids.has(t.parentId)&&!ids.has(t.id)){ids.add(t.id);added=true;}
        }
      }
      if (!p.restore && ids.has(s.execution?.sourceId)) {
        if (!p.finish) throw Error('진행 중인 활동의 종료 내용을 먼저 확인해 주세요.');
        finishExecution(s,{...p.finish,outcome:'INCOMPLETE'},now);
      }
      for(const source of collection.filter(x=>ids.has(x.id))) {
        source.unavailableDates = (source.unavailableDates || []).filter(d=>d!==day(now));
        if(!p.restore) source.unavailableDates.push(day(now));
      }
      s.livePlan = s.livePlan.filter(
        (b) => !ids.has(b.sourceId) || day(b.plannedStart || `${b.date}T12:00`) !== day(now),
      );
      break;
    }
    case 'START': {
      const b = s.livePlan.find((b) => b.id === p.id);
      if (!b || !b.plannedStart || ms(b.plannedEnd) <= now)
        throw Error('계획이 바뀌었어요. 다시 선택해 주세요.');
      if (ms(b.plannedStart) > now) {
        const source = (b.sourceType === 'TODO' ? s.todos : s.routines).find(
          (x) => x.id === b.sourceId,
        );
        if (!source || b.locked || ms(b.plannedStart) - now > 15 * MIN)
          throw Error('현재 시작할 수 있는 시간이 아니에요.');
        const candidate = manualReschedule(s, b, 'PULL_FROM_FREE', now);
        startExecution(s, candidate, now, realNow);
      } else startExecution(s, b, now, realNow);
      break;
    }
    case 'TOGGLE_FOCUS':
      toggleFocus(s.execution, realNow, now);
      return s;
    case 'FINISH':
      finishExecution(s, p, now);
      break;
    case 'MANUAL': {
      const b = manualReschedule(s, p, p.mode, now);
      startExecution(s, b, now, realNow);
      break;
    }
    case 'SWITCH': {
      finishExecution(
        s,
        { ...p.finish, outcome: s.execution?.focusLike ? 'INCOMPLETE' : 'DONE' },
        now,
      );
      const b = p.targetId
        ? s.livePlan.find(
            (b) =>
              b.id === p.targetId &&
              b.sourceType === 'FIXED' &&
              ms(b.plannedStart) <= now &&
              ms(b.plannedEnd) > now,
          )
        : manualReschedule(s, p, 'SWITCH_EXECUTION', now);
      if (!b) throw Error('전환할 일정이 바뀌었습니다. 다시 선택해 주세요.');
      startExecution(s, b, now, realNow);
      break;
    }
    case 'SLEEP': {
      if (s.execution && !s.execution.focusLike) finishExecution(s, { outcome: 'DONE' }, now);
      if (s.execution) throw Error('진행 중인 활동을 먼저 마쳐 주세요.');
      let o =
        s.sleepOccurrences.find(
          (o) => o.status === 'PLANNED' && ms(o.plannedStart) <= now && ms(o.plannedEnd) > now,
        ) || s.sleepOccurrences.find((o) => o.date === day(now) && o.status === 'PLANNED');
      if (!o) {
        o = {
          id: id(),
          date: day(now),
          title: '추가 수면',
          plannedStart: iso(now),
          plannedEnd: iso(now + 8 * 60 * MIN),
          status: 'PLANNED',
        };
        s.sleepOccurrences.push(o);
      }
      startExecution(s, { ...o, sourceType: 'SLEEP', sourceId: o.id }, now);
      break;
    }
    case 'REST':
    case 'ACTIVITY': {
      const minutes = positive(p.minutes || 30, '활동시간');
      startExecution(
        s,
        {
          id: id(),
          title: p.title || '그냥 쉬기',
          sourceType: action.type === 'REST' ? 'REST' : 'FREE_ACTIVITY',
          plannedEnd: iso(now + minutes * MIN),
        },
        now,
      );
      break;
    }
    case 'REWARD': {
      if (
        !p.start &&
        p.previewSignature &&
        previewReward(s, p, now).signature !== p.previewSignature
      )
        throw Error(
          '계획 또는 시간이 바뀌었습니다. 보상활동을 다시 선택해 변경 내용을 확인해 주세요.',
        );
      positive(p.minutes, '활동시간');
      if (p.start) {
        const target = {
          id: id(),
          title: p.title,
          sourceType: 'REWARD',
          sourceId: id(),
          assignedWorkMin: 0,
          reservedMin: p.minutes,
          plannedStart: p.start,
          plannedEnd: iso(ms(p.start) + p.minutes * MIN),
          locked: true,
        };
        if (
          !remainingFreeSlots(s, now).some(
            (b) =>
              b.sourceType === 'FREE' &&
              ms(b.plannedStart) <= ms(target.plannedStart) &&
              ms(b.plannedEnd) >= ms(target.plannedEnd),
          )
        )
          throw Error('선택한 자유시간이 바뀌었어요. 다시 확인해 주세요.');
        s.personalPlans.push(target);
      } else {
        const b = manualReschedule(s, p, 'PULL_FREE_FOR_REWARD', now);
        startExecution(s, b, now, realNow);
      }
      break;
    }
    case 'CONFIRM': {
      const b = s.unconfirmed.find((b) => b.id === p.id);
      if (!b) break;
      if (p.outcome === 'MISSED') {
        s.resolvedPlanIds.push(b.id);
        s.unconfirmed = s.unconfirmed.filter((x) => x.id !== b.id);
        if (b.sourceType === 'FIXED')
          s.fixedOccurrences.find((o) => o.id === b.sourceId).status = 'MISSED';
        const personal = s.personalPlans.find((x) => x.id === b.id);
        if (personal) personal.closed = true;
      } else {
        if (p.outcome === 'ONGOING') {
          if (ms(p.actualStart || b.plannedStart) > now)
            throw Error('실제 시작은 현재 이전이어야 합니다.');
          startExecution(s, b, ms(p.actualStart || b.plannedStart), realNow);
          s.execution.expectedEnd = iso(Math.max(now + 15 * MIN, ms(b.plannedEnd)));
          s.unconfirmed = s.unconfirmed.filter((x) => x.id !== b.id);
        } else {
          if (s.execution && ms(p.actualEnd || b.plannedEnd) > ms(s.execution.startedAt))
            throw Error('현재 실행 중인 활동과 기록 구간이 겹칩니다. 종료 시각을 확인해 주세요.');
          recordExecution(s, executionFor(b, ms(p.actualStart || b.plannedStart), realNow), p, now);
        }
      }
      break;
    }
    case 'TIMELINE': {
      const start = ms(p.start),
        end = ms(p.end);
      if (!(end > start) || end > now) throw Error('현재 이전의 시작·종료 구간을 입력해 주세요.');
      if (s.execution && end > ms(s.execution.startedAt))
        throw Error('실행 중인 활동과 기록 구간이 겹칩니다. 활동을 끝내고 기록해 주세요.');
      if (s.timeline.some((t) => t.id !== p.id && start < ms(t.end) && ms(t.start) < end))
        throw Error('다른 생활 기록과 시간이 겹쳐요.');
      if (p.sourceType === 'UNRECORDED') {
        s.timeline = s.timeline.filter((t) => t.id !== p.id);
        break;
      }
      const old = s.timeline.find((t) => t.id === p.id);
      if (old) Object.assign(old, p);
      else s.timeline.push({ ...p, id: id() });
      break;
    }
    case 'LOCK': {
      const b = s.livePlan.find((b) => b.id === p.id);
      if (!b?.plannedStart) throw Error('시간이 배정된 블록만 잠글 수 있어요.');
      b.locked = !b.locked;
      break;
    }
    case 'SETTINGS': {
      positive(p.maxFocus, '집중시간');
      if (![0.55, 0.65, 0.75].includes(p.density)) throw Error('계획 밀도를 선택해 주세요.');
      s.settings = { ...s.settings, ...p };
      s.sleepOccurrences = s.sleepOccurrences.filter(
        (o) => o.status !== 'PLANNED' || ms(o.plannedStart) <= now,
      );
      break;
    }
    case 'REPLAN':
      break;
    default:
      throw Error(`연결되지 않은 동작: ${action.type}`);
  }
  replanFuture(s, now, { full: ['SETTINGS', 'REPLAN'].includes(action.type) });
  return s;
}
