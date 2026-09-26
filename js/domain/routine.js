import { day, addDays, at } from '../utils/date.js';
const ordinal = (d) =>
  Math.floor(
    Date.UTC(...d.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n)))) / 86400000,
  );
export function windowFor(r, date) {
  const delta = ordinal(day(date)) - ordinal(r.anchorDate);
  const start = addDays(r.anchorDate, Math.floor(delta / r.everyDays) * r.everyDays);
  return { start, end: addDays(start, r.everyDays - 1) };
}
export function opportunities(s, r, date) {
  const rs = routineStatus(s, r, date),
    days = [];
  for (let d = day(date); d <= rs.end; d = addDays(d, 1)) {
    const opportunity = routineStatus(s, r, d);
    if (opportunity.available && !opportunity.doneToday) days.push(d);
  }
  return days;
}
export function routineStatus(s, r, date) {
  const d = day(date),
    w = r.frequency === 'WEEKDAYS' ? { start: d, end: d } : windowFor(r, d);
  const completed = new Set(
    s.sessions
      .filter((x) => x.sourceId === r.id && x.satisfied && x.date >= w.start && x.date <= w.end)
      .map((x) => x.date),
  );
  const eligible =
    r.frequency !== 'WEEKDAYS' || r.weekdays.includes(new Date(`${d}T12:00`).getDay());
  const available = eligible && !r.unavailableDates?.includes(d) && d >= r.anchorDate;
  return {
    ...w,
    completed,
    remaining: Math.max(0, (r.frequency === 'WEEKDAYS' ? 1 : r.times) - completed.size),
    available,
    doneToday: completed.has(d),
    status: !available ? 'UNAVAILABLE' : completed.has(d) ? 'SATISFIED' : 'PENDING',
  };
}
