import { MenuEntry } from '../../services/menu';
import type { FinderView } from '../../services/desktop-menus';
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
