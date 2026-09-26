import { ms, MIN } from '../utils/date.js';
export function resolveCurrentView(s, now) {
  if (s.execution)
    return {
      kind: 'EXECUTING',
      execution: s.execution,
      conflict: s.livePlan.find(
        (b) =>
          b.sourceType === 'FIXED' &&
          b.sourceId !== s.execution.sourceId &&
          ms(b.plannedStart) <= now &&
          ms(b.plannedEnd) > now,
      ),
    };
  const current = s.livePlan.find(
    (b) =>
      b.plannedStart &&
      ms(b.plannedStart) <= now &&
      ms(b.plannedEnd) > now &&
      !['FREE', 'SLEEP', 'PREP'].includes(b.sourceType) &&
      !s.resolvedPlanIds.includes(b.id),
  );
  if (current) return { kind: 'PLANNED_CURRENT', block: current };
  const next = s.livePlan.find(
    (b) =>
      b.plannedStart &&
      ms(b.plannedStart) > now &&
      ms(b.plannedStart) - now <= 15 * MIN &&
      !['FREE', 'SLEEP', 'PREP'].includes(b.sourceType),
  );
  if (next) return { kind: 'PREP', block: next };
  const sleep = s.sleepOccurrences.find(
    (o) => o.status === 'PLANNED' && ms(o.plannedStart) <= now && ms(o.plannedEnd) > now,
  );
  if (sleep) return { kind: 'SLEEP_PROMPT', sleep };
  return {
    kind: 'FREE',
    saved:
      s.pendingSaved && ms(s.pendingSaved.until) > now
        ? Math.min(s.pendingSaved.minutes, (ms(s.pendingSaved.until) - now) / MIN)
        : 0,
  };
}
