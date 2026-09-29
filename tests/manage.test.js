import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { managePreview } from '../js/ui/manage-preview.js';
import { paperManage, todoTree, growthStage } from '../js/ui/manage.js';
import { at } from '../js/utils/date.js';
const now = at('2026-09-29', '12:00');
test('tree expansion hides descendants and leaf arrows do not change the task list', () => {
  const s = managePreview(now);
  const full = todoTree(s);
  assert.match(full, /자료 조사하기/);
  s.ui.todoExpanded = { report: false };
  assert.doesNotMatch(todoTree(s), /자료 조사하기/);
  s.ui.todoExpanded = { research: true };
  const leaf = todoTree(s);
  assert.equal(
    (full.match(/task-card-body/g) || []).length,
    (leaf.match(/task-card-body/g) || []).length,
  );
  assert.match(leaf, /자료 조사하기 접기/);
});
test('completed children remain reachable through their active parent context', () => {
  const s = managePreview(now);
  s.ui.completed = true;
  s.todos.find((t) => t.id === 'research').status = 'COMPLETED';
  const html = todoTree(s);
  assert.match(html, /자료 조사하기/);
  assert.match(html, /ancestor-context/);
  assert.doesNotMatch(html, /양식 만들기/);
});
test('growth reflects confirmed distinct completion days and approved thresholds', () => {
  assert.deepEqual(
    [
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
      [2, 2],
    ].map(([a, b]) => growthStage(a, b)),
    [1, 2, 3, 4, 4],
  );
  const s = managePreview(now, 'routines');
  s.sessions.push({ ...s.sessions[0] });
  assert.match(paperManage(s, now), /현재 주기 3회 중 2회 완료/);
  assert.match(paperManage(s, now), /growth_growth_3_001/);
});
test('management artwork references resolve for every tab', () => {
  const s = managePreview(now);
  for (const tab of ['todos', 'routines', 'fixed']) {
    s.ui.manage = tab;
    for (const [, path] of paperManage(s, now).matchAll(/src="\/([^"?]+)"/g))
      assert.ok(existsSync(path), path);
  }
  for (const [, path] of readFileSync('css/manage.css', 'utf8').matchAll(/url\('\/([^']+)'\)/g))
    assert.ok(existsSync(path), path);
});
