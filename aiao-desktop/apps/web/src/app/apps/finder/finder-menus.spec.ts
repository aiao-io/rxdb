import { describe, expect, it, vi } from 'vitest';

import { MenuCommand, isMenuCommand } from '../../services/menu';
import { finderSortCommands, finderViewItems, openWithCommands } from './finder-menus';

const commands = (entries: ReturnType<typeof finderViewItems>): MenuCommand[] => entries.filter(isMenuCommand);

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

describe('openWithCommands', () => {
  it('候选应用排在前面，每个都带 run；Other… 恒在末尾，前面有候选时才加分隔线', () => {
    const openWith = vi.fn();
    const other = vi.fn();
    const items = openWithCommands(
      [
        { id: 'safari', name: 'Safari' },
        { id: 'textedit', name: 'TextEdit' }
      ],
      openWith,
      other
    );
    expect(items).toHaveLength(4);
    const commands = items.filter(isMenuCommand);
    expect(commands.map(item => item.label)).toEqual(['Safari', 'TextEdit', 'Other…']);
    commands.find(item => item.id === 'open-with-safari')?.run?.();
    expect(openWith).toHaveBeenCalledExactlyOnceWith('safari');
    commands.find(item => item.id === 'open-with-other')?.run?.();
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('没有候选应用时只有 Other…，没有分隔线', () => {
    const items = openWithCommands([], vi.fn(), vi.fn());
    expect(items).toEqual([{ id: 'open-with-other', label: 'Other…', run: expect.any(Function) }]);
  });
});
