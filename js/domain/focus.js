import { MIN } from '../utils/date.js';

// Focus uses real time, independently of the editable planning clock.
export function settleFocus(e, realNow = Date.now(), timelineNow = realNow) {
  if (!e?.focusLike || e.timerStatus !== 'RUNNING') return;
  const delta = Math.max(0, realNow - (e.focusCheckpoint ?? realNow));
  if (delta > 60000) {
    e.timerStatus = 'PAUSED';
    e.suspicious = true;
  } else {
    e.measuredFocusMin += delta / MIN;
    // Keep actual confirmed running intervals; never infer past pauses from a total.
    if (delta > 0) {
      e.focusIntervals ||= [];
      const start = timelineNow - delta;
      const previous = e.focusIntervals.at(-1);
      if (previous && Math.abs(previous.end - start) <= 5) previous.end = timelineNow;
      else e.focusIntervals.push({ start, end: timelineNow });
    }
  }
  e.focusCheckpoint = realNow;
}
export function toggleFocus(e, realNow = Date.now(), timelineNow = realNow) {
  if (!e?.focusLike) throw Error('집중 타이머는 할 일과 루틴에서만 사용합니다.');
  const wasRunning = e.timerStatus === 'RUNNING';
  settleFocus(e, realNow, timelineNow);
  e.timerStatus = wasRunning ? 'PAUSED' : 'RUNNING';
  if (!wasRunning) e.suspicious = false;
  e.focusCheckpoint = realNow;
}
