import { at, addDays, iso, ms, MIN, overlap } from '../utils/date.js';
export const roomy = (work) => (work <= 10 ? 25 : work <= 20 ? 35 : work <= 30 ? 50 : work + 15);
export function gaps(start, end, blocks) {
  let cursor = start;
  const result = [];
  for (const b of blocks
    .filter((b) => b.plannedStart && ms(b.plannedEnd) > start && ms(b.plannedStart) < end)
    .sort((a, b) => ms(a.plannedStart) - ms(b.plannedStart))) {
    if (ms(b.plannedStart) > cursor) result.push([cursor, Math.min(end, ms(b.plannedStart))]);
    cursor = Math.max(cursor, ms(b.plannedEnd));
  }
  if (cursor < end) result.push([cursor, end]);
  return result;
}
export function legalRange(source, type, date) {
  if (type === 'TODO') {
    if (source.timeConstraint === 'FIXED')
      return [ms(source.fixedStart), Math.min(ms(source.fixedEnd), ms(source.deadline))];
    if (source.timeConstraint === 'WINDOW')
      return [
        at(date, source.windowStart),
        Math.min(at(date, source.windowEnd), ms(source.deadline)),
      ];
    return [
      at(date, '00:00'),
      source.deadline
        ? Math.min(at(addDays(date, 1), '00:00'), ms(source.deadline))
        : at(addDays(date, 1), '00:00'),
    ];
  }
  if (source.constraint === 'FIXED')
    return [at(date, source.fixedTime), at(date, source.fixedTime) + roomy(source.duration) * MIN];
  if (source.constraint === 'WINDOW')
    return [at(date, source.windowStart), at(date, source.windowEnd)];
  return [at(date, '00:00'), at(addDays(date, 1), '00:00')];
}
export function freeBlocks(now, end, blocks) {
  return gaps(now, end, blocks).map(([a, b]) => ({
    id: `free-${a}`,
    sourceType: 'FREE',
    title: '자유시간',
    assignedWorkMin: 0,
    reservedMin: (b - a) / MIN,
    plannedStart: iso(a),
    plannedEnd: iso(b),
    focusLike: false,
    locked: false,
  }));
}
export const hard = (b) =>
  b.locked || ['FIXED', 'SLEEP', 'REWARD'].includes(b.sourceType) || b.critical;
