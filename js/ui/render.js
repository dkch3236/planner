import { appNow } from '../utils/date.js';
import { today, manage, week, adjustments, button } from './views.js';
export function render(s) {
  const now = appNow(s),
    tab = s.ui.tab;
  const planScroll = document.querySelector('.paper-plan')?.scrollTop || 0;
  const focus = document.activeElement?.dataset;
  const routineOpen = document.querySelector('.paper-routines')?.open;
  const sameTab = document.body.dataset.tab === tab;
  const pageScroll = sameTab ? window.scrollY : 0;
  document.body.dataset.tab = tab;
  document.body.classList.toggle('today-page', tab === 'today');
  const titles = {
    today: ['오늘', '현재 작업과 오늘의 계획'],
    manage: ['관리', '할 일, 루틴, 고정 일정'],
    week: ['주간 계획과 기록', '날짜를 선택해 계획과 실제 기록을 확인하세요.'],
    adjust: ['계획 조정', '배정 기준과 미확인 기록 관리'],
  };
  document.querySelector('#app').innerHTML =
    `<div class="app-shell ${tab === 'today' ? 'today-shell' : ''}"><header class="topbar"><a class="brand" href="#" aria-label="FlowWeek 홈"><span class="brand-mark">≈</span>FlowWeek</a><div class="top-meta"><span>이 브라우저에 저장</span><span class="avatar">나</span></div></header><div class="page-heading"><div><div class="eyebrow" style="margin-bottom:10px">${new Date(now).toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' })}</div><h1>${titles[tab][0]}</h1><p>${titles[tab][1]}</p></div>${button(`◷ 확인할 기록 <span class="count">${s.unconfirmed.length}</span>`, 'unconfirmed', '', 'btn')}</div><main>${tab === 'today' ? today(s, now) : tab === 'manage' ? manage(s, now) : tab === 'week' ? week(s, now) : adjustments(s)}</main></div><nav class="bottom-nav" aria-label="주 메뉴">${[
      ['today', '☼', '오늘'],
      ['manage', '☷', '관리'],
      ['week', '▦', '주간'],
      ['adjust', '⚙', '계획 조정'],
    ]
      .map(([key, icon, title]) =>
        button(
          `<span class="icon">${icon}</span>${title}`,
          'nav',
          `data-tab="${key}" ${tab === key ? 'aria-current="page"' : ''}`,
          tab === key ? 'active' : '',
        ),
      )
      .join(
        '',
      )}</nav><button class="fab" data-action="add" aria-label="할 일, 루틴, 일정 추가">+</button>`;
  const list = document.querySelector('.paper-plan');
  if (list) list.scrollTop = planScroll;
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
