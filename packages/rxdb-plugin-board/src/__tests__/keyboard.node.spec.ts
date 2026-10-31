import type { UUID } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { nextGridFocus, resolveKeyboardMove, type BoardKeyboardColumn } from '../keyboard.js';

const id = (value: string) => value as UUID;

/** 三列：A 列 a1..a3、B 列空、C 列 c1..c2。 */
const grid = [
  { columnId: id('A'), taskIds: [id('a1'), id('a2'), id('a3')] },
  { columnId: id('B'), taskIds: [] },
  { columnId: id('C'), taskIds: [id('c1'), id('c2')] }
];

describe('nextGridFocus（方向键在卡片间移动焦点）', () => {
  it('上下在同列移动，到边界停住', () => {
    expect(nextGridFocus(grid, id('a1'), 'down')).toBe('a2');
    expect(nextGridFocus(grid, id('a2'), 'up')).toBe('a1');
    expect(nextGridFocus(grid, id('a1'), 'up')).toBeNull();
    expect(nextGridFocus(grid, id('a3'), 'down')).toBeNull();
  });

  it('左右跳到最近的非空列、同一行（短列取末张）', () => {
    expect(nextGridFocus(grid, id('a1'), 'right')).toBe('c1');
    expect(nextGridFocus(grid, id('a3'), 'right')).toBe('c2');
    expect(nextGridFocus(grid, id('c2'), 'left')).toBe('a2');
    expect(nextGridFocus(grid, id('a2'), 'left')).toBeNull();
    expect(nextGridFocus(grid, id('c1'), 'right')).toBeNull();
  });

  it('Home / End 到本列首尾；未知卡片无目标', () => {
    expect(nextGridFocus(grid, id('a2'), 'first')).toBe('a1');
    expect(nextGridFocus(grid, id('a2'), 'last')).toBe('a3');
    expect(nextGridFocus(grid, id('zz'), 'down')).toBeNull();
  });
});

describe('resolveKeyboardMove（Alt + 方向键移动卡片）', () => {
  const columns: BoardKeyboardColumn[] = grid.map(column => ({ ...column, visibleIds: column.taskIds }));

  it('同列上移 / 下移到相邻卡片的另一侧，边界零写', () => {
    expect(resolveKeyboardMove(columns, id('a2'), 'up')).toEqual({
      kind: 'between',
      columnId: 'A',
      prevId: null,
      nextId: 'a1'
    });
    expect(resolveKeyboardMove(columns, id('a2'), 'down')).toEqual({
      kind: 'between',
      columnId: 'A',
      prevId: 'a3',
      nextId: null
    });
    expect(resolveKeyboardMove(columns, id('a1'), 'up')).toBeNull();
    expect(resolveKeyboardMove(columns, id('a3'), 'down')).toBeNull();
  });

  it('左右移到相邻列的同一行；相邻空列直接追加；最外侧零写', () => {
    expect(resolveKeyboardMove(columns, id('a1'), 'right')).toEqual({ kind: 'end', columnId: 'B' });
    expect(resolveKeyboardMove(columns, id('c2'), 'left')).toEqual({ kind: 'end', columnId: 'B' });
    expect(resolveKeyboardMove(columns, id('a1'), 'left')).toBeNull();
    expect(resolveKeyboardMove(columns, id('c1'), 'right')).toBeNull();
  });

  it('相邻列同一行插在该卡之前，比目标列长则追加到末尾', () => {
    const twoColumns: BoardKeyboardColumn[] = [columns[0], columns[2]];
    expect(resolveKeyboardMove(twoColumns, id('a2'), 'right')).toEqual({
      kind: 'between',
      columnId: 'C',
      prevId: 'c1',
      nextId: 'c2'
    });
    expect(resolveKeyboardMove(twoColumns, id('a3'), 'right')).toEqual({
      kind: 'between',
      columnId: 'C',
      prevId: 'c2',
      nextId: null
    });
  });

  it('筛选隐藏的卡片：按可见邻居定位，邻居取自完整序列', () => {
    const filtered: BoardKeyboardColumn[] = [
      { columnId: id('A'), taskIds: [id('a1'), id('a2'), id('a3')], visibleIds: [id('a1'), id('a3')] }
    ];
    expect(resolveKeyboardMove(filtered, id('a3'), 'up')).toEqual({
      kind: 'between',
      columnId: 'A',
      prevId: null,
      nextId: 'a1'
    });
  });

  it('被移动卡片自身被筛掉（不在可见序列里）：四个方向都无目标，不抛错', () => {
    const filtered: BoardKeyboardColumn[] = [
      { columnId: id('A'), taskIds: [id('a1'), id('a2')], visibleIds: [id('a1')] },
      { columnId: id('C'), taskIds: [id('c1'), id('c2')], visibleIds: [id('c1'), id('c2')] }
    ];
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      expect(resolveKeyboardMove(filtered, id('a2'), direction)).toBeNull();
    }
  });

  it('目标列全部被筛掉：追加到完整序列末尾', () => {
    const hidden: BoardKeyboardColumn[] = [
      { columnId: id('A'), taskIds: [id('a1')], visibleIds: [id('a1')] },
      { columnId: id('C'), taskIds: [id('c1')], visibleIds: [] }
    ];
    expect(resolveKeyboardMove(hidden, id('a1'), 'right')).toEqual({
      kind: 'between',
      columnId: 'C',
      prevId: 'c1',
      nextId: null
    });
  });
});
