import { day, addDays, at, iso, ms, id, MIN } from '../utils/date.js';
export function nextFixedOccurrence(s, series, now) {
  const lookback = addDays(now, -Math.max(1, Math.ceil((series.durationMin || 1440) / 1440)));
  const start =
    series.recurrence === 'ONCE'
      ? series.startDate
      : series.startDate > lookback
        ? series.startDate
        : lookback;
  for (let i = 0; i < 370; i++) {
    const d = addDays(start, i);
    if (d < series.startDate) continue;
    if (series.until && d > series.until) break;
    if (series.recurrence === 'ONCE' && d !== series.startDate) continue;
    if (
      series.recurrence === 'WEEKLY' &&
      !series.weekdays.includes(new Date(`${d}T12:00`).getDay())
    )
      continue;
    const key = `${series.id}-${d}`;
    const existing = s.fixedOccurrences.find((o) => o.id === key);
    const o = existing || {
      id: key,
      seriesId: series.id,
      date: d,
      title: series.title,
      icon: series.icon,
      plannedStart: iso(at(d, series.startTime)),
      plannedEnd: iso(
        at(d, series.startTime) +
          (series.durationMin ||
            (at(series.endTime <= series.startTime ? addDays(d, 1) : d, series.endTime) -
              at(d, series.startTime)) /
              MIN) *
            MIN,
      ),
      status: 'PLANNED',
    };
    if (o.status === 'PLANNED' && ms(o.plannedEnd) > now) return o;
  }
  return null;
}

export function fixedManagementEntries(s, now) {
  const groups = new Map();
  for (const series of s.fixedSeries) {
    const occurrence = nextFixedOccurrence(s, series, now);
    if (!occurrence) continue;
    const key = series.familyId || series.id,
      old = groups.get(key);
    if (!old || ms(occurrence.plannedStart) < ms(old.occurrence.plannedStart))
      groups.set(key, { series, occurrence });
  }
  for (const occurrence of s.fixedOccurrences.filter(
    (o) =>
      o.status !== 'CANCELLED' &&
      ms(o.plannedEnd) > now &&
      !s.fixedSeries.some((series) => series.id === o.seriesId),
  )) {
    groups.set(occurrence.id, {
      occurrence,
      series: {
        title: occurrence.title,
        recurrence: 'ONCE',
        startTime: new Date(occurrence.plannedStart).toTimeString().slice(0, 5),
        endTime: new Date(occurrence.plannedEnd).toTimeString().slice(0, 5),
      },
    });
  }
  return [...groups.values()].sort(
    (a, b) => ms(a.occurrence.plannedStart) - ms(b.occurrence.plannedStart),
  );
}
export function materialize(s, now, rangeStart = now) {
  for (let i = -1; i < 7; i++) {
    const d = addDays(rangeStart, i);
    if (!s.sleepOccurrences.some((o) => o.date === d)) {
      const template = s.settings.sleepTemplate;
      const start = at(d, template.start),
        end = at(template.end <= template.start ? addDays(d, 1) : d, template.end);
      s.sleepOccurrences.push({
        id: `sleep-${d}`,
        date: d,
        title: '수면',
        plannedStart: iso(start),
        plannedEnd: iso(end),
        actualStart: null,
        actualEnd: null,
        status: 'PLANNED',
      });
    }
    for (const series of s.fixedSeries) {
      if (
        d < series.startDate ||
        (series.until && d > series.until) ||
        (series.recurrence === 'ONCE' && d !== series.startDate) ||
        (series.recurrence === 'WEEKLY' &&
          !series.weekdays.includes(new Date(`${d}T12:00`).getDay()))
      )
        continue;
      const key = `${series.id}-${d}`;
      if (!s.fixedOccurrences.some((o) => o.id === key))
        s.fixedOccurrences.push({
          id: key,
          seriesId: series.id,
          date: d,
          title: series.title,
          icon: series.icon || '',
          plannedStart: iso(at(d, series.startTime)),
          plannedEnd: iso(
            series.durationMin
              ? at(d, series.startTime) + series.durationMin * MIN
              : at(series.endTime <= series.startTime ? addDays(d, 1) : d, series.endTime),
          ),
          status: 'PLANNED',
        });
    }
  }
}
export function editFixed(s, occurrence, values, scope) {
  if (scope === 'ONE') {
    Object.assign(occurrence, values);
    return;
  }
  const series = s.fixedSeries.find((x) => x.id === occurrence.seriesId);
  series.until = addDays(occurrence.date, -1);
  for (const o of s.fixedOccurrences)
    if (o.seriesId === series.id && o.date >= occurrence.date && o.status === 'PLANNED')
      o.status = 'CANCELLED';
  if (values.status !== 'CANCELLED')
    s.fixedSeries.push({
      ...series,
      id: id(),
      familyId: series.familyId || series.id,
      until: null,
      startDate: occurrence.date,
      title: values.title,
      icon: values.icon ?? series.icon ?? '',
      startTime: new Date(values.plannedStart).toTimeString().slice(0, 5),
      endTime: new Date(values.plannedEnd).toTimeString().slice(0, 5),
      durationMin: (ms(values.plannedEnd) - ms(values.plannedStart)) / MIN,
    });
}
