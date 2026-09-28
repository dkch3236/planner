import { sourceIcon, validIcon } from './icons.js';
import { paperToday } from './today.js';
import { day, addDays, at, ms, time, duration, stopwatch, MIN } from '../utils/date.js';
import { resolveCurrentView } from '../scheduler/currentView.js';
import { depth, progress } from '../domain/todo.js';
import { gaps } from '../scheduler/availability.js';
import { fixedManagementEntries } from '../domain/occurrences.js';
import { isRewardTodo } from '../domain/preferences.js';
export const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const readable = (value) =>
  ({
    MUST: '필수',
    SHOULD: '권장',
    OPTIONAL: '선택',
    FLEXIBLE: '시간 자유',
    ANYTIME: '시간 자유',
    WINDOW: '시간 범위',
    FIXED: '정해진 시각',
    TIME: '시간 기준',
    COMPLETION: '완료 기준',
  })[value] || value;
export const button = (label, action, attrs = '', cls = 'btn') =>
  `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const typeClass = (b) =>
  ({ FREE: 'free', FIXED: 'fixed', SLEEP: 'sleep', PREP: 'prep' })[b.sourceType] || '';
const label = (b) =>
  ({
    TODO: '할 일',
    ROUTINE: '루틴',
    FIXED: '고정 일정',
    SLEEP: '수면',
    FREE: '자유시간',
    PREP: '전환 시간',
    REWARD: '보상활동',
  })[b.sourceType] || '활동';
export function current(s, now) {
  const view = resolveCurrentView(s, now);
  let title, subtitle, status, actions;
  if (view.kind === 'EXECUTING') {
    const e = view.execution;
    status = e.focusLike
      ? e.timerStatus === 'PAUSED'
        ? '집중 타이머 일시정지'
        : '집중 타이머 실행 중'
      : '활동 진행 중';
    title = e.title;
    subtitle = `예정 ${time(e.plannedStart || e.startedAt)} – ${time(e.plannedEnd || e.expectedEnd)} · 실제 ${time(e.startedAt)} 시작 · 경과 ${duration(Math.max(0, (now - ms(e.startedAt)) / MIN))}${now > ms(e.expectedEnd) ? ' · 예정 종료 시각 경과' : ''}${e.sourceType === 'TODO' ? ' · 이번 블록 ' + e.assignedWorkMin + '분 / 전체 남은 작업 ' + (s.todos.find((t) => t.id === e.sourceId)?.remainingWorkMin || 0) + '분' : ''}`;
    actions =
      e.sourceType === 'SLEEP'
        ? button('일어났어요', 'finish', 'data-outcome="DONE"', 'btn primary')
        : e.sourceType === 'FIXED'
          ? button('일정 끝내기', 'finish', 'data-outcome="DONE"', 'btn primary') +
            button('일정 못 했어요', 'finish', 'data-outcome="MISSED"')
          : !e.focusLike
            ? button('활동 끝내기', 'finish', 'data-outcome="DONE"', 'btn primary') +
              button('다른 작업으로 전환', 'switch') +
              button('자러가기', 'sleep')
            : button(
                e.sourceType === 'TODO' ? '이 블록 작업 완료' : '루틴 완료',
                'finish',
                'data-outcome="DONE"',
                'btn primary',
              ) +
              button('미완료로 끝내기', 'finish', 'data-outcome="INCOMPLETE"') +
              button('다른 작업으로 전환', 'switch');
    if (e.suspicious && e.timerStatus === 'PAUSED')
      subtitle +=
        ' · 자동 측정이 중단되어 일시정지했습니다. 재개하거나 종료 시 시간을 확인해 주세요.';
    if (e.focusLike)
      actions =
        `<div class="focus-timer"><strong data-focus-time>${stopwatch(e.measuredFocusMin)}</strong> 집중 시간 ${button(e.timerStatus === 'PAUSED' ? '다시 시작' : '일시정지', 'toggle-focus')}</div>` +
        actions;
    if (view.conflict)
      subtitle += ` 다음 고정 일정 「${view.conflict.title}」 시간이 되었어요. ‘다른 작업으로 전환’에서 선택할 수 있습니다.`;
  } else if (view.kind === 'PLANNED_CURRENT' || view.kind === 'PREP') {
    const b = view.block;
    status = view.kind === 'PREP' ? '다음 예정 작업' : '현재 예정 작업';
    title = b.title;
    subtitle = `${view.kind === 'PREP' ? b.title + ' · ' : ''}${time(b.plannedStart)} – ${time(b.plannedEnd)} · ${b.assignedWorkMin ? `작업 ${duration(b.assignedWorkMin)} / ` : ''}예약 ${duration(b.reservedMin)}`;
    actions =
      (view.kind === 'PREP' && b.locked
        ? `<span class="pill">${time(b.plannedStart)}에 시작할 수 있어요</span>`
        : button('지금 시작하기 ↗', 'start', `data-id="${b.id}"`, 'btn primary')) +
      button('다른 작업 먼저 하기', 'candidates', 'data-mode="REORDER_PLANNED"') +
      button('보상활동 계획', 'reward');
  } else if (view.kind === 'SLEEP_PROMPT') {
    status = '예정된 수면';
    title = '수면 시간입니다';
    subtitle = '자러가기를 누르면 실제 수면 기록이 시작됩니다.';
    actions = button('자러가기', 'sleep', '', 'btn primary');
  } else {
    status = '현재 자유시간';
    title = view.saved ? '예정보다 일찍 완료' : '예정된 작업 없음';
    subtitle = view.saved
      ? `다음 작업을 당기면 자유시간 ${duration(view.saved)}을 모을 수 있어요.`
      : '작업, 휴식 또는 다른 활동을 시작할 수 있습니다.';
    actions =
      button('다음 작업 당겨오기 ↗', 'candidates', 'data-mode="PULL_FROM_FREE"', 'btn primary') +
      button('그냥 쉬기', 'rest') +
      button('보상활동 하기', 'reward') +
      button('자유입력 활동', 'activity') +
      button('자러가기', 'sleep', '', 'text-button');
  }
  return `<section class="current-card"><div class="status">${day(now)} ${time(now)} · ${status}</div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p><div class="actions">${actions}</div></section>`;
}
export function today(s, now) {
  return paperToday(s, now, current(s, now));
}
export function manage(s, now) {
  const tab = s.ui.manage;
  let body;
  if (tab === 'todos') {
    const list = s.todos.filter((t) =>
      s.ui.completed ? t.status === 'COMPLETED' : t.status === 'ACTIVE',
    );
    body = `<div class="tabs">${button('진행 중', 'todo-filter', 'data-completed="false"', s.ui.completed ? '' : 'active')}${button('완료한 할 일', 'todo-filter', 'data-completed="true"', s.ui.completed ? 'active' : '')}</div>${
      list
        .map((t) => {
          const p = progress(s.todos, t);
          return `<div class="todo-row" style="padding-left:${12 + depth(s.todos, t) * 24}px"><span class="muted">${t.parentId ? '↳' : '○'}</span><button class="todo-title" data-action="todo-detail" data-id="${t.id}">${esc(t.title)}<small style="display:block;margin-top:8px">${day(t.deadline)}까지 · ${duration(p.remaining)} 남음${isRewardTodo(t) ? ' · 보상활동 후보' : ''}</small></button><span class="pill">${readable(t.importance)}</span></div>`;
        })
        .join('') || '<div class="empty">이 목록에 표시할 할 일이 없습니다.</div>'
    }`;
  } else if (tab === 'routines') {
    body =
      s.routines
        .filter((r) => r.status === 'ACTIVE')
        .map(
          (r) =>
            `<div class="todo-row"><div><h3>${esc(r.title)}</h3><small>${readable(r.basis)} · ${duration(r.duration)} · ${r.frequency === 'DAILY' ? '매일 1회' : r.frequency === 'WEEKLY_COUNT' ? `매주 ${r.times}회` : r.frequency === 'WINDOW' ? `${r.everyDays}일 / ${r.times}회` : '요일 지정'}${r.availableWeekdays && ['WINDOW', 'WEEKLY_COUNT'].includes(r.frequency) ? ' · ' + r.availableWeekdays.map((d) => '일월화수목금토'[d]).join('·') : ''} · ${readable(r.constraint)}</small></div><div>${button(r.unavailableDates?.includes(day(now)) ? '오늘 다시 할래요' : '오늘은 안 할래요', 'unavailable', `data-id="${r.id}" data-type="ROUTINE" data-restore="${!!r.unavailableDates?.includes(day(now))}"`, 'text-button')}${button('편집', 'edit-routine', `data-id="${r.id}"`, 'btn')}</div></div>`,
        )
        .join('') || '<p class="empty">루틴을 추가해 보세요.</p>';
  } else {
    body =
      fixedManagementEntries(s, now)
        .map(
          ({ series, occurrence: o }) =>
            `<div class="todo-row"><div><h3>${esc(series.recurrence === 'ONCE' ? o.title : series.title)}</h3><small>${series.recurrence === 'DAILY' ? '매일' : series.recurrence === 'WEEKLY' ? '매주 ' + series.weekdays.map((d) => '일월화수목금토'[d]).join('·') : '한 번'} · ${series.startTime} – ${series.endTime}<br>다음 일정 ${day(o.plannedStart)}</small></div>${button('수정 / 삭제', series.id ? 'edit-fixed-series' : 'edit-fixed', `data-id="${series.id || o.id}"`, 'btn')}</div>`,
        )
        .join('') || '<p class="empty">고정된 약속이 없어요.</p>';
  }
  return `<div class="manage-layout"><div class="side-tabs">${[
    ['todos', '할 일'],
    ['routines', '루틴'],
    ['fixed', '고정일정'],
  ]
    .map(([key, title]) =>
      button(title, 'manage-tab', `data-tab="${key}"`, tab === key ? 'active' : ''),
    )
    .join('')}</div><section class="panel">${body}</section></div>`;
}
export function week(s, now) {
  const weekStart = s.ui.weekStart || day(now);
  const selected =
    s.ui.weekDay >= weekStart && s.ui.weekDay < addDays(weekStart, 7) ? s.ui.weekDay : weekStart;
  const dateTabs = s.ui.historyDate
    ? ''
    : `<nav class="week-day-tabs" aria-label="주간 날짜 선택">${Array.from(
        { length: 7 },
        (_, i) => {
          const d = addDays(weekStart, i);
          return button(
            `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`,
            'week-day',
            `data-date="${d}" aria-pressed="${d === selected}"`,
            d === selected ? 'active' : '',
          );
        },
      ).join('')}</nav>`;

  return `<div class="actions"><label>주간 시작 날짜 <input id="week-date" type="date" value="${s.ui.weekStart || day(now)}"></label>${button('주간 이동', 'week-date')}${button('오늘로', 'week-today')}</div><p class="intro-note">${s.ui.weekStart || day(now)}부터 7일 · 먼 날짜에는 등록한 고정 일정이 표시됩니다.</p><div class="actions"><label>지난 기록 날짜 <input id="history-date" type="date" max="${day(now)}" value="${s.ui.historyDate || ''}"></label>${button('날짜 조회 / 비우면 주간 계획', 'history-date')}</div>${dateTabs}<div class="legend"><span>● 실제 기록</span><span>▧ 미래 계획</span><span>┄ 날짜만 배정</span><span>빈 과거는 미기록 시간</span></div><div class="week-grid ${s.ui.historyDate ? 'history-grid' : ''}">${Array.from(
    { length: s.ui.historyDate ? 1 : 7 },
    (_, i) => {
      const d = addDays(s.ui.historyDate || s.ui.weekStart || now, i),
        dayStart = at(d, '00:00'),
        dayEnd = Math.min(now, at(addDays(d, 1), '00:00')),
        past = s.timeline
          .filter((t) => ms(t.start) < dayEnd && ms(t.end) > dayStart)
          .map((t) => ({
            ...t,
            start: new Date(Math.max(dayStart, ms(t.start))).toISOString(),
            end: new Date(Math.min(dayEnd, ms(t.end))).toISOString(),
          })),
        blocks = [
          ...s.livePlan,
          ...s.fixedOccurrences
            .filter(
              (o) =>
                o.status !== 'CANCELLED' &&
                o.status === 'PLANNED' &&
                !s.livePlan.some((b) => b.sourceId === o.id),
            )
            .map((o) => ({ ...o, sourceType: 'FIXED', sourceId: o.id, calendarOnly: true })),
        ].filter(
          (b) =>
            (b.plannedStart
              ? ms(b.plannedStart) < at(addDays(d, 1), '00:00') && ms(b.plannedEnd) > dayStart
              : b.date === d) &&
            (!b.plannedEnd || ms(b.plannedEnd) > now),
        );
      const recorded = s.timeline.map((t) => ({ plannedStart: t.start, plannedEnd: t.end }));
      if (s.execution)
        recorded.push({
          plannedStart: s.execution.startedAt,
          plannedEnd: new Date(now).toISOString(),
        });
      const blanks =
        dayEnd > dayStart
          ? gaps(dayStart, dayEnd, recorded)
              .filter(([a, b]) => b - a >= MIN)
              .map(([a, b]) => ({
                start: new Date(a).toISOString(),
                end: new Date(b).toISOString(),
                blank: true,
              }))
          : [];
      const pastMarkup = [...past, ...blanks]
        .sort((a, b) => ms(a.start) - ms(b.start))
        .map((t) =>
          t.blank
            ? button(
                `<small>${time(t.start)} – ${time(t.end)}</small>＋ 미기록 시간`,
                'timeline-add',
                `data-start="${t.start}" data-end="${t.end}"`,
                'mini-block unrecorded',
              )
            : `<button class="mini-block history" data-action="timeline-edit" data-id="${t.id}"><small>실제 · ${time(t.start)} – ${time(t.end)}</small>${esc(t.title)}</button>`,
        )
        .join('');
      return `<section class="week-day ${s.ui.historyDate || d === selected ? 'selected-day' : ''}"><div class="week-heading"><span>${d === day(now) ? '오늘' : new Date(`${d}T12:00`).toLocaleDateString('ko-KR', { weekday: 'long' })}</span><strong>${Number(d.slice(5, 7))}/${Number(d.slice(-2))}</strong></div>${i === 0 ? button('＋ 지난 시간 기록', 'timeline-add', '', 'text-button') : ''}${pastMarkup}${s.execution && ms(s.execution.startedAt) < at(addDays(d, 1), '00:00') && now >= dayStart ? `<div class="mini-block active"><small>지금 실행 중 · ${time(s.execution.startedAt)} 시작</small>${esc(s.execution.title)}</div>` : ''}${blocks
        .filter((b) => !b.active)
        .map(
          (b) =>
            `<button class="mini-block ${typeClass(b)} ${!b.plannedStart ? 'date-only' : ''}" data-action="${b.calendarOnly ? 'edit-fixed' : 'block'}" data-id="${b.calendarOnly ? b.sourceId : b.id}"><small>${b.plannedStart ? `${time(b.plannedStart)} – ${time(b.plannedEnd)}` : '날짜 배정 · 시각 미정'}${b.locked ? ' · ▣' : ''}</small>${sourceIcon(s, b) ? `<img class="schedule-icon" src="/public/assets/${sourceIcon(s, b)}" alt="">` : ''}${esc(b.title)}${b.assignedWorkMin ? `<small style="margin-top:6px">작업 ${b.assignedWorkMin}분 · 예약 ${b.reservedMin}분</small>` : ''}</button>`,
        )
        .join('')}</section>`;
    },
  ).join('')}</div>`;
}
export function adjustments(s) {
  return `<div class="settings-grid"><section class="panel"><h2>계획 설정</h2><p class="intro-note" style="margin-top:10px">가용시간 중 작업에 배정할 비율을 설정합니다.</p><form id="settings-form"><div class="form-grid"><label class="full">계획 밀도<select name="density">${[
    [0.55, '여유롭게 · 약 55%'],
    [0.65, '보통 · 약 65%'],
    [0.75, '촘촘하게 · 약 75%'],
  ]
    .map(
      ([v, t]) =>
        `<option value="${v}" ${v === s.settings.density ? 'selected' : ''}>${t}</option>`,
    )
    .join(
      '',
    )}</select></label><label class="full">권장 최대 집중시간 (분)<input name="maxFocus" type="number" min="5" max="180" value="${s.settings.maxFocus}" required></label><label>취침<input name="sleepStart" type="time" value="${s.settings.sleepTemplate.start}" required></label><label>기상<input name="sleepEnd" type="time" value="${s.settings.sleepTemplate.end}" required></label></div><div class="modal-footer"><button class="btn primary" type="submit">설정 적용</button></div></form></section><div class="stack"><section class="panel"><h3>계획 점검</h3><p class="intro-note" style="margin-top:10px">시간이 지난 계획은 실제 수행 여부를 확인해 주세요.</p>${s.diagnostics.map((x) => `<p class="warning">${esc(x.message)}</p>`).join('') || '<p class="pill">✓ 현재 요구량을 배치했어요</p>'}<div class="actions" style="margin-top:20px">${button('미래 계획 다시 제안', 'replan')}${button('확인할 기록', 'unconfirmed')}</div></section><section class="panel"><h3>내 기록 보관하기</h3><p class="intro-note" style="margin-top:10px">데이터는 이 브라우저에 저장됩니다. JSON 파일로 내보낼 수 있어요.</p>${button('데이터 내보내기 ↓', 'export')}</section></div></div>`;
}
