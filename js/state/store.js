import { settleFocus } from '../domain/focus.js';
import { load, save } from './persistence.js';
import { appNow, iso } from '../utils/date.js';
import { applyAction } from '../domain/actions.js';
import { reconcile, replanFuture } from '../scheduler/replan.js';
export function createStore() {
  let state = load();
  if (state.execution?.focusLike && state.execution.timerStatus !== 'PAUSED') {
    state.execution.timerStatus = 'PAUSED';
    state.execution.suspicious = true;
  }
  const listeners = new Set();
  reconcile(state, appNow(state));
  replanFuture(state, appNow(state));
  const notify = () => listeners.forEach((fn) => fn(state));
  const commit = (next) => {
    save(next);
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
      if (patch.tab === 'week') {
        reconcile(next, appNow(next));
        replanFuture(next, appNow(next));
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
    tick: () => settleFocus(state.execution),
    flush: () => save(state),
  };
}
