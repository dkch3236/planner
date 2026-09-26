export const children = (todos, id) => todos.filter((t) => t.parentId === id);
export const leaves = (todos, id) => {
  const sub = children(todos, id);
  return sub.length ? sub.flatMap((t) => leaves(todos, t.id)) : todos.filter((t) => t.id === id);
};
export function progress(todos, t) {
  const list = leaves(todos, t.id).filter((x) => x.status !== 'CANCELLED');
  return {
    remaining: list.reduce((a, x) => a + (x.status === 'ACTIVE' ? x.remainingWorkMin : 0), 0),
    total: list.reduce((a, x) => a + x.initialWorkMin, 0),
  };
}
export function depth(todos, t) {
  let n = 0,
    seen = new Set([t.id]);
  while (t.parentId) {
    t = todos.find((x) => x.id === t.parentId);
    if (!t || seen.has(t.id)) break;
    seen.add(t.id);
    n++;
  }
  return n;
}
export const activeLeaves = (s) =>
  s.todos.filter(
    (t) => t.status === 'ACTIVE' && !children(s.todos, t.id).length && t.remainingWorkMin > 0,
  );
export function updateParents(s) {
  for (const t of s.todos.filter((t) => children(s.todos, t.id).length)) {
    const p = progress(s.todos, t);
    t.remainingWorkMin = p.remaining;
    if (t.status !== 'CANCELLED') t.status = p.remaining === 0 ? 'COMPLETED' : 'ACTIVE';
  }
}
