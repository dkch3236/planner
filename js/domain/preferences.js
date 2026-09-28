export const wantsActivity = (source) => Number(source?.desire || 3) >= 4;
export const isRewardTodo = (source) => source?.importance === 'OPTIONAL' && wantsActivity(source);
export function blockPreference(s, block) {
  const source = (block.sourceType === 'TODO' ? s.todos : s.routines).find(
    (x) => x.id === block.sourceId,
  );
  return wantsActivity(source);
}
