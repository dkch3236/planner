import { appNow, localInput } from '../utils/date.js';
import { today, manage, week, adjustments, button } from './views.js';
export function render(s) {
  const now = appNow(s),
    tab = s.ui.tab;
  const titles = {
    today: ['오늘', '현재 작업과 오늘의 계획'],
    manage: ['관리', '할 일, 루틴, 고정 일정'],
    week: ['주간 계획과 기록', '오늘부터 7일. 가까운 계획은 구체적으로, 먼 계획은 유연하게.'],
    adjust: ['계획 조정', '배정 기준과 미확인 기록 관리'],
  };
  document.querySelector('#app').innerHTML =
    `<div class="app-shell"><header class="topbar"><a class="brand" href="#" aria-label="FlowWeek 홈"><span class="brand-mark">≈</span>FlowWeek</a><div class="top-meta"><span>이 브라우저에 저장</span><span class="avatar">나</span></div></header><div class="clock-panel"><span class="clock-label">◷ 테스트 시계 ${s.ui.virtualNow ? '<b>· 가상시간</b>' : '· 실제시간'}</span><input id="virtual-clock" aria-label="테스트 날짜와 시간" type="datetime-local" value="${localInput(now)}">${button('적용', 'clock-apply')}${[-60, -15, 15, 60].map((n) => button(`${n > 0 ? '+' : ''}${Math.abs(n) === 60 ? n / 60 + '시간' : n + '분'}`, 'clock-shift', `data-minutes="${n}"`)).join('')}${button('블록 종료 −5분', 'clock-end', 'data-minutes="-5"')}${button('종료 +10분', 'clock-end', 'data-minutes="10"')}${button('실제 현재시간', 'clock-reset')}</div><div class="page-heading"><div><div class="eyebrow" style="margin-bottom:10px">${new Date(now).toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' })}</div><h1>${titles[tab][0]}</h1><p>${titles[tab][1]}</p></div>${button(`◷ 확인할 기록 <span class="count">${s.unconfirmed.length}</span>`, 'unconfirmed', '', 'btn')}</div><main>${tab === 'today' ? today(s, now) : tab === 'manage' ? manage(s, now) : tab === 'week' ? week(s, now) : adjustments(s)}</main></div><nav class="bottom-nav" aria-label="주 메뉴">${[
      ['today', '☼', '오늘'],
      ['manage', '☷', '관리'],
      ['week', '▦', '주간'],
      ['adjust', '⚙', '계획 조정'],
    ]
      .map(([key, icon, title]) =>
        button(
          `<span class="icon">${icon}</span>${title}`,
          'nav',
          `data-tab="${key}"`,
          tab === key ? 'active' : '',
        ),
      )
      .join(
        '',
      )}</nav><button class="fab" data-action="add" aria-label="할 일, 루틴, 일정 추가">+</button>`;
}
