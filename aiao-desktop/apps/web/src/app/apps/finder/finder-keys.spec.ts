import { describe, expect, it } from 'vitest';

import { desktopTestTranslate } from '../../testing/fake-i18n';

import {
  ItemRect,
  gridTarget,
  isDeleteImmediately,
  isGoUp,
  isMoveToTrash,
  itemLabel,
  linearTarget,
  parseGoToFolder,
  shiftRange,
  stemRange
} from './finder-keys';

const key = (init: Partial<KeyboardEvent>) => init as KeyboardEvent;

describe('linearTarget 列表、画廊、分栏里方向键的去向', () => {
  it('竖向（列表、分栏）：上下方向键移动一项，不循环，到头留在原地', () => {
    expect(linearTarget('ArrowDown', 0, 3, 'vertical')).toBe(1);
    expect(linearTarget('ArrowUp', 2, 3, 'vertical')).toBe(1);
    expect(linearTarget('ArrowUp', 0, 3, 'vertical')).toBe(0);
    expect(linearTarget('ArrowDown', 2, 3, 'vertical')).toBe(2);
  });

  it('竖向不响应左右方向键，横向（画廊）不响应上下方向键：留给别的视图逻辑', () => {
    expect(linearTarget('ArrowRight', 0, 3, 'vertical')).toBeNull();
    expect(linearTarget('ArrowDown', 0, 3, 'horizontal')).toBeNull();
    expect(linearTarget('ArrowRight', 0, 3, 'horizontal')).toBe(1);
    expect(linearTarget('ArrowLeft', 1, 3, 'horizontal')).toBe(0);
  });

  it('Home 去第一项，End 去最后一项，与方向无关', () => {
    expect(linearTarget('Home', 2, 4, 'vertical')).toBe(0);
    expect(linearTarget('End', 0, 4, 'horizontal')).toBe(3);
  });

  it('没有当前项（at 为 -1）：向下 / 向右去第一项，向上 / 向左去最后一项', () => {
    expect(linearTarget('ArrowDown', -1, 3, 'vertical')).toBe(0);
    expect(linearTarget('ArrowUp', -1, 3, 'vertical')).toBe(2);
    expect(linearTarget('ArrowRight', -1, 3, 'horizontal')).toBe(0);
  });

  it('没有任何项时返回 null；不是导航键也返回 null', () => {
    expect(linearTarget('ArrowDown', -1, 0, 'vertical')).toBeNull();
    expect(linearTarget('Enter', 0, 3, 'vertical')).toBeNull();
    expect(linearTarget('a', 0, 3, 'vertical')).toBeNull();
  });
});

/** 三列两行的图标网格，每个图标 100×100，列间距 10、行间距 20。 */
const GRID: readonly ItemRect[] = [0, 1].flatMap(row =>
  [0, 1, 2].map(col => ({ x: col * 110, y: row * 120, width: 100, height: 100 }))
);

describe('gridTarget 图标视图里方向键按几何找邻居', () => {
  it('左右方向键去文档顺序里的前一个、后一个（行尾接下一行行首）', () => {
    expect(gridTarget('ArrowRight', 0, GRID)).toBe(1);
    expect(gridTarget('ArrowRight', 2, GRID)).toBe(3);
    expect(gridTarget('ArrowLeft', 3, GRID)).toBe(2);
    expect(gridTarget('ArrowLeft', 0, GRID)).toBe(0);
    expect(gridTarget('ArrowRight', 5, GRID)).toBe(5);
  });

  it('上下方向键去上一行、下一行里水平位置最接近的图标', () => {
    expect(gridTarget('ArrowDown', 0, GRID)).toBe(3);
    expect(gridTarget('ArrowDown', 1, GRID)).toBe(4);
    expect(gridTarget('ArrowUp', 5, GRID)).toBe(2);
  });

  it('最后一行不够长时，向下落在水平位置最接近的图标上；到头留在原地', () => {
    const short = GRID.slice(0, 4);
    expect(gridTarget('ArrowDown', 2, short)).toBe(3);
    expect(gridTarget('ArrowDown', 3, short)).toBe(3);
    expect(gridTarget('ArrowUp', 1, short)).toBe(1);
  });

  it('Home 与 End 去第一个、最后一个；其他按键返回 null', () => {
    expect(gridTarget('Home', 4, GRID)).toBe(0);
    expect(gridTarget('End', 0, GRID)).toBe(5);
    expect(gridTarget('Enter', 0, GRID)).toBeNull();
  });

  it('没有当前项（at 为 -1）：向下 / 向右去第一个，向上 / 向左去最后一个；没有图标返回 null', () => {
    expect(gridTarget('ArrowDown', -1, GRID)).toBe(0);
    expect(gridTarget('ArrowRight', -1, GRID)).toBe(0);
    expect(gridTarget('ArrowUp', -1, GRID)).toBe(5);
    expect(gridTarget('ArrowLeft', -1, GRID)).toBe(5);
    expect(gridTarget('ArrowDown', -1, [])).toBeNull();
  });
});

describe('isGoUp 回到上一级目录的按键', () => {
  it('Backspace，以及 ⌘↑ / Ctrl+↑', () => {
    expect(isGoUp(key({ key: 'Backspace' }))).toBe(true);
    expect(isGoUp(key({ key: 'ArrowUp', metaKey: true }))).toBe(true);
    expect(isGoUp(key({ key: 'ArrowUp', ctrlKey: true }))).toBe(true);
  });

  it('单独的 ↑ 是移动选择，不是回上一级；别的键也不是', () => {
    expect(isGoUp(key({ key: 'ArrowUp' }))).toBe(false);
    expect(isGoUp(key({ key: 'Delete' }))).toBe(false);
    expect(isGoUp(key({ key: 'ArrowDown', metaKey: true }))).toBe(false);
  });
});

describe('isMoveToTrash Finder 移到废纸篓的快捷键', () => {
  it('识别 macOS 的 Meta+Backspace 与 Delete', () => {
    expect(isMoveToTrash(key({ key: 'Backspace', metaKey: true }))).toBe(true);
    expect(isMoveToTrash(key({ key: 'Delete', metaKey: true }))).toBe(true);
    expect(isMoveToTrash(key({ key: 'Backspace', ctrlKey: true }))).toBe(true);
  });

  it('不把普通返回、Shift 组合或没有修饰键的 Delete 当成移入废纸篓', () => {
    expect(isMoveToTrash(key({ key: 'Backspace' }))).toBe(false);
    expect(isMoveToTrash(key({ key: 'Delete' }))).toBe(false);
    expect(isMoveToTrash(key({ key: 'Backspace', metaKey: true, shiftKey: true }))).toBe(false);
  });
});

describe('isDeleteImmediately 跳过废纸篓直接删的快捷键', () => {
  it('识别 ⌥⌘⌫（Meta+Alt+Backspace 与 Delete）', () => {
    expect(isDeleteImmediately(key({ key: 'Backspace', metaKey: true, altKey: true }))).toBe(true);
    expect(isDeleteImmediately(key({ key: 'Delete', metaKey: true, altKey: true }))).toBe(true);
    expect(isDeleteImmediately(key({ key: 'Backspace', ctrlKey: true, altKey: true }))).toBe(true);
  });

  it('不带 Alt、带 Shift、或没有修饰键都不算', () => {
    expect(isDeleteImmediately(key({ key: 'Backspace', metaKey: true }))).toBe(false);
    expect(isDeleteImmediately(key({ key: 'Backspace', metaKey: true, altKey: true, shiftKey: true }))).toBe(false);
    expect(isDeleteImmediately(key({ key: 'Backspace', altKey: true }))).toBe(false);
  });
});

describe('shiftRange Shift 连选的区间', () => {
  const names = ['a', 'b', 'c', 'd', 'e'];

  it('以锚点为起点到点击项为止（向前向后都可以）', () => {
    expect(shiftRange(names, ['b'], 'd', 'b')).toEqual(['b', 'c', 'd']);
    expect(shiftRange(names, ['d'], 'b', 'd')).toEqual(['b', 'c', 'd']);
  });

  it('没有锚点时退回当前选择的第一项', () => {
    expect(shiftRange(names, ['b', 'c'], 'e', null)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('锚点或点击项不在列表里时只选点击项自己', () => {
    expect(shiftRange(names, ['x'], 'c', 'x')).toEqual(['c']);
    expect(shiftRange(names, ['a'], 'x', 'a')).toEqual(['x']);
  });
});

describe('stemRange 就地改名只选主名', () => {
  it('有扩展名时选到最后一个扩展名前；点开头的隐藏文件没有扩展名', () => {
    expect(stemRange('report.txt', false)).toEqual([0, 6]);
    expect(stemRange('a.tar.gz', false)).toEqual([0, 5]);
    expect(stemRange('.env', false)).toEqual([0, 4]);
    expect(stemRange('folder.name', false)).toEqual([0, 6]);
  });

  it('没有扩展名与程序包都是全选', () => {
    expect(stemRange('notes', false)).toEqual([0, 5]);
    expect(stemRange('Safari.app', true)).toEqual([0, 10]);
  });
});

describe('parseGoToFolder 「前往文件夹」输入框的路径解析', () => {
  it('接受 ~、~/…、绝对路径与带卷名的写法', () => {
    expect(parseGoToFolder('~')).toEqual(['Users', 'stevejobs']);
    expect(parseGoToFolder('~/Documents')).toEqual(['Users', 'stevejobs', 'Documents']);
    expect(parseGoToFolder('/Users/a/Docs')).toEqual(['Users', 'a', 'Docs']);
    expect(parseGoToFolder('Macintosh HD/Users/a')).toEqual(['Users', 'a']);
    expect(parseGoToFolder('  macintosh hd/System  ')).toEqual(['System']);
  });

  it('相对路径、Trash 与空输入解析不了，返回 null', () => {
    expect(parseGoToFolder('Documents')).toBeNull();
    expect(parseGoToFolder('Trash')).toBeNull();
    expect(parseGoToFolder('')).toBeNull();
    expect(parseGoToFolder('   ')).toBeNull();
  });
});

describe('itemLabel 条目的无障碍名称', () => {
  it('名称加种类：读屏在按 Enter 之前就知道它是文件夹还是文件', () => {
    expect(itemLabel({ name: 'Documents', kind: 'folder', k: 'Folder' }, desktopTestTranslate)).toBe(
      'Documents, Folder'
    );
    expect(itemLabel({ name: 'todo.md', kind: 'file', k: 'Markdown' }, desktopTestTranslate)).toBe('todo.md, Markdown');
  });

  it('没有种类说明时，文件夹说 Folder、文件说 Document', () => {
    expect(itemLabel({ name: 'a', kind: 'folder', k: '' }, desktopTestTranslate)).toBe('a, Folder');
    expect(itemLabel({ name: 'b', kind: 'file', k: '' }, desktopTestTranslate)).toBe('b, Document');
  });
});
