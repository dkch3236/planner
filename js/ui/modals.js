import { validIcon } from './icons.js';
import { nextFixedOccurrence } from '../domain/occurrences.js';
import { isRewardTodo } from '../domain/preferences.js';
import { appNow, MIN, ms, iso, day, time, duration, id } from '../utils/date.js';
import { candidates, remainingFreeSlots, previewReward } from '../scheduler/replan.js';
import { progress, children, leaves, activeLeaves } from '../domain/todo.js';
import { validateFinish, finishExecution } from '../domain/execution.js';
import { esc, button, readable } from './views.js';
import {
  todoForm,
  routineForm,
  fixedForm,
  finishForm,
  timelineForm,
  parseForm,
  conditions,
} from './forms.js';
export function createModals(store, toast) {
  const dialog = document.querySelector('#modal');
  let submit = null,
    context = {},
    current = '';
  const close = () => {
    dialog.close();
    current = '';
  };
  const show = (title, body, onSubmit = null, kind = '') => {
    current = kind;
    submit = onSubmit;
    dialog.innerHTML = `<div class="modal-header"><h2>${esc(title)}</h2>${button('×', 'close', '', '')}</div>${onSubmit ? '<form id="modal-form">' : ''}${body}<p class="error" role="alert"></p>${onSubmit ? '<div class="modal-footer"><button class="btn" type="button" data-action="close">취소</button><button class="btn primary" type="submit">저장하기</button></div></form>' : ''}`;
    conditions(dialog);
    if (!dialog.open) dialog.showModal();
  };
  const dispatch = (type, payload) => store.dispatch({ type, payload });
  function sourceForm(type, source = {}, parentId = null) {
    context = { type, source, parentId };
    const now = appNow(store.get());
    show(
      type === 'TODO'
        ? '할 일 ' + (source.id ? '편집' : '추가')
        : type === 'ROUTINE'
          ? '루틴 ' + (source.id ? '편집' : '추가')
          : '일정 ' + (source.id ? '편집' : '추가'),
      type === 'TODO'
        ? todoForm(source, now)
        : type === 'ROUTINE'
          ? routineForm(source, now)
          : fixedForm(source, now),
      (data) => {
        if (type === 'FIXED' && source.id)
          dispatch('EDIT_FIXED', {
            ...data,
            id: source.id,
            originalDate: source.date,
            plannedStart: iso(data.start),
            plannedEnd: iso(data.end),
          });
        else
          dispatch(`SAVE_${type}`, {
            ...data,
            id: source.id,
            parentId: source.parentId || parentId,
          });
        close();
        if (type === 'FIXED')
          store.ui({
            tab: 'week',
            weekStart: day(data.start),
            weekDay: day(data.start),
            historyDate: null,
          });
        toast('저장하고 미래 계획을 조정했어요.');
      },
    );
    if (type === 'FIXED' && source.id)
      dialog
        .querySelector('.modal-footer')
        .insertAdjacentHTML(
          'afterbegin',
          button('일정 삭제', 'delete-fixed', `data-id="${source.id}"`, 'btn danger'),
        );
  }
  function choose(mode, finish = null, allowOverdue = false) {
    context = { mode, finish, allowOverdue };
    const state = structuredClone(store.get()),
      now = appNow(state);
    if (finish) finishExecution(state, finish, now);
    const fixed =
      mode === 'SWITCH_EXECUTION'
        ? state.livePlan.filter(
            (b) =>
              b.sourceType === 'FIXED' &&
              b.sourceId !== store.get().execution?.sourceId &&
              ms(b.plannedStart) <= now &&
              ms(b.plannedEnd) > now,
          )
        : [];
    const list = candidates(state, now, { allowOverdue }).filter(
      (b) => mode !== 'SWITCH_EXECUTION' || b.sourceId !== store.get().execution?.sourceId,
    );
    show(
      '전환할 작업 선택',
      `<p class="intro-note">선택한 작업을 시작하고 이후 계획을 조정합니다. 지연 수행은 기존 마감을 보존합니다.</p>${finish ? button('이전: 종료 내용 수정', 'switch-back') : ''}${button(allowOverdue ? '마감 지난 작업 제외' : '마감 지난 작업도 보기', 'toggle-overdue')}${fixed.map((b) => button(esc(b.title) + ' · 현재 고정 일정으로 전환', 'choose-fixed', `data-id="${b.id}"`, 'candidate')).join('')}${list.map((b) => `<button class="candidate" data-action="choose" data-id="${b.sourceId}"><span>${esc(b.title)}${b.overdue ? ' · 지연 수행' : ''}</span><small>작업 ${b.assignedWorkMin}분 · 예약 ${b.reservedMin}분 →</small></button>`).join('') || (fixed.length ? '' : '<p class="empty">현재 시간 제약을 충족하는 작업이 없습니다.</p>')}`,
      null,
      'candidates',
    );
  }
  function finish(outcome = 'DONE', switching = false, draft = {}) {
    const e = store.get().execution;
    if (!e) return;
    show(
      switching ? '전환 전, 지금까지 한 일 확인' : '활동 마무리',
      finishForm(
        e,
        appNow(store.get()),
        switching ? (e.focusLike ? 'INCOMPLETE' : 'DONE') : outcome,
        draft,
      ),
      (data) => {
        if (switching) {
          validateFinish(store.get(), data, appNow(store.get()));
          choose('SWITCH_EXECUTION', data);
        } else {
          dispatch('FINISH', data);
          close();
          toast('실제 기록을 반영했어요.');
        }
      },
    );
  }
  function unconfirmed() {
    const s = store.get();
    show(
      '확인할 기록',
      `<p class="intro-note">시간이 지났지만 아직 확인하지 않은 계획이에요. 실제로 한 일을 알려주세요.</p>${s.unconfirmed.map((b) => `<div class="confirm-item"><strong>${esc(b.title)}</strong><p><small>${day(b.plannedStart)} ${time(b.plannedStart)} – ${time(b.plannedEnd)}</small></p><div class="actions">${button('했어요', 'confirm-done', `data-id="${b.id}"`, 'btn soft')}${button('못 했어요', 'confirm-missed', `data-id="${b.id}"`)}${button('아직 하고 있어요', 'confirm-ongoing', `data-id="${b.id}"`)}</div></div>`).join('') || '<div class="empty">모든 기록을 확인했어요. ✓</div>'}`,
      null,
      'unconfirmed',
    );
  }
  function detail(todoId) {
    const s = store.get(),
      t = s.todos.find((x) => x.id === todoId),
      p = progress(s.todos, t);
    show(
      t.title,
      `<h3>진행상황</h3><p class="large-number" style="margin-top:14px">${duration(p.remaining)} <small style="font-size:12px">남음</small></p><div class="progress"><span style="width:${p.total ? Math.max(0, 100 - (p.remaining / p.total) * 100) : 100}%"></span></div><h3 class="section-title">하위 할 일</h3>${children(
        s.todos,
        t.id,
      )
        .filter((x) => x.status === 'ACTIVE')
        .map((x) => button(esc(x.title), 'todo-detail', `data-id="${x.id}"`, 'candidate'))
        .join(
          '',
        )}${button('＋ 하위 할 일 추가', 'child', `data-id="${t.id}"`, 'text-button')}<h3 class="section-title">정보</h3><p class="intro-note">${day(t.deadline)} 마감 · ${readable(t.importance)} · 하고 싶은 정도 ${t.desire}/5 · ${readable(t.timeConstraint)}</p><h3 class="section-title">편집</h3><div class="actions">${button('정보 수정', 'edit-todo', `data-id="${t.id}"`)}${button(t.unavailableDates?.includes(day(appNow(s))) ? '오늘 다시 할래요' : '오늘은 안 할래요', 'unavailable', `data-id="${t.id}" data-type="TODO" data-restore="${!!t.unavailableDates?.includes(day(appNow(s)))}"`)}${button('할 일 취소', 'cancel-todo', `data-id="${t.id}"`, 'btn danger')}</div>`,
    );
  }
  function timeline(recordId, preset = {}) {
    const t = store.get().timeline.find((t) => t.id === recordId) || preset;
    show(
      recordId ? '생활 기록 수정' : '지난 시간 기록',
      timelineForm(t, appNow(store.get())),
      (data) => {
        dispatch('TIMELINE', {
          ...data,
          id: t.id,
          title:
            data.title ||
            { REST: '휴식', SLEEP: '수면', UNRECORDED: '미기록 시간' }[data.sourceType] ||
            '직접 입력 활동',
        });
        close();
        toast('생활 기록을 저장했어요.');
      },
    );
  }
  function reward() {
    const s = store.get(),
      now = appNow(s);
    const available = new Set(
      candidates(s, now)
        .filter((b) => b.sourceType === 'TODO')
        .map((b) => b.sourceId),
    );
    const automatic = activeLeaves(s).filter(isRewardTodo);
    const suggestions = automatic.length
      ? `<h3>등록한 할 일에서 선택</h3><p class="intro-note">중요도 ‘선택’ · 하고 싶은 정도 4–5인 할 일입니다. 시작하면 기존 할 일의 작업량에 반영됩니다.</p>${automatic.map((t) => (available.has(t.id) ? button(`${esc(t.title)} · 지금 시작 (${Math.min(t.remainingWorkMin, s.settings.maxFocus)}분)`, 'reward-todo', `data-id="${t.id}"`, 'candidate') : `<p>${esc(t.title)} · 지금은 시간 제약 또는 남은 공간 때문에 시작할 수 없습니다.</p>`)).join('')}<h3>직접 입력</h3>`
      : '<p class="intro-note">중요도 ‘선택’, 하고 싶은 정도 4–5인 할 일을 등록하면 여기에 자동으로 표시됩니다.</p>';
    show(
      '보상활동 계획',
      `${suggestions}<p class="intro-note">추가 확보 시간이 0분이어도 원래의 자유시간을 사용할 수 있어요.</p><div class="form-grid"><label>하고 싶은 활동<input name="title" required></label><label>필요한 시간 (분)<input name="minutes" type="number" min="5" max="720" value="60" required></label></div>`,
      (data) => {
        context = { reward: data };
        const s = store.get(),
          now = appNow(s),
          slots = remainingFreeSlots(s, now).filter((b) => b.reservedMin >= data.minutes),
          present = s.livePlan.find(
            (b) => b.sourceType === 'FREE' && ms(b.plannedStart) <= now && ms(b.plannedEnd) > now,
          ),
          currentMin = present ? Math.floor((ms(present.plannedEnd) - now) / MIN) : 0;
        show(
          `${data.title} · ${data.minutes}분`,
          `<p class="intro-note">현재 자유시간 ${currentMin}분 · ${Math.max(0, data.minutes - currentMin)}분 부족</p>${button('지금 할 수 있게 일정 재배치', 'reward-now', '', 'btn primary')}<h3 class="section-title">오늘의 여유로운 시간</h3>${slots.map((b) => button(`${time(b.plannedStart)} – ${time(ms(b.plannedStart) + data.minutes * MIN)}에 하기`, 'reward-later', `data-start="${b.plannedStart}"`, 'candidate')).join('') || '<p class="intro-note">충분히 긴 연속 자유시간이 없어요. 위 버튼으로 안전한 재배치를 확인할 수 있어요.</p>'}`,
        );
      },
    );
  }
  function block(blockId) {
    const b = store.get().livePlan.find((b) => b.id === blockId);
    if (!b) return;
    show(
      b.title,
      `<p class="intro-note">${b.plannedStart ? `${day(b.plannedStart)} ${time(b.plannedStart)} – ${time(b.plannedEnd)}` : b.date + ' · 날짜만 배정'}${b.assignedWorkMin ? `<br>할당 작업 ${b.assignedWorkMin}분 / 예약 ${b.reservedMin}분` : ''}</p><div class="actions">${['TODO', 'ROUTINE'].includes(b.sourceType) && b.plannedStart ? button(b.locked ? '잠금 해제' : '이 블록 잠그기', 'lock', `data-id="${b.id}"`) : ''}${b.sourceType === 'TODO' ? button('할 일 상세', 'todo-detail', `data-id="${b.sourceId}"`) : ''}${b.sourceType === 'FIXED' ? button('일정 편집', 'edit-fixed', `data-id="${b.sourceId}"`) : ''}${['TODO', 'ROUTINE'].includes(b.sourceType) ? button('지금 가능한 작업 보기', 'candidates', 'data-mode="PULL_FROM_FREE"') : ''}${['TODO', 'ROUTINE'].includes(b.sourceType) ? button('오늘은 안 할래요', 'unavailable', `data-id="${b.sourceId}" data-type="${b.sourceType}"`) : ''}${b.sourceType === 'FREE' ? button('보상활동 계획', 'reward') : ''}</div>`,
    );
  }
  function handle(action, data) {
    const s = store.get();
    switch (action) {
      case 'close':
        close();
        break;
      case 'add':
        show(
          '추가',
          `<div class="stack">${[
            ['TODO', '할 일', '남은 작업량과 마감을 바탕으로 배치해요.'],
            ['ROUTINE', '루틴', '반복 주기와 수행 기준을 설정합니다.'],
            ['FIXED', '일정', '정해진 시간의 약속을 보호해요.'],
          ]
            .map(([type, title, text]) =>
              button(
                `<strong>${title} ＋</strong><small>${text}</small>`,
                'new-source',
                `data-type="${type}"`,
                'choice-card',
              ),
            )
            .join('')}</div>`,
        );
        break;
      case 'new-source':
        sourceForm(data.type);
        break;
      case 'edit-todo':
        sourceForm(
          'TODO',
          s.todos.find((t) => t.id === data.id),
        );
        break;
      case 'edit-routine':
        sourceForm(
          'ROUTINE',
          s.routines.find((t) => t.id === data.id),
        );
        break;
      case 'routine-detail': {
        const r = s.routines.find((x) => x.id === data.id);
        const excluded = !!r.unavailableDates?.includes(day(appNow(s)));
        show(
          r.title,
          `<p class="intro-note">예상시간 ${duration(r.duration)} · 최소버전 ${duration(r.minimum)}</p><div class="actions">${button('정보 수정', 'edit-routine', `data-id="${r.id}"`)}${button(excluded ? '오늘 다시 할래요' : '오늘은 안 할래요', 'unavailable', `data-id="${r.id}" data-type="ROUTINE" data-restore="${excluded}"`)}</div>`,
        );
        break;
      }
      case 'edit-fixed':
        sourceForm(
          'FIXED',
          s.fixedOccurrences.find((t) => t.id === data.id),
        );
        break;
      case 'edit-fixed-series': {
        const series = s.fixedSeries.find((x) => x.id === data.id);
        const occurrence = nextFixedOccurrence(s, series, appNow(s));
        if (!occurrence) throw Error('앞으로 남은 일정이 없습니다.');
        sourceForm('FIXED', occurrence);
        dialog.querySelector('[name="scope"]').value = 'FUTURE';
        break;
      }
      case 'child':
        sourceForm('TODO', {}, data.id);
        break;
      case 'todo-detail':
        detail(data.id);
        break;
      case 'finish':
        finish(data.outcome);
        break;
      case 'switch':
        finish('INCOMPLETE', true);
        break;
      case 'candidates':
        choose(data.mode);
        break;
      case 'switch-back':
        finish('INCOMPLETE', true, context.finish);
        break;
      case 'toggle-overdue':
        choose(context.mode, context.finish, !context.allowOverdue);
        break;
      case 'choose-fixed':
        dispatch('SWITCH', { targetId: data.id, finish: context.finish });
        close();
        break;
      case 'choose':
        if (context.mode === 'SWITCH_EXECUTION')
          dispatch('SWITCH', {
            sourceId: data.id,
            finish: context.finish,
            allowOverdue: context.allowOverdue,
          });
        else
          dispatch('MANUAL', {
            sourceId: data.id,
            mode: context.mode,
            allowOverdue: context.allowOverdue,
          });
        close();
        toast('선택한 활동을 시작했어요.');
        break;
      case 'unconfirmed':
        unconfirmed();
        break;
      case 'confirm-missed':
        dispatch('CONFIRM', { id: data.id, outcome: 'MISSED' });
        unconfirmed();
        break;
      case 'confirm-done':
      case 'confirm-ongoing': {
        const b = s.unconfirmed.find((b) => b.id === data.id);
        const outcome = action === 'confirm-done' ? 'DONE' : 'ONGOING';
        show(
          '실제 활동 확인',
          finishForm(
            { ...b, startedAt: b.plannedStart, measuredFocusMin: b.assignedWorkMin || 0 },
            Math.min(appNow(s), ms(b.plannedEnd)),
            outcome,
          ),
          (values) => {
            dispatch('CONFIRM', { ...values, id: b.id });
            unconfirmed();
          },
        );
        break;
      }
      case 'timeline-add':
        timeline(null, data.start ? { start: data.start, end: data.end } : {});
        break;
      case 'timeline-edit':
        timeline(data.id);
        break;
      case 'reward':
        reward();
        break;
      case 'reward-todo':
        dispatch('REWARD_TODO', { sourceId: data.id });
        close();
        toast('등록한 보상활동 할 일을 시작했습니다.');
        break;
      case 'reward-now': {
        const preview = previewReward(s, context.reward, appNow(s));
        context.signature = preview.signature;
        show(
          '일정 변경 미리보기',
          `<p class="intro-note">${esc(context.reward.title)} · ${context.reward.minutes}분을 지금 시작합니다. 아래 변경을 확인해 주세요.</p>${preview.changes.map((c) => `<p><strong>${esc(c.title)}</strong><br>${esc(c.from.includes('T') ? day(c.from) + ' ' + time(c.from) : c.from)} → ${c.to.map((t) => esc(t.includes('T') ? day(t) + ' ' + time(t) : t)).join(', ')}</p>`).join('') || '<p>다른 작업의 배정 변경 없음</p>'}${button('변경 적용하고 활동 시작', 'reward-commit', '', 'btn primary')}${button('다시 선택', 'reward')}`,
        );
        break;
      }
      case 'reward-commit':
        dispatch('REWARD', { ...context.reward, previewSignature: context.signature });
        close();
        toast('일정을 조정하고 보상활동을 시작했어요.');
        break;
      case 'reward-later':
        dispatch('REWARD', { ...context.reward, start: data.start });
        close();
        toast('보상활동을 계획했어요.');
        break;
      case 'activity':
        show(
          '자유입력 활동',
          '<div class="form-grid"><label>무엇을 하나요?<input name="title" required maxlength="120"></label><label>예상시간 (분)<input name="minutes" type="number" min="1" value="30" required></label></div>',
          (values) => {
            dispatch('ACTIVITY', values);
            close();
          },
        );
        break;
      case 'block':
        block(data.id);
        break;
      case 'lock':
        dispatch('LOCK', { id: data.id });
        close();
        break;
      case 'cancel-todo':
        dispatch('CANCEL_TODO', { id: data.id });
        close();
        break;
      case 'unavailable': {
        const payload = { id: data.id, sourceType: data.type, restore: data.restore === 'true' };
        const activeSource = s.execution?.sourceId;
        const includesActive =
          activeSource &&
          (activeSource === data.id ||
            (data.type === 'TODO' && leaves(s.todos, data.id).some((t) => t.id === activeSource)));
        if (!payload.restore && includesActive) {
          show(
            '오늘은 안 할래요',
            '<p class="intro-note">지금까지의 활동을 기록하고 오늘 남은 배정을 제외합니다.</p>' +
              finishForm(s.execution, appNow(s), 'INCOMPLETE'),
            (values) => {
              dispatch('UNAVAILABLE', { ...payload, finish: values });
              close();
              toast('오늘 남은 배정을 제외했습니다.');
            },
          );
        } else {
          dispatch('UNAVAILABLE', payload);
          close();
          toast(
            payload.restore ? '오늘 배정에 다시 포함했습니다.' : '오늘 남은 배정을 제외했습니다.',
          );
        }
        break;
      }
      case 'delete-fixed':
        dispatch('DELETE_FIXED', {
          id: data.id,
          originalDate: context.source?.date,
          scope: dialog.querySelector('[name="scope"]').value,
        });
        close();
        break;
      default:
        return false;
    }
    return true;
  }
  dialog.addEventListener('change', (event) => {
    conditions(dialog);
    if (event.target.name === 'icon') {
      const icon = event.target.value;
      event.target.closest('.icon-picker').querySelector('summary').innerHTML =
        '아이콘 선택 ' +
        (validIcon(icon)
          ? `<img src="/public/assets/${icon}" alt="선택한 아이콘">`
          : '· 자동 선택');
    }
  });
  dialog.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      submit?.(parseForm(event.target));
    } catch (error) {
      dialog.querySelector('.error').textContent = error.message;
    }
  });
  dialog.addEventListener('cancel', () => {
    current = '';
  });
  return {
    handle,
    close,
    refresh: () => {
      if (dialog.open && current === 'unconfirmed') unconfirmed();
    },
    error: (message) => {
      if (dialog.open) dialog.querySelector('.error').textContent = message;
    },
  };
}
