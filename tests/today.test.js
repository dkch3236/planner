import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFocus, toggleFocus } from '../js/domain/focus.js';
import { progressModel, timerMarkup, paperToday, activityIcon } from '../js/ui/today.js';
import { todayPreview } from '../js/ui/today-preview.js';
import { createStore } from '../js/state/store.js';
import { MIN, appNow } from '../js/utils/date.js';
import { existsSync, readFileSync } from 'node:fs';

test('focus trail preserves paused gaps and does not count unattended intervals', () => {
  const start = Date.now();
  const e = {
    focusLike: true,
    timerStatus: 'RUNNING',
    focusCheckpoint: 1000,
    measuredFocusMin: 0,
    startedAt: new Date(start).toISOString(),
    expectedEnd: new Date(start + 10 * MIN).toISOString(),
  };
  settleFocus(e, 31000, start + 30000);
  toggleFocus(e, 61000, start + 60000);
  settleFocus(e, 91000, start + 90000);
  toggleFocus(e, 121000, start + 120000);
  settleFocus(e, 151000, start + 150000);
  assert.deepEqual(e.focusIntervals, [
    { start, end: start + 60000 },
    { start: start + 120000, end: start + 150000 },
  ]);
  assert.equal(e.measuredFocusMin, 1.5);
  const p = progressModel(e, start + 180000);
  assert.deepEqual(p.segments, [
    { left: 0, right: 10 },
    { left: 20, right: 25 },
  ]);
  assert.equal(p.cursor, 30);
  settleFocus(e, 300000, start + 300000);
  assert.equal(e.timerStatus, 'PAUSED');
  assert.equal(e.focusIntervals.length, 2);
  assert.equal(e.measuredFocusMin, 1.5);
});
test('unrecorded legacy focus totals do not invent a history, and overtime stays bounded', () => {
  const start = Date.now();
  const e = {
    startedAt: new Date(start).toISOString(),
    expectedEnd: new Date(start + MIN).toISOString(),
    measuredFocusMin: 0.5,
  };
  const p = progressModel(e, start + 2 * MIN);
  assert.equal(p.cursor, 100);
  assert.deepEqual(p.segments, []);
  assert.match(timerMarkup(e, start + 2 * MIN), /초과/);
});
test('rest has no focus measurement or pause control, and titles are escaped', () => {
  const s = todayPreview();
  s.execution.focusLike = false;
  s.execution.sourceType = 'FREE';
  s.execution.title = '<img onerror=x>';
  const html = paperToday(s, appNow(s), '');
  assert.doesNotMatch(html, /data-action="toggle-focus"|data-focus-time/);
  assert.match(html, /&lt;img onerror=x&gt;/);
});

test('non-focus activity fills elapsed time continuously without inventing focus intervals', () => {
  const s = todayPreview(),
    e = s.execution,
    start = Date.parse(e.startedAt);
  e.focusLike = false;
  e.sourceType = 'SLEEP';
  e.focusIntervals = [];
  e.expectedEnd = new Date(start + 60 * MIN).toISOString();
  assert.deepEqual(progressModel(e, start + 30 * MIN).segments, [{ left: 0, right: 50 }]);
  assert.deepEqual(e.focusIntervals, []);
  assert.doesNotMatch(timerMarkup(e, start + 30 * MIN), /data-focus-time/);
});

test('garden motion follows focus execution state and remains paused for rest', () => {
  const s = todayPreview();
  assert.match(paperToday(s, appNow(s), ''), /data-running="true"/);
  s.execution.timerStatus = 'PAUSED';
  assert.match(paperToday(s, appNow(s), ''), /data-running="false"/);
  s.execution.timerStatus = 'RUNNING';
  s.execution.focusLike = false;
  assert.match(paperToday(s, appNow(s), ''), /data-running="false"/);
});
test('preview is memory-only even when actions or preferences change', () => {
  const existing = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw Error('preview must not read storage');
    },
    setItem() {
      throw Error('preview must not write storage');
    },
  };
  try {
    const store = createStore({ initialState: todayPreview() });
    store.dispatch({ type: 'TOGGLE_FOCUS' });
    assert.equal(store.get().execution.timerStatus, 'PAUSED');
    store.ui({ freeCollapsed: true });
    store.flush();
    assert.match(paperToday(store.get(), appNow(store.get()), ''), /aria-expanded="false"/);
  } finally {
    globalThis.localStorage = existing;
  }
});
test('today assets and CSS asset references exist locally', () => {
  const s = todayPreview(),
    html = paperToday(s, appNow(s), '');
  for (const match of html.matchAll(/src="\/([^"?]+)"/g)) assert.ok(existsSync(match[1]), match[1]);
  for (const match of readFileSync('css/today.css', 'utf8').matchAll(/url\('\/([^']+)'\)/g))
    assert.ok(existsSync(match[1]), match[1]);
  assert.ok(existsSync(`public/assets/${activityIcon('Unknown', 'TODO')}`));
});
