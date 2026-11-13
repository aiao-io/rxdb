import { describe, expect, it } from 'vitest';

import { ItemRect, gridTarget, isGoUp, itemLabel, linearTarget } from './finder-keys';

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
  const key = (init: Partial<KeyboardEvent>) => init as KeyboardEvent;

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

describe('itemLabel 条目的无障碍名称', () => {
  it('名称加种类：读屏在按 Enter 之前就知道它是文件夹还是文件', () => {
    expect(itemLabel({ name: 'Documents', kind: 'folder', k: 'Folder' })).toBe('Documents, Folder');
    expect(itemLabel({ name: 'todo.md', kind: 'file', k: 'Markdown' })).toBe('todo.md, Markdown');
  });

  it('没有种类说明时，文件夹说 Folder、文件说 Document', () => {
    expect(itemLabel({ name: 'a', kind: 'folder', k: '' })).toBe('a, Folder');
    expect(itemLabel({ name: 'b', kind: 'file', k: '' })).toBe('b, Document');
  });
});
