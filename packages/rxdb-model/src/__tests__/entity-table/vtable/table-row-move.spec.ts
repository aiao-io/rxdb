import type * as VTable from '@visactor/vtable';
import { describe, expect, it, vi } from 'vitest';
import { patchDragIconForReadonlyRows } from '../../../entity-table/vtable/table-operations.js';
import {
  isRowDragEnabled,
  readRowMove,
  restoreTableRecords,
  setRowDragEnabled
} from '../../../entity-table/vtable/table-row-move.js';

/** 第 0 行是表头，records[i] 在第 i+1 行 */
const tableOf = (records: Record<string, unknown>[]): VTable.ListTable =>
  ({
    rowCount: records.length + 1,
    getRecordByCell: vi.fn((_col: number, row: number) => (row >= 1 ? records[row - 1] : undefined)),
    renderWithRecreateCells: vi.fn()
  }) as unknown as VTable.ListTable;

const change = (from: number, to: number, movingColumnOrRow: 'row' | 'column' = 'row') => ({
  source: { col: 0, row: from },
  target: { col: 0, row: to },
  movingColumnOrRow
});

describe('readRowMove', () => {
  const table = tableOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

  it('读出落点上的行与前后邻居', () => {
    expect(readRowMove(table, 'id', change(3, 2))).toEqual({ id: 'b', prevId: 'a', nextId: 'c' });
  });

  it('首尾邻居为 null（表头不算邻居）', () => {
    expect(readRowMove(table, 'id', change(3, 1))).toEqual({ id: 'a', prevId: null, nextId: 'b' });
    expect(readRowMove(table, 'id', change(1, 3))).toEqual({ id: 'c', prevId: 'b', nextId: null });
  });

  it('拖列、原位放下、被拖行主键不是字符串时为 null', () => {
    expect(readRowMove(table, 'id', change(1, 2, 'column'))).toBeNull();
    expect(readRowMove(table, 'id', change(2, 2))).toBeNull();
    expect(readRowMove(tableOf([{ id: 1 }, { id: 2 }]), 'id', change(2, 1))).toBeNull();
    expect(readRowMove(table, 'id', change(1, 9))).toBeNull();
  });

  it('按 idField 取主键，非字符串邻居记为 null', () => {
    const custom = tableOf([{ key: 'x' }, { key: 'y' }, { key: 3 }]);
    expect(readRowMove(custom, 'key', change(1, 2))).toEqual({ id: 'y', prevId: 'x', nextId: null });
  });
});

describe('setRowDragEnabled', () => {
  it('默认允许；只在状态变化时重建单元格', () => {
    const table = tableOf([]);
    expect(isRowDragEnabled(table)).toBe(true);
    setRowDragEnabled(table, true);
    expect(table.renderWithRecreateCells).not.toHaveBeenCalled();
    setRowDragEnabled(table, false);
    setRowDragEnabled(table, false);
    expect(isRowDragEnabled(table)).toBe(false);
    expect(table.renderWithRecreateCells).toHaveBeenCalledOnce();
    setRowDragEnabled(table, true);
    expect(isRowDragEnabled(table)).toBe(true);
    expect(table.renderWithRecreateCells).toHaveBeenCalledTimes(2);
  });

  it('关闭后补丁过的 getIcons 对所有行都不给手柄', () => {
    const icons = [{ icon: 'drag' }];
    const original = vi.fn().mockReturnValue(icons);
    const table = Object.assign(tableOf([{ id: 'a' }]), {
      internalProps: { rowSeriesNumberHelper: { getIcons: original } }
    });
    patchDragIconForReadonlyRows(table);
    const getIcons = (
      table as unknown as {
        internalProps: { rowSeriesNumberHelper: { getIcons: (c: number, r: number) => unknown[] } };
      }
    ).internalProps.rowSeriesNumberHelper.getIcons;

    expect(getIcons(0, 1)).toBe(icons);
    setRowDragEnabled(table, false);
    expect(getIcons(0, 1)).toEqual([]);
    setRowDragEnabled(table, true);
    expect(getIcons(0, 1)).toBe(icons);
  });
});

describe('restoreTableRecords', () => {
  it('把被 VTable 原地换位的数组改回提交时的顺序并重绘', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const records = [b, a];
    const setRecords = vi.fn();
    const table = { setRecords } as unknown as VTable.ListTable;
    restoreTableRecords(table, records, [a, b]);
    expect(records).toEqual([a, b]);
    expect(setRecords).toHaveBeenCalledWith(records);
  });
});
