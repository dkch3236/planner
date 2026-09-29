import { todayPreview } from './today-preview.js';
import { day, addDays, at, iso } from '../utils/date.js';
export function managePreview(now = Date.now(), tab = 'todos') {
  const s = todayPreview(now),
    d = day(now);
  s.execution = null;
  s.ui.tab = 'manage';
  s.ui.manage = tab;
  const base = s.todos[0];
  s.todos = [
    {
      ...base,
      id: 'report',
      title: '보고서 작성하기',
      importance: 'MUST',
      remainingWorkMin: 270,
      initialWorkMin: 270,
      deadline: iso(at(addDays(d, 2), '18:00')),
    },
    {
      ...base,
      id: 'research',
      parentId: 'report',
      title: '자료 조사하기',
      importance: 'MUST',
      remainingWorkMin: 150,
      initialWorkMin: 150,
    },
    {
      ...base,
      id: 'outline',
      parentId: 'report',
      title: '양식 만들기',
      importance: 'MUST',
      remainingWorkMin: 120,
      initialWorkMin: 120,
      deadline: iso(at(addDays(d, 1), '18:00')),
    },
    ...['SHOULD', 'OPTIONAL', 'SHOULD', 'OPTIONAL'].map((importance, i) => ({
      ...base,
      id: `meal-${i}`,
      title: '오므라이스 만들기',
      icon: 'icons/64/icon_meal_01.webp',
      importance,
      remainingWorkMin: 30,
      initialWorkMin: 30,
      deadline: null,
    })),
    {
      ...base,
      id: 'finished',
      title: '지난 보고서 정리',
      remainingWorkMin: 0,
      status: 'COMPLETED',
    },
  ];
  s.routines = [
    {
      ...s.routines[0],
      id: 'english',
      title: '영어회화',
      icon: 'icons/64/icon_laptop_01.webp',
      frequency: 'WEEKLY_COUNT',
      times: 3,
      anchorDate: addDays(d, -7),
      availableWeekdays: [1, 2, 3, 4, 5],
    },
    {
      ...s.routines[0],
      id: 'art',
      title: '미술 학원',
      frequency: 'WINDOW',
      everyDays: 5,
      times: 2,
      anchorDate: addDays(d,-1),
      availableWeekdays: [1, 4, 5],
      constraint: 'FIXED',
      fixedTime: '22:30',
      icon: 'icons/64/icon_notebook_01.webp',
    },
  ];
  // Distinct completion dates drive the same growth calculation as real data.
  s.sessions = [
    { sourceId: 'english', satisfied: true, date: d },
    { sourceId: 'english', satisfied: true, date: addDays(d, -1) },
    { sourceId: 'art', satisfied: true, date: d },
    { sourceId: 'art', satisfied: true, date: addDays(d,-1) },
  ];
  return s;
}
