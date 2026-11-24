import type { DesktopAppId } from '../../services/desktop-apps';
import type { FinderView } from '../../services/desktop-menus';
import { OpenWithChoice } from '../../services/file-opener';
import { MenuEntry } from '../../services/menu';
import { FinderSort } from './finder-model';

/** Finder 的查看方式命令；工具栏与空白处右键的 View 子菜单共用。 */
export function finderViewItems(view: FinderView, pick: (next: FinderView) => void): MenuEntry[] {
  const command = (id: string, label: string, key: string, target: FinderView): MenuEntry => ({
    id,
    label,
    key,
    checked: view === target,
    run: () => pick(target)
  });
  return [
    command('view-icon', 'as Icons', '⌘1', 'icon'),
    command('view-list', 'as List', '⌘2', 'list'),
    command('view-column', 'as Columns', '⌘3', 'column'),
    command('view-gallery', 'as Gallery', '⌘4', 'gallery')
  ];
}

/** Finder 的排序命令；工具栏 Sort 弹出菜单与空白处右键的 Sort By 子菜单共用。 */
export function finderSortCommands(sort: FinderSort, pick: (next: FinderSort) => void): MenuEntry[] {
  const command = (id: string, label: string, target: FinderSort): MenuEntry => ({
    id,
    label,
    checked: sort === target,
    run: () => pick(target)
  });
  return [
    command('sort-name', 'Name', 'name'),
    command('sort-date', 'Date Modified', 'date'),
    command('sort-size', 'Size', 'size'),
    command('sort-kind', 'Kind', 'kind')
  ];
}

/** Open With 子菜单：候选应用直接打开，Other… 走「打开方式」对话框（含 Always Open With）。 */
export function openWithCommands(
  choices: readonly OpenWithChoice[],
  openWith: (id: DesktopAppId) => void,
  other: () => void
): MenuEntry[] {
  return [
    ...choices.map(choice => ({ id: `open-with-${choice.id}`, label: choice.name, run: () => openWith(choice.id) })),
    ...(choices.length ? (['-'] as const) : []),
    { id: 'open-with-other', label: 'Other…', run: other }
  ];
}

/**
 * Tags 子菜单：一种颜色一项，勾选条目已有的标签；点选切换这一种颜色，把整组颜色交给 `pick` 写回。
 * 颜色顺序与侧栏的标签组一致，由调用方（`FINDER_TAG_COLORS`）提供。
 */
export function tagCommands(
  colors: readonly string[],
  tagged: readonly string[],
  pick: (next: readonly string[]) => void
): MenuEntry[] {
  return colors.map(color => {
    const has = tagged.includes(color);
    return {
      id: `tag-${color.toLowerCase()}`,
      /* 存储用小写 TagColor，菜单显示首字母大写（与 macOS 标签名一致）。 */
      label: color.charAt(0).toUpperCase() + color.slice(1),
      checked: has,
      run: () => pick(has ? tagged.filter(item => item !== color) : [...tagged, color])
    };
  });
}

/** Compress 命令的标签：单个条目是 `Compress “名字”`，多个是 `Compress N Items`（与 macOS 一致）。 */
export function compressLabel(names: readonly string[]): string {
  return names.length > 1 ? `Compress ${names.length} Items` : `Compress “${names[0] ?? ''}”`;
}
