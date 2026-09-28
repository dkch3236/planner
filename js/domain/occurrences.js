import { day, addDays, at, iso, ms, id, MIN } from '../utils/date.js';
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
      until: null,
      startDate: occurrence.date,
      title: values.title,
      icon: values.icon ?? series.icon ?? '',
      startTime: new Date(values.plannedStart).toTimeString().slice(0, 5),
      endTime: new Date(values.plannedEnd).toTimeString().slice(0, 5),
      durationMin: (ms(values.plannedEnd) - ms(values.plannedStart)) / MIN,
    });
}
