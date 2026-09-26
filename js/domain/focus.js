import { MIN } from '../utils/date.js';

// Focus uses real time, independently of the editable planning clock.
export function settleFocus(e, realNow = Date.now()) {
  if (!e?.focusLike || e.timerStatus !== 'RUNNING') return;
  const delta = Math.max(0, realNow - (e.focusCheckpoint ?? realNow));
  if (delta > 60000) {
    e.timerStatus = 'PAUSED';
    e.suspicious = true;
  } else e.measuredFocusMin += delta / MIN;
  e.focusCheckpoint = realNow;
}
export function toggleFocus(e, realNow = Date.now()) {
  if (!e?.focusLike) throw Error('집중 타이머는 할 일과 루틴에서만 사용합니다.');
  const wasRunning = e.timerStatus === 'RUNNING';
  settleFocus(e, realNow);
  e.timerStatus = wasRunning ? 'PAUSED' : 'RUNNING';
  e.focusCheckpoint = realNow;
}
