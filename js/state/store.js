import { settleFocus } from '../domain/focus.js';
import { load, save } from './persistence.js';
import { appNow, iso, day } from '../utils/date.js';
import { applyAction } from '../domain/actions.js';
import { reconcile, replanFuture } from '../scheduler/replan.js';
import { materialize } from '../domain/occurrences.js';
export function createStore({ initialState = null } = {}) {
  let state = initialState ? structuredClone(initialState) : load();
  const persist = initialState ? () => {} : save;
  let planningDay = day(appNow(state));
  if (!initialState) state.ui.virtualNow = null;
  if (!initialState && state.execution?.focusLike && state.execution.timerStatus !== 'PAUSED') {
    state.execution.timerStatus = 'PAUSED';
    state.execution.suspicious = true;
  }
  const listeners = new Set();
  if (!initialState) {
    reconcile(state, appNow(state));
    replanFuture(state, appNow(state), { full: state.planningPolicy !== 2 });
    state.planningPolicy = 2;
  }
  const notify = () => listeners.forEach((fn) => fn(state));
  const commit = (next) => {
    persist(next);
    state = next;
    notify();
  };
  return {
    get: () => state,
    subscribe: (fn) => listeners.add(fn),
    dispatch: (action) => commit(applyAction(state, action, appNow(state))),
    ui: (patch) => {
      const next = structuredClone(state);
      Object.assign(next.ui, patch);
      if (patch.tab === 'week' || 'weekStart' in patch) {
        materialize(
          next,
          appNow(next),
          next.ui.weekStart ? `${next.ui.weekStart}T12:00:00` : appNow(next),
        );
      }
      commit(next);
    },
    clock: (t) => {
      const next = structuredClone(state);
      next.ui.virtualNow = t === null ? null : iso(t);
      reconcile(next, appNow(next));
      if (!next.livePlan.some((b) => b.plannedEnd && new Date(b.plannedEnd) > appNow(next)))
        replanFuture(next, appNow(next));
      commit(next);
    },
    resume: () => {
      const next = structuredClone(state);
      reconcile(next, appNow(next));
      replanFuture(next, appNow(next));
      commit(next);
    },
    tick: () => {
      settleFocus(state.execution, Date.now(), appNow(state));
      if (planningDay !== day(appNow(state))) {
        const next = structuredClone(state);
        reconcile(next, appNow(next));
        replanFuture(next, appNow(next));
        planningDay = day(appNow(next));
        commit(next);
      }
    },
    flush: () => persist(state),
  };
}
