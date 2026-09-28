export const MIN = 60000;
export const id = () => globalThis.crypto.randomUUID();
export const iso = (t) => new Date(t).toISOString();
export const ms = (t) => new Date(t).getTime();
export function day(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(t, n) {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return day(d);
}
export const at = (d, time) => ms(`${d}T${time}:00`);
export const time = (t) =>
  new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
export const duration = (value) => {
  const n = Math.max(0, Math.round(value));
  return n >= 60 ? `${Math.floor(n / 60)}시간${n % 60 ? ` ${n % 60}분` : ''}` : `${n}분`;
};
export const localInput = (t) => `${day(t)}T${time(t)}`;
export const overlap = (a, b) =>
  ms(a.plannedStart) < ms(b.plannedEnd) && ms(b.plannedStart) < ms(a.plannedEnd);
export const appNow = (s) =>
  s.ui.previewClock
    ? s.ui.previewClock.start + Date.now() - s.ui.previewClock.realStart
    : s.ui.virtualNow
      ? ms(s.ui.virtualNow)
      : Date.now();

export const preciseLocalInput = (t) =>
  localInput(t) + ':' + String(new Date(t).getSeconds()).padStart(2, '0');
export const stopwatch = (minutes) => {
  const seconds = Math.max(0, Math.floor(minutes * 60));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((x) => String(x).padStart(2, '0'))
    .join(':');
};

export const exactLocalInput = (t) =>
  preciseLocalInput(t) + '.' + String(new Date(t).getMilliseconds()).padStart(3, '0');
