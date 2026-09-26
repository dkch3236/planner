import { createState, SCHEMA_VERSION } from './schema.js';
const KEY = 'flowweek.state';
export function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return createState();
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    throw Error('저장 데이터를 읽을 수 없습니다. 기존 데이터를 보존했습니다.');
  }
  if (saved.schemaVersion === 1) {
    saved.schemaVersion = SCHEMA_VERSION;
    saved.pendingSaved = null;
    for (const o of saved.sleepOccurrences) if (o.title === '편안한 수면') o.title = '수면';
    for (const b of saved.livePlan) {
      if (b.sourceType === 'SLEEP' && b.title === '편안한 수면') b.title = '수면';
      if (b.sourceType === 'PREP' && b.title === '잠깐 숨 고르기') b.title = '작업 전환 시간';
    }
    if (saved.execution?.sourceType === 'SLEEP' && saved.execution.title === '편안한 수면')
      saved.execution.title = '수면';
    if (saved.execution) {
      saved.execution.plannedStart =
        saved.livePlan.find((b) => b.id === saved.execution.planId)?.plannedStart ||
        saved.execution.startedAt;
      saved.execution.plannedEnd = saved.execution.expectedEnd;
      saved.execution.timerStatus = saved.execution.focusLike ? 'PAUSED' : null;
      saved.execution.suspicious = !!saved.execution.focusLike;
    }
  }
  if (saved.schemaVersion !== SCHEMA_VERSION)
    throw Error('지원하지 않는 저장 버전입니다. 기존 데이터를 보존했습니다.');
  return saved;
}
export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    throw Error('저장 공간이 부족합니다. 데이터 내보내기로 백업해 주세요.');
  }
}
