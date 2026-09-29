import { sourceIcon } from './icons.js';
import { day, time, duration, ms, MIN } from '../utils/date.js';
import { resolveCurrentView } from '../scheduler/currentView.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const asset = (path) => `/public/assets/${path}`;
export function backgroundFor(now) {
  const hour = new Date(now).getHours();
  const period =
    hour < 5 || hour >= 21
      ? 'night'
      : hour < 9
        ? 'morning'
        : hour < 17
          ? 'noon'
          : hour < 19
            ? 'sunset'
            : 'evening';
  return `backgrounds/landscape/background_landscape_${period}.webp`;
}

const picture = (path, cls = '', attrs = '') =>
  `<img class="${cls}" src="${asset(path)}" alt="" draggable="false" ${attrs}>`;
export const clockDuration = (minutes) => {
  const seconds = Math.floor(Math.max(0, minutes) * 60);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
export function activityIcon(title, type) {
  const rules = [
    [/보고서|컴퓨터|코딩|개발/, 'laptop'],
    [/발표|준비|메모/, 'notebook'],
    [/식사|점심|저녁|아침/, 'meal'],
    [/카페|커피/, 'coffee'],
    [/운동|움직|스트레칭|요가/, 'yoga'],
    [/수면|자러|잠/, 'sleep'],
    [/독서|책/, 'reading'],
  ];
  const match = rules.find(([pattern]) => pattern.test(title));
  return `icons/64/icon_${match?.[1] || { TODO: 'notebook', ROUTINE: 'yoga', FREE: 'coffee', SLEEP: 'sleep', PREP: 'clock' }[type] || 'calendar'}_01.webp`;
}
export function progressModel(e, now) {
  const start = ms(e.startedAt),
    end = ms(e.expectedEnd);
  const span = Math.max(MIN, end - start);
  const percent = (t) => Math.max(0, Math.min(100, ((t - start) / span) * 100));
  return {
    cursor: percent(now),
    elapsed: Math.max(0, (now - start) / MIN),
    remaining: (end - now) / MIN,
    segments: (e.focusLike === false ? [{ start, end: now }] : e.focusIntervals || [])
      .map((r) => ({ left: percent(r.start), right: percent(Math.min(r.end, now)) }))
      .filter((r) => r.right > r.left),
  };
}
export function timerMarkup(e, now) {
  const p = progressModel(e, now),
    over = p.remaining < 0;
  const target = e.assignedWorkMin || e.reservedMin || 0;
  return `<div class="time-labels"><span>시작 시간 <b>${time(e.startedAt)}</b></span><span class="time-pill ${over ? 'over' : ''}">${over ? '초과' : '남은 시간'} ${clockDuration(Math.abs(p.remaining))}</span><span>예정 종료 시간 <b>${time(e.expectedEnd)}</b></span></div>
    <div class="time-track" role="progressbar" aria-label="실제 활동 경과" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.cursor)}" aria-valuetext="경과 ${duration(p.elapsed)}${e.focusLike ? `, 집중 ${clockDuration(e.measuredFocusMin)}` : ''}">
      ${p.segments.map((r) => `<i class="focus-trail" style="left:${r.left}%;width:${r.right - r.left}%"></i>`).join('')}
      <i class="time-cursor" style="left:clamp(5px,${p.cursor}%,calc(100% - 5px))"></i>
    </div>
    ${e.focusLike ? `<div class="focus-labels"><span>집중 시간 <b data-focus-time>${clockDuration(e.measuredFocusMin)}</b></span><span class="focus-pill">${e.measuredFocusMin >= target ? '목표 달성' : '남은 집중 시간 ' + clockDuration(target - e.measuredFocusMin)}</span><span>목표 집중 시간 <b>${clockDuration(target)}</b></span></div>` : ''}
    <div class="elapsed-label">실제 경과 ${clockDuration(p.elapsed)}${e.focusLike ? ` · ${e.timerStatus === 'PAUSED' ? '집중 일시정지' : '집중 중'}` : ''}</div>`;
}
function runningCard(s, now) {
  const e = s.execution,
    running = e.timerStatus === 'RUNNING';
  const view = resolveCurrentView(s, now);
  const finishLabel = e.sourceType === 'SLEEP' ? '일어났어요' : '다했어요';
  return `<section class="paper-current" aria-label="현재 일정">
    ${e.focusLike ? `<button class="focus-control" data-action="toggle-focus" aria-label="${running ? '집중 타이머 일시정지' : '집중 타이머 다시 시작'}"><span class="${running ? 'pause-symbol' : 'play-symbol'}" aria-hidden="true"></span></button>` : ''}
    <div class="paper-current-heading">${picture(sourceIcon(s, e) || activityIcon(e.title, e.sourceType), 'activity-illustration', `data-motion="activity" data-running="${gardenRunning(s)}"`)}<div class="current-title"><p>현재 일정</p><h1>${esc(e.title)}</h1></div><div class="planned-info">예정: ${time(e.plannedStart || e.startedAt)}<span class="planned-time-separator"> - </span>${time(e.plannedEnd || e.expectedEnd)}<br>${e.focusLike ? `집중 ${e.assignedWorkMin}분 / ` : ''}총 ${e.reservedMin}분</div></div>
    <div data-today-timers>${timerMarkup(e, now)}</div>
    <div class="paper-actions">${e.sourceType !== 'SLEEP' ? '<button data-action="switch" class="paper-button switch">작업 전환</button>' : ''}<button data-action="finish" data-outcome="DONE" class="paper-button done">${finishLabel}</button>
    ${e.sourceType !== 'SLEEP' ? `<button data-action="finish" data-outcome="${e.focusLike ? 'INCOMPLETE' : e.sourceType === 'FIXED' ? 'MISSED' : 'DONE'}" class="paper-button stop">${e.sourceType === 'FIXED' ? '일정 못 했어요' : '그만할래요'}</button>` : ''}</div>
    ${e.focusLike ? `<button class="skip-today" data-action="unavailable" data-id="${esc(e.sourceId)}" data-type="${e.sourceType}">오늘은 안 할래요</button>` : ''}
    ${e.suspicious && e.timerStatus === 'PAUSED' ? '<p class="paper-notice">자동 측정이 중단되었습니다. 시간을 확인한 뒤 재개해 주세요.</p>' : ''}
    ${view.conflict ? `<p class="paper-notice">「${esc(view.conflict.title)}」 시작 시간이 되었습니다. 작업 전환에서 선택하세요.</p>` : ''}
  </section>`;
}
const statTime = (n) => `<strong>${Math.floor(n / 60)}시간<br>${Math.floor(n % 60)}분</strong>`;
export const gardenRunning = (s) =>
  !!(s.execution?.focusLike && s.execution.timerStatus === 'RUNNING');
function atmosphere(s, now) {
  const night = /_(night|evening)\./.test(backgroundFor(now));
  return `<div class="garden-atmosphere ${night ? 'night' : 'day'}" data-running="${gardenRunning(s)}" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<i data-motion="${i}" class="garden-motion ${i < 2 ? 'drifting-cloud' : i < 5 ? 'floating-petal' : 'drifting-star'}" style="--i:${i}"></i>`).join('')}</div>`;
}
export function paperToday(s, now, fallback) {
  const blocks = s.livePlan.filter(
    (b) =>
      b.plannedStart &&
      day(b.plannedStart) <= day(now) &&
      ms(b.plannedEnd) > now &&
      !b.active &&
      b.id !== s.execution?.planId,
  );
  const free = blocks
    .filter((b) => b.sourceType === 'FREE')
    .map((b) => (ms(b.plannedEnd) - Math.max(now, ms(b.plannedStart))) / MIN);
  const collapsed = !!s.ui.freeCollapsed;
  const routines = s.routines.filter((r) => r.status === 'ACTIVE');
  return `<div class="paper-today">
    <div class="garden-hero" style="background-image:url('${asset(backgroundFor(now))}')">${atmosphere(s, now)}${s.ui.previewClock ? '<p class="preview-note">시안 미리보기<br><small>변경사항은 저장되지 않습니다</small></p>' : ''}<button class="notification-note" data-action="unconfirmed" aria-label="미확인 기록 ${s.unconfirmed.length}개"><strong>알림</strong><span>${s.unconfirmed.length}개</span></button>
    ${s.execution ? runningCard(s, now) : `<section class="paper-current idle-current">${fallback}</section>`}
    ${picture('borders/border_corners_borders_098.webp', 'garden-border')}</div>
    <div class="paper-content"><section class="leisure-section" aria-labelledby="leisure-heading"><div class="paper-section-heading"><h2 id="leisure-heading"><button data-action="toggle-free" aria-expanded="${!collapsed}" aria-controls="leisure-stats">오늘의 여유시간 <span aria-hidden="true">${collapsed ? '▸' : '▾'}</span></button></h2><span class="paper-stars" aria-hidden="true">✦ ✦ ✦</span></div>
    <div id="leisure-stats" class="leisure-stats" ${collapsed ? 'hidden' : ''}><div><span>총 여유시간</span>${statTime(free.reduce((a, b) => a + b, 0))}</div><div><span>가장 긴 여유시간</span>${statTime(Math.max(0, ...free))}</div><div><span>내가 모은 시간</span>${statTime(s.freeCreditToday.minutes)}</div></div></section>
    <section class="plan-section" aria-labelledby="plan-heading"><div class="paper-section-heading"><h2 id="plan-heading">오늘의 계획</h2><span class="paper-stars" aria-hidden="true">✦ ✦</span></div>
    <div class="paper-plan" tabindex="0" aria-label="오늘의 일정 목록">${blocks.map((b) => `<button class="paper-plan-row ${b.sourceType.toLowerCase()}" data-action="block" data-id="${esc(b.id)}"><span class="plan-times">${time(b.plannedStart)}<br>${time(b.plannedEnd)}</span><span class="plan-vine" aria-hidden="true"></span>${picture(sourceIcon(s, b) || activityIcon(b.title, b.sourceType), 'plan-illustration')}<span class="plan-title">${esc(b.title)}</span><span class="sr-only">${{ TODO: '할 일', ROUTINE: '루틴', FREE: '자유시간', FIXED: '고정 일정', SLEEP: '수면', PREP: '전환 시간' }[b.sourceType] || '활동'}</span></button>`).join('') || '<p class="empty">남은 일정이 없습니다.</p>'}</div></section>
    ${routines.length ? `<details class="paper-routines"><summary>나의 루틴 <span>${routines.length}</span></summary><div>${routines.map((r) => `<p>${esc(r.title)} <small>${duration(r.duration)}</small></p>`).join('')}<button data-action="manage-routines" class="paper-button">루틴 관리</button></div></details>` : ''}
    </div></div>`;
}
export function updateTodayTimers(s, now) {
  const activity = document.querySelector('.activity-illustration[data-motion]');
  if (activity) activity.dataset.running = String(gardenRunning(s));
  const sky = document.querySelector('.garden-atmosphere');
  if (sky) sky.dataset.running = String(gardenRunning(s));
  const target = document.querySelector('[data-today-timers]');
  if (target && s.execution) target.innerHTML = timerMarkup(s.execution, now);
  const control = document.querySelector('.focus-control');
  if (control && s.execution) {
    const running = s.execution.timerStatus === 'RUNNING';
    control.setAttribute('aria-label', running ? '집중 타이머 일시정지' : '집중 타이머 다시 시작');
    control.firstElementChild.className = running ? 'pause-symbol' : 'play-symbol';
  }
}
