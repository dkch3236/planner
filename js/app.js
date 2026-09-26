import { createStore } from './state/store.js';
import { render } from './ui/render.js';
import { createModals } from './ui/modals.js';
import { parseForm } from './ui/forms.js';
import { appNow, MIN, ms, stopwatch } from './utils/date.js';
import { resolveCurrentView } from './scheduler/currentView.js';
import { candidates } from './scheduler/replan.js';
let toastTimer;
function toast(message) {
  const node = document.querySelector('#toast');
  node.textContent = message;
  node.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.style.display = 'none'), 4500);
}
try {
  const store = createStore(),
    modals = createModals(store, toast);
  store.subscribe((s) => {
    render(s);
    modals.refresh();
  });
  render(store.get());
  document.addEventListener('click', (event) => {
    const b = event.target.closest('[data-action]');
    if (!b) return;
    try {
      const d = b.dataset,
        s = store.get(),
        now = appNow(s);
      if (modals.handle(d.action, d)) return;
      switch (d.action) {
        case 'nav':
          store.ui({ tab: d.tab });
          break;
        case 'manage-tab':
          store.ui({ manage: d.tab });
          break;
        case 'manage-routines':
          store.ui({ tab: 'manage', manage: 'routines' });
          break;
        case 'todo-filter':
          store.ui({ completed: d.completed === 'true' });
          break;
        case 'toggle-focus':
          store.dispatch({ type: 'TOGGLE_FOCUS' });
          break;
        case 'history-date':
          store.ui({ historyDate: document.querySelector('#history-date').value });
          break;
        case 'start':
          store.dispatch({ type: 'START', payload: { id: d.id } });
          break;
        case 'sleep':
          store.dispatch({ type: 'SLEEP' });
          break;
        case 'rest':
          store.dispatch({ type: 'REST' });
          break;
        case 'routine-start': {
          const candidate = candidates(s, now).find((x) => x.sourceId === d.id);
          if (candidate)
            store.dispatch({ type: 'MANUAL', payload: { sourceId: d.id, mode: 'PULL_FROM_FREE' } });
          else {
            const block = s.livePlan.find(
              (x) => x.sourceId === d.id && ms(x.plannedStart) <= now && ms(x.plannedEnd) > now,
            );
            if (block) store.dispatch({ type: 'START', payload: { id: block.id } });
            else throw Error('지금은 시작 가능한 시간이 아니에요. 주간 계획을 확인해 주세요.');
          }
          break;
        }
        case 'clock-apply':
          store.clock(ms(document.querySelector('#virtual-clock').value));
          break;
        case 'clock-shift':
          store.clock(now + Number(d.minutes) * MIN);
          break;
        case 'clock-reset':
          store.clock(null);
          store.resume();
          break;
        case 'clock-end': {
          const view = resolveCurrentView(s, now);
          const end =
            s.execution?.expectedEnd ||
            view.block?.plannedEnd ||
            s.livePlan.find((x) => x.focusLike && x.plannedEnd)?.plannedEnd;
          if (!end) throw Error('현재 또는 다음 작업 블록이 없어요.');
          store.clock(ms(end) + Number(d.minutes) * MIN);
          break;
        }
        case 'replan':
          store.dispatch({ type: 'REPLAN' });
          toast('미래 계획을 다시 제안했어요.');
          break;
        case 'export': {
          const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }),
            url = URL.createObjectURL(blob),
            a = document.createElement('a');
          a.href = url;
          a.download = 'flowweek-backup.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          break;
        }
        default:
          throw Error('지원하지 않는 동작입니다.');
      }
    } catch (error) {
      toast(error.message);
      modals.error(error.message);
    }
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id !== 'settings-form') return;
    event.preventDefault();
    try {
      const data = parseForm(event.target);
      store.dispatch({
        type: 'SETTINGS',
        payload: {
          density: data.density,
          maxFocus: data.maxFocus,
          sleepTemplate: { start: data.sleepStart, end: data.sleepEnd },
        },
      });
      toast('설정에 맞게 미래 계획을 정리했어요.');
    } catch (error) {
      toast(error.message);
    }
  });
  let ticks = 0;
  setInterval(() => {
    store.tick();
    const s = store.get();
    const timer = document.querySelector('[data-focus-time]');
    if (timer && s.execution) timer.textContent = stopwatch(s.execution.measuredFocusMin);
    if (++ticks % 5 === 0) {
      if (
        !document.querySelector('#modal').open &&
        !document.querySelector('input:focus,select:focus')
      )
        render(s);
      try {
        store.flush();
      } catch (error) {
        toast(error.message);
      }
    }
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    try {
      if (document.visibilityState === 'visible') store.resume();
      else store.flush();
    } catch (error) {
      toast(error.message);
    }
  });
  window.addEventListener('pagehide', () => store.flush());
} catch (error) {
  document.querySelector('#app').textContent = `FlowWeek를 열지 못했어요: ${error.message}`;
}
