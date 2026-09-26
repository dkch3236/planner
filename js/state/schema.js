import { id, day, addDays, at, iso } from '../utils/date.js';
export const SCHEMA_VERSION = 2;
export function createState(now = Date.now(), demo = true) {
  const d = day(now);
  return {
    schemaVersion: SCHEMA_VERSION,
    todos: demo
      ? [
          {
            id: id(),
            title: 'FlowWeek 첫 번째 주 준비하기',
            parentId: null,
            remainingWorkMin: 90,
            initialWorkMin: 90,
            deadline: iso(at(addDays(d, 2), '18:00')),
            importance: 'SHOULD',
            desire: 4,
            timeConstraint: 'FLEXIBLE',
            status: 'ACTIVE',
          },
          {
            id: id(),
            title: '읽고 싶었던 책 한 챕터',
            parentId: null,
            remainingWorkMin: 25,
            initialWorkMin: 25,
            deadline: iso(at(addDays(d, 4), '20:00')),
            importance: 'OPTIONAL',
            desire: 5,
            timeConstraint: 'FLEXIBLE',
            status: 'ACTIVE',
          },
        ]
      : [],
    routines: demo
      ? [
          {
            id: id(),
            title: '가볍게 몸 움직이기',
            basis: 'TIME',
            duration: 25,
            minimum: 5,
            constraint: 'ANYTIME',
            frequency: 'WINDOW',
            everyDays: 7,
            times: 3,
            anchorDate: d,
            weekdays: [1, 3, 5],
            status: 'ACTIVE',
            unavailableDates: [],
          },
        ]
      : [],
    fixedSeries: [],
    fixedOccurrences: [],
    sleepOccurrences: [],
    execution: null,
    sessions: [],
    timeline: [],
    livePlan: [],
    unconfirmed: [],
    resolvedPlanIds: [],
    personalPlans: [],
    freeCreditToday: { date: d, minutes: 0 },
    pendingSaved: null,
    settings: { density: 0.65, maxFocus: 45, sleepTemplate: { start: '23:00', end: '07:00' } },
    ui: { tab: 'today', manage: 'todos', completed: false, virtualNow: null },
    diagnostics: [],
  };
}
