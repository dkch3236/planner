let icons = [];
export const validIcon = (path) =>
  typeof path === 'string' && /^icons\/(?:32|48|64|illustrated)\/icon_[a-z0-9_]+\.webp$/.test(path);
export async function loadIcons() {
  const response = await fetch('/public/assets/manifest.json');
  if (!response.ok) throw Error('아이콘 목록을 불러오지 못했습니다. 새로고침해 주세요.');
  const manifest = await response.json();
  icons = manifest.assets.filter((a) => a.category === 'icons' && validIcon(a.path));
}
export function sourceIcon(s, block) {
  const source = (
    block.sourceType === 'TODO'
      ? s.todos
      : block.sourceType === 'ROUTINE'
        ? s.routines
        : s.fixedOccurrences
  ).find((x) => x.id === block.sourceId);
  const icon = source?.icon || block.icon;
  return validIcon(icon) ? icon : null;
}
export function iconPicker(selected = '') {
  return `<details class="icon-picker full"><summary>아이콘 선택 ${validIcon(selected) ? `<img src="/public/assets/${selected}" alt="선택한 아이콘">` : '· 자동 선택'}</summary><div class="icon-options"><label class="icon-option"><input type="radio" name="icon" value="" ${!selected ? 'checked' : ''}><span>자동</span></label>${icons.map((a) => `<label class="icon-option" title="${a.path.split('/').at(-1)}"><input type="radio" name="icon" value="${a.path}" ${a.path === selected ? 'checked' : ''}><img src="/public/assets/${a.path}" alt="${a.path.split('/').at(-1).replace('.webp', '').replaceAll('_', ' ')}" loading="lazy"></label>`).join('')}</div></details>`;
}
