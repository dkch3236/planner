import { esc, button } from './views.js';
import { activityIcon } from './today.js';
import { validIcon } from './icons.js';
import { progress } from '../domain/todo.js';
import { routineStatus } from '../domain/routine.js';
import { fixedManagementEntries } from '../domain/occurrences.js';
import { day, duration } from '../utils/date.js';

const image = (path, cls) =>
  `<img class="${cls}" src="/public/assets/${path}" alt="" draggable="false">`;
const sourceImage = (s, type) =>
  image(validIcon(s.icon) ? s.icon : activityIcon(s.title, type), 'manage-item-icon');
const days = (list) => (list || []).map((d) => '일월화수목금토'[d]).join('·');
export function growthStage(done, target) {
  return done <= 0 ? 1 : done >= target ? 4 : done / target < 0.5 ? 2 : 3;
}
export function routineSummary(r) {
  const repeat =
    r.frequency === 'DAILY'
      ? '매일 1회'
      : r.frequency === 'WEEKLY_COUNT'
        ? `매주 ${r.times}회`
        : r.frequency === 'WINDOW'
          ? `${r.everyDays}일에 ${r.times}회`
          : '매주';
  const available =
    r.frequency === 'WEEKDAYS'
      ? days(r.weekdays)
      : r.frequency === 'DAILY'
        ? ''
        : days(r.availableWeekdays);
  const when =
    r.constraint === 'FIXED'
      ? r.fixedTime
      : r.constraint === 'WINDOW'
        ? `${r.windowStart} - ${r.windowEnd}`
        : '';
  return [repeat, available, when].filter(Boolean).join(' / ');
}
export function todoTree(s) {
  const wanted = s.ui.completed ? 'COMPLETED' : 'ACTIVE';
  const available = s.todos.filter((t) => t.status !== 'CANCELLED');
  const children = (id) => available.filter((t) => t.parentId === id);
  const visible = (t, seen = new Set()) => {
    if (seen.has(t.id)) return false;
    const next = new Set([...seen, t.id]);
    return t.status === wanted || children(t.id).some((c) => visible(c, next));
  };
  const row = (t, depth = 0, seen = new Set()) => {
    if (seen.has(t.id) || !visible(t)) return '';
    const next = new Set([...seen, t.id]),
      sub = children(t.id).filter((c) => !next.has(c.id) && visible(c));
    const expanded = s.ui.todoExpanded?.[t.id] ?? sub.length > 0;
    const p = progress(s.todos, t);
    return `<div class="manage-tree-node" style="--depth:${Math.min(depth, 3)}"><article class="manage-task-card importance-${esc(t.importance.toLowerCase())} ${t.status !== wanted ? 'ancestor-context' : ''}">
      <button class="task-expander" data-action="toggle-todo" data-id="${esc(t.id)}" data-expanded="${expanded}" aria-expanded="${expanded}" aria-label="${esc(t.title)} ${expanded ? '접기' : '펼치기'}"><span aria-hidden="true">▶</span></button>
      <button class="task-card-body" data-action="todo-detail" data-id="${esc(t.id)}">${sourceImage(t, 'TODO')}<span class="manage-item-title">${esc(t.title)}</span><span class="task-metadata"><span>${t.deadline ? '마감 <b>' + esc(day(t.deadline)) + '</b>' : '마감 없음'}</span><span>남은 작업 <b>${duration(p.remaining)}</b></span></span></button>
      </article>${expanded ? sub.map((c) => row(c, depth + 1, next)).join('') : ''}</div>`;
  };
  return (
    available
      .filter((t) => !t.parentId || !available.some((p) => p.id === t.parentId))
      .map((t) => row(t))
      .join('') ||
    `<p class="manage-empty">${s.ui.completed ? '완료한 할 일이 없습니다.' : '등록한 할 일이 없습니다.'}</p>`
  );
}
export function paperManage(s, now) {
  const tab = s.ui.manage || 'todos';
  let content;
  if (tab === 'todos') {
    content = `<section class="manage-todo-panel"><div class="manage-list-heading">${image('decorations/decoration_elements_3_123.webp', 'manage-sign-rabbit')}<div class="manage-filters">${button('진행중', 'todo-filter', 'data-completed="false" aria-pressed="' + !s.ui.completed + '"', s.ui.completed ? '' : 'active')}${button('완료됨', 'todo-filter', 'data-completed="true" aria-pressed="' + !!s.ui.completed + '"', s.ui.completed ? 'active' : '')}</div></div><div class="manage-scroll todo-tree" tabindex="0" aria-label="할 일 목록">${todoTree(s)}</div></section>`;
  } else if (tab === 'routines') {
    content = `${image('borders/border_corners_borders_030.webp', 'manage-floral-divider')}<div class="manage-scroll" tabindex="0" aria-label="루틴 목록">${
      s.routines
        .filter((r) => r.status === 'ACTIVE')
        .map((r) => {
          const status = routineStatus(s, r, now),
            done = status.completed.size,
            target = ['DAILY', 'WEEKDAYS'].includes(r.frequency) ? 1 : r.times;
          return `<button class="manage-routine-card" data-action="routine-detail" data-id="${esc(r.id)}">${sourceImage(r, 'ROUTINE')}<span class="manage-item-copy"><span class="manage-item-title">${esc(r.title)}</span><small>${esc(routineSummary(r))}</small>${r.unavailableDates?.includes(day(now)) ? '<small>오늘 제외</small>' : ''}</span>${image(`illustrations/growth_growth_${growthStage(done, target)}_001.webp`, 'manage-growth')}<span class="routine-count" aria-label="현재 주기 ${target}회 중 ${done}회 완료">${done}/${target}</span></button>`;
        })
        .join('') || '<p class="manage-empty">등록한 루틴이 없습니다.</p>'
    }</div>`;
  } else {
    content = `${image('borders/border_floral_05.webp', 'manage-floral-divider')}<div class="manage-scroll" tabindex="0" aria-label="고정 일정 목록">${
      fixedManagementEntries(s, now)
        .map(({ series, occurrence: o }) => {
          const repeat =
            series.recurrence === 'DAILY'
              ? '매일'
              : series.recurrence === 'WEEKLY'
                ? '매주 ' + days(series.weekdays)
                : '한 번';
          return `<button class="manage-fixed-card" data-action="${series.id ? 'edit-fixed-series' : 'edit-fixed'}" data-id="${esc(series.id || o.id)}">${sourceImage(o, 'FIXED')}<span class="manage-item-copy"><span class="manage-item-title">${esc(series.recurrence === 'ONCE' ? o.title : series.title)}</span><small>${esc(repeat)} / ${series.startTime} - ${series.endTime}</small><small>다음 일정 ${day(o.plannedStart)}</small></span></button>`;
        })
        .join('') || '<p class="manage-empty">등록한 고정 일정이 없습니다.</p>'
    }</div>`;
  }
  return `<div class="paper-manage"><header class="manage-garden">${s.ui.previewClock ? '<p class="preview-note">시안 미리보기<br><small>변경사항은 저장되지 않습니다</small></p>' : ''}${image('illustrations/rest_rest_4_001.webp', 'manage-hero-rabbit')}<button class="notification-note" data-action="unconfirmed" aria-label="미확인 기록 ${s.unconfirmed.length}개"><strong>알림</strong><span>${s.unconfirmed.length}개</span></button></header><nav class="manage-category-tabs" aria-label="관리 항목">${[
    ['todos', '할 일'],
    ['routines', '루틴'],
    ['fixed', '고정 일정'],
  ]
    .map(([key, label]) =>
      button(
        label,
        'manage-tab',
        `data-tab="${key}" aria-pressed="${key === tab}"`,
        key === tab ? 'active ' + key : key,
      ),
    )
    .join('')}</nav><div class="manage-content ${tab}">${content}</div></div>`;
}
