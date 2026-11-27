import type { TagColor } from '../../disk/tags';
import type { DesktopAppId } from '../../services/desktop-apps';
import type { FinderView } from '../../services/desktop-menus';
import { OpenWithChoice } from '../../services/file-opener';
import { MenuEntry } from '../../services/menu';
import { FinderSort } from './finder-model';

/** 目录翻译函数：与 `I18n.t` 同形，纯函数按参数传入。 */
export type FinderTranslate = (key: string, params?: Record<string, unknown>) => string;

/** 标签颜色的目录 key（macOS 的七种默认标签）；Tags 子菜单与侧栏标签组共用。 */
export const FINDER_TAG_LABEL_KEYS: Readonly<Record<TagColor, string>> = {
  red: 'apps.finder.tagRed',
  orange: 'apps.finder.tagOrange',
  yellow: 'apps.finder.tagYellow',
  green: 'apps.finder.tagGreen',
  blue: 'apps.finder.tagBlue',
  purple: 'apps.finder.tagPurple',
  gray: 'apps.finder.tagGray'
};

/** Finder 的查看方式命令；工具栏与空白处右键的 View 子菜单共用。 */
export function finderViewItems(view: FinderView, pick: (next: FinderView) => void, t: FinderTranslate): MenuEntry[] {
  const command = (id: string, key: string, shortcut: string, target: FinderView): MenuEntry => ({
    id,
    label: t(key),
    key: shortcut,
    checked: view === target,
    run: () => pick(target)
  });
  return [
    command('view-icon', 'shell.menu.asIcons', '⌘1', 'icon'),
    command('view-list', 'shell.menu.asList', '⌘2', 'list'),
    command('view-column', 'shell.menu.asColumns', '⌘3', 'column'),
    command('view-gallery', 'shell.menu.asGallery', '⌘4', 'gallery')
  ];
}

/** Finder 的排序命令；工具栏 Sort 弹出菜单与空白处右键的 Sort By 子菜单共用。 */
export function finderSortCommands(
  sort: FinderSort,
  pick: (next: FinderSort) => void,
  t: FinderTranslate
): MenuEntry[] {
  const command = (id: string, key: string, target: FinderSort): MenuEntry => ({
    id,
    label: t(key),
    checked: sort === target,
    run: () => pick(target)
  });
  return [
    command('sort-name', 'apps.finder.columnName', 'name'),
    command('sort-date', 'apps.finder.dateModified', 'date'),
    command('sort-size', 'apps.finder.size', 'size'),
    command('sort-kind', 'apps.finder.kind', 'kind')
  ];
}

/** Open With 子菜单：候选应用直接打开，Other… 走「打开方式」对话框（含 Always Open With）。 */
export function openWithCommands(
  choices: readonly OpenWithChoice[],
  openWith: (id: DesktopAppId) => void,
  other: () => void,
  t: FinderTranslate
): MenuEntry[] {
  return [
    ...choices.map(choice => ({
      id: `open-with-${choice.id}`,
      label: choice.nameKey ? t(choice.nameKey) : choice.name,
      run: () => openWith(choice.id)
    })),
    ...(choices.length ? (['-'] as const) : []),
    { id: 'open-with-other', label: t('apps.finder.openWithOther'), run: other }
  ];
}

/**
 * Tags 子菜单：一种颜色一项，勾选条目已有的标签；点选切换这一种颜色，把整组颜色交给 `pick` 写回。
 * 颜色顺序与侧栏的标签组一致，由调用方（`FINDER_TAG_COLORS`）提供。
 */
export function tagCommands(
  colors: readonly string[],
  tagged: readonly string[],
  pick: (next: readonly string[]) => void,
  t: FinderTranslate
): MenuEntry[] {
  return colors.map(color => {
    const has = tagged.includes(color);
    return {
      id: `tag-${color.toLowerCase()}`,
      label: t(FINDER_TAG_LABEL_KEYS[color.toLowerCase() as TagColor]),
      checked: has,
      run: () => pick(has ? tagged.filter(item => item !== color) : [...tagged, color])
    };
  });
}

/** Compress 命令的标签：单个条目是 `Compress “名字”`，多个是 `Compress N Items`（与 macOS 一致）。 */
export function compressLabel(names: readonly string[], t: FinderTranslate): string {
  return names.length > 1 ?
      t('apps.finder.compressMany', { count: names.length })
    : t('apps.finder.compressOne', { name: names[0] ?? '' });
}
