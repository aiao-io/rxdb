import { describe, expect, it, vi } from 'vitest';

import { MenuCommand, isMenuCommand } from '../../services/menu';
import { finderSortCommands, finderViewItems } from './finder-menus';

const commands = (entries: ReturnType<typeof finderViewItems>): MenuCommand[] =>
  entries.filter(isMenuCommand);

describe('finderViewItems', () => {
  it('四种查看方式带 ⌘1–⌘4，只勾选当前视图', () => {
    const items = commands(finderViewItems('list', vi.fn()));
    expect(items.map(item => [item.label, item.key, item.checked])).toEqual([
      ['as Icons', '⌘1', false],
      ['as List', '⌘2', true],
      ['as Columns', '⌘3', false],
      ['as Gallery', '⌘4', false]
    ]);
  });

  it('执行命令时把目标视图交给调用方', () => {
    const pick = vi.fn();
    const items = commands(finderViewItems('icon', pick));
    items.find(item => item.id === 'view-gallery')?.run?.();
    expect(pick).toHaveBeenCalledExactlyOnceWith('gallery');
  });
});

describe('finderSortCommands', () => {
  it('只勾选当前排序；Kind 排序时 Name 不再被误勾选', () => {
    const items = commands(finderSortCommands('kind', vi.fn()));
    expect(items.map(item => [item.label, item.checked])).toEqual([
      ['Name', false],
      ['Date Modified', false],
      ['Size', false],
      ['Kind', true]
    ]);
  });

  it('执行命令时把目标排序交给调用方', () => {
    const pick = vi.fn();
    const items = commands(finderSortCommands('name', pick));
    items.find(item => item.id === 'sort-date')?.run?.();
    expect(pick).toHaveBeenCalledExactlyOnceWith('date');
  });
});
