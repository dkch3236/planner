import { appNow } from '../utils/date.js';
import { today, manage, week, adjustments, button } from './views.js';
export function render(s) {
  // Preserve the animation position through the five-second full UI refresh and pause toggles.
  const motionTimes = new Map(
    [...document.querySelectorAll('[data-motion]')].map((el) => [
      el.dataset.motion,
      el.getAnimations().map((a) => a.currentTime),
    ]),
  );
  const now = appNow(s),
    tab = s.ui.tab;
  const planScroll = document.querySelector('.paper-plan')?.scrollTop || 0;
  const focus = document.activeElement?.dataset;
  const routineOpen = document.querySelector('.paper-routines')?.open;
  const sameTab = document.body.dataset.tab === tab;
  const sameManage = sameTab && document.body.dataset.manage === s.ui.manage;
  const manageScroll = sameManage ? document.querySelector('.manage-scroll')?.scrollTop || 0 : 0;
  document.body.dataset.manage = s.ui.manage;
  const pageScroll = sameTab ? window.scrollY : 0;
  document.body.dataset.tab = tab;
  document.body.classList.toggle('today-page', tab === 'today' || tab === 'manage');
  document.body.classList.toggle('manage-page', tab === 'manage');
  const titles = {
    today: ['홈', '현재 작업과 오늘의 계획'],
    manage: ['할 일', '할 일, 루틴, 고정 일정'],
    week: ['계획/기록', '날짜를 선택해 계획과 실제 기록을 확인하세요.'],
    adjust: ['설정', '배정 기준과 미확인 기록 관리'],
  };
  document.querySelector('#app').innerHTML =
    `<div class="app-shell ${tab === 'today' ? 'today-shell' : ''}"><header class="topbar"><a class="brand" href="#" aria-label="FlowWeek 홈"><span class="brand-mark">≈</span>FlowWeek</a><div class="top-meta"><span>이 브라우저에 저장</span><span class="avatar">나</span></div></header><div class="page-heading"><div><div class="eyebrow" style="margin-bottom:10px">${new Date(now).toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' })}</div><h1>${titles[tab][0]}</h1><p>${titles[tab][1]}</p></div>${button(`◷ 확인할 기록 <span class="count">${s.unconfirmed.length}</span>`, 'unconfirmed', '', 'btn')}</div><main>${tab === 'today' ? today(s, now) : tab === 'manage' ? manage(s, now) : tab === 'week' ? week(s, now) : adjustments(s)}</main></div><nav class="bottom-nav" aria-label="주 메뉴">${[
      ['today', 'home_01', '홈'],
      ['manage', 'notebook_01', '할 일'],
      ['week', 'calendar_checked_01', '계획/기록'],
      ['adjust', 'settings_01', '설정'],
    ]
      .map(([key, icon, title]) =>
        button(
          `<img class="nav-icon" src="/public/assets/icons/64/icon_${icon}.webp" alt="" aria-hidden="true">${title}`,
          'nav',
          `data-tab="${key}" ${tab === key ? 'aria-current="page"' : ''}`,
          tab === key ? 'active' : '',
        ),
      )
      .join(
        '',
      )}</nav><button class="fab" data-action="add" aria-label="할 일, 루틴, 일정 추가">+</button>`;
  const list = document.querySelector('.paper-plan');
  for (const el of document.querySelectorAll('[data-motion]')) {
    const times = motionTimes.get(el.dataset.motion);
    if (times)
      el.getAnimations().forEach((a, i) => {
        if (times[i] != null) a.currentTime = times[i];
      });
  }
  if (list) list.scrollTop = planScroll;
  const manageList = document.querySelector('.manage-scroll');
  if (manageList) manageList.scrollTop = manageScroll;
  const routines = document.querySelector('.paper-routines');
  if (routines) routines.open = !!routineOpen;
  window.scrollTo({ top: pageScroll, behavior: 'instant' });
  if (focus?.action) {
    const match = [...document.querySelectorAll('[data-action]')].find((n) =>
      Object.entries(focus).every(([key, value]) => n.dataset[key] === value),
    );
    match?.focus({ preventScroll: true });
  }
}
