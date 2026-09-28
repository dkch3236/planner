import { iconPicker } from './icons.js';
import { day, addDays, at, localInput, preciseLocalInput, exactLocalInput, iso, ms } from '../utils/date.js';
import { esc } from './views.js';
const input = (label, name, value = '', type = 'text', extra = '') =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label, name, options, value) =>
  `<label>${label}<select name="${name}">${options.map(([key, text]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
const weekdays = (values) =>
  `<div class="full"><small>요일</small><div class="weekdays">${['일', '월', '화', '수', '목', '금', '토'].map((t, i) => `<label><input type="checkbox" name="weekdays" value="${i}" ${values.includes(i) ? 'checked' : ''}>${t}</label>`).join('')}</div></div>`;
export function todoForm(t = {}, now) {
  return `<div class="form-grid"><label class="full">할 일 이름<input name="title" value="${esc(t.title || '')}" required maxlength="120"></label>${iconPicker(t.icon)}${input('남은 예상시간 (분)', 'remainingWorkMin', t.remainingWorkMin || 45, 'number', 'min="1" required')}${input('마감', 'deadline', localInput(t.deadline || at(addDays(now, 2), '18:00')), 'datetime-local', 'required')}${select(
    '중요도',
    'importance',
    [
      ['MUST', '꼭 해야 해요'],
      ['SHOULD', '하면 좋아요'],
      ['OPTIONAL', '선택이에요'],
    ],
    t.importance || 'SHOULD',
  )}${select(
    '하고 싶은 정도',
    'desire',
    [1, 2, 3, 4, 5].map((x) => [String(x), `${x} / 5`]),
    String(t.desire || 3),
  )}${select(
    '시간 제약',
    'timeConstraint',
    [
      ['FLEXIBLE', '언제든'],
      ['FIXED', '정해진 시각'],
      ['WINDOW', '시간 범위'],
    ],
    t.timeConstraint || 'FLEXIBLE',
  )}<div></div><div data-condition="timeConstraint:WINDOW" class="full"><div class="form-grid">${input('가능한 시작', 'windowStart', t.windowStart || '09:00', 'time')}${input('가능한 끝', 'windowEnd', t.windowEnd || '18:00', 'time')}</div></div><div data-condition="timeConstraint:FIXED" class="full"><div class="form-grid">${input('고정 시작', 'fixedStart', localInput(t.fixedStart || at(addDays(now, 1), '10:00')), 'datetime-local')}${input('고정 종료', 'fixedEnd', localInput(t.fixedEnd || at(addDays(now, 1), '11:00')), 'datetime-local')}</div></div></div>`;
}
export function routineForm(r = {}, now) {
  return `<div class="form-grid"><label class="full">루틴 이름<input name="title" value="${esc(r.title || '')}" required maxlength="120"></label>${iconPicker(r.icon)}${select(
    '실행 기준',
    'basis',
    [
      ['TIME', '시간 채우기'],
      ['COMPLETION', '완료 여부'],
    ],
    r.basis || 'TIME',
  )}${select(
    '시간 제약',
    'constraint',
    [
      ['ANYTIME', '언제든'],
      ['FIXED', '정해진 시각'],
      ['WINDOW', '시간 범위'],
    ],
    r.constraint || 'ANYTIME',
  )}${input('예상시간 (분)', 'duration', r.duration || 20, 'number', 'min="1" required')}${input('최소버전 (분)', 'minimum', r.minimum || 5, 'number', 'min="1" required')}<div class="full" data-condition="constraint:FIXED">${input('정해진 시각', 'fixedTime', r.fixedTime || '09:00', 'time')}</div><div class="full" data-condition="constraint:WINDOW"><div class="form-grid">${input('가능한 시작', 'windowStart', r.windowStart || '09:00', 'time')}${input('가능한 끝', 'windowEnd', r.windowEnd || '18:00', 'time')}</div></div>${select(
    '반복 방식',
    'frequency',
    [
      ['WINDOW', 'N일 동안 M회'],
      ['WEEKDAYS', '특정 요일'],
    ],
    r.frequency || 'WINDOW',
  )}${input('주기 기준일', 'anchorDate', r.anchorDate || day(now), 'date', 'required')}<div class="full" data-condition="frequency:WINDOW"><div class="form-grid">${input('N일', 'everyDays', r.everyDays || 7, 'number', 'min="1" max="365"')}${input('M회', 'times', r.times || 3, 'number', 'min="1" max="365"')}</div></div><div class="full" data-condition="frequency:WEEKDAYS">${weekdays(r.weekdays || [1, 3, 5])}</div></div>`;
}
export function fixedForm(o = {}, now) {
  return `<div class="form-grid"><label class="full">일정 이름<input name="title" value="${esc(o.title || '')}" required maxlength="120"></label>${iconPicker(o.icon)}${input('시작', 'start', localInput(o.plannedStart || at(addDays(now, 1), '13:00')), 'datetime-local', 'required')}${input('종료', 'end', localInput(o.plannedEnd || at(addDays(now, 1), '14:00')), 'datetime-local', 'required')}${
    o.id
      ? select(
          '적용 범위',
          'scope',
          [
            ['ONE', '이번 일정만'],
            ['FUTURE', '앞으로 반복 일정'],
          ],
          'ONE',
        )
      : select(
          '반복',
          'recurrence',
          [
            ['ONCE', '한 번만'],
            ['WEEKLY', '매주 반복'],
          ],
          'ONCE',
        )
  }${!o.id ? `<div class="full" data-condition="recurrence:WEEKLY">${weekdays([1])}</div>` : ''}</div>`;
}
export function finishForm(e, now, outcome, draft = {}) {
  const focus = e.focusLike ?? ['TODO', 'ROUTINE'].includes(e.sourceType);
  const intro =
    '실제 활동 구간' +
    (focus ? '과 집중 시간을 확인해 주세요.' : '을 확인해 주세요.') +
    (e.suspicious ? ' 타이머가 중단된 구간은 포함하지 않았습니다. 측정값을 확인해 주세요.' : '');
  return `<p class="intro-note">${intro}</p><input type="hidden" name="outcome" value="${outcome}"><div class="form-grid">${input('실제 시작', 'actualStart', draft.actualStart || preciseLocalInput(e.startedAt), 'datetime-local', 'step="1" required')}${input('실제 종료', 'actualEnd', draft.actualEnd || preciseLocalInput(now), 'datetime-local', 'step="1" required')}${focus ? input('확인한 집중 시간 (분)', 'confirmedFocusMin', draft.confirmedFocusMin ?? Math.floor((e.measuredFocusMin || 0) * 10) / 10, 'number', 'min="0" step="0.1" required') : ''}${outcome === 'INCOMPLETE' && e.sourceType === 'TODO' ? input('집중 시간이 남은 예상시간 이상이면 추가로 필요한 시간 (분)', 'additionalMin', draft.additionalMin || '', 'number', 'min="1"') : ''}${e.sourceType === 'TODO' && outcome === 'DONE' ? '<p class="intro-note">이 블록에 배정된 ' + e.assignedWorkMin + '분의 작업량을 완료 처리합니다. 다른 블록의 남은 작업은 유지됩니다.</p>' : ''}<label class="full"><input style="width:auto" name="recordTimeline" type="checkbox" ${draft.recordTimeline === false ? '' : 'checked'}> 위 실제 구간을 생활 기록에 남기기</label></div>`;
}
export function timelineForm(t = {}, now) {
  return `<p class="intro-note">생활 기록만 수정합니다. 작업 성과와 남은 요구량은 바뀌지 않아요.</p><div class="form-grid"><label class="full">활동 이름<input name="title" value="${esc(t.title || '')}" maxlength="120"></label>${input('시작', 'start', exactLocalInput(t.start || now - 60 * 60000), 'datetime-local', 'step="0.001" required')}${input('종료', 'end', exactLocalInput(t.end || now), 'datetime-local', 'step="0.001" required')}${select(
    '기록 종류',
    'sourceType',
    [
      ...(['TODO', 'ROUTINE', 'FIXED', 'REWARD'].includes(t.sourceType)
        ? [[t.sourceType, '기존 활동 종류 유지']]
        : []),
      ['FREE_ACTIVITY', '직접 입력'],
      ['REST', '휴식'],
      ['SLEEP', '수면'],
      ['UNRECORDED', '기록하지 않음'],
    ],
    t.sourceType || 'FREE_ACTIVITY',
  )}</div>`;
}
export function parseForm(form) {
  const d = Object.fromEntries(new FormData(form));
  for (const key of [
    'remainingWorkMin',
    'desire',
    'duration',
    'minimum',
    'everyDays',
    'times',
    'confirmedFocusMin',
    'additionalMin',
    'minutes',
    'density',
    'maxFocus',
  ])
    if (key in d) d[key] = Number(d[key]);
  if (form.querySelector('[name="weekdays"]'))
    d.weekdays = [...form.querySelectorAll('[name="weekdays"]:checked')].map((x) =>
      Number(x.value),
    );
  if (form.querySelector('[name="recordTimeline"]'))
    d.recordTimeline = form.elements.recordTimeline.checked;
  return d;
}
export function conditions(root) {
  for (const el of root.querySelectorAll('[data-condition]')) {
    const [name, value] = el.dataset.condition.split(':');
    el.classList.toggle('hidden', root.querySelector(`[name="${name}"]`)?.value !== value);
  }
}
