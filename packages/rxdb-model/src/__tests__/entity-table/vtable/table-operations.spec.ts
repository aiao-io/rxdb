import type * as VTable from '@visactor/vtable';
import type { ListTableConstructorOptions } from '@visactor/vtable';
import { describe, expect, it, vi } from 'vitest';
import {
  collectReorderedIds,
  patchDragIconForReadonlyRows,
  updateTableRecords
} from '../../../entity-table/vtable/table-operations.js';

type TableColumns = NonNullable<ListTableConstructorOptions['columns']>;

// ── patchDragIconForReadonlyRows ────────────────────────────────────────────

describe('patchDragIconForReadonlyRows', () => {
  it('returns empty array for readonly records', () => {
    const original = vi.fn().mockReturnValue([{ icon: 'drag' }]);
    const table = {
      getRecordByCell: vi.fn().mockReturnValue({ _readonly: true }),
      internalProps: { rowSeriesNumberHelper: { getIcons: original } }
    } as unknown as VTable.ListTable;

    patchDragIconForReadonlyRows(table);

    const patched = (
      table as unknown as { internalProps: { rowSeriesNumberHelper: { getIcons: (...args: unknown[]) => unknown[] } } }
    )['internalProps'].rowSeriesNumberHelper.getIcons;
    expect(patched(0, 1)).toEqual([]);
    expect(original).not.toHaveBeenCalled();
  });

  it('returns empty array for addRow records', () => {
    const original = vi.fn().mockReturnValue([{ icon: 'drag' }]);
    const table = {
      getRecordByCell: vi.fn().mockReturnValue({ _isAddRow: true }),
      internalProps: { rowSeriesNumberHelper: { getIcons: original } }
    } as unknown as VTable.ListTable;

    patchDragIconForReadonlyRows(table);

    const patched = (
      table as unknown as { internalProps: { rowSeriesNumberHelper: { getIcons: (...args: unknown[]) => unknown[] } } }
    )['internalProps'].rowSeriesNumberHelper.getIcons;
    expect(patched(0, 1)).toEqual([]);
  });

  it('delegates to original for normal records', () => {
    const icons = [{ icon: 'drag' }];
    const original = vi.fn().mockReturnValue(icons);
    const table = {
      getRecordByCell: vi.fn().mockReturnValue({ id: '1', name: 'test' }),
      internalProps: { rowSeriesNumberHelper: { getIcons: original } }
    } as unknown as VTable.ListTable;

    patchDragIconForReadonlyRows(table);

    const patched = (
      table as unknown as { internalProps: { rowSeriesNumberHelper: { getIcons: (...args: unknown[]) => unknown[] } } }
    )['internalProps'].rowSeriesNumberHelper.getIcons;
    expect(patched(0, 1)).toBe(icons);
    expect(original).toHaveBeenCalledOnce();
  });

  it('warns and does nothing when rowSeriesNumberHelper is absent', () => {
    const table = {
      getRecordByCell: vi.fn(),
      internalProps: {}
    } as unknown as VTable.ListTable;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    expect(() => patchDragIconForReadonlyRows(table)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rowSeriesNumberHelper not found'));
    warnSpy.mockRestore();
  });
});

// ── collectReorderedIds ──────────────────────────────────────────────────────

describe('collectReorderedIds', () => {
  it('collects ids for non-readonly rows', () => {
    const records = [{ id: 'a', _readonly: false }, { id: 'b', _isAddRow: true }, { id: 'c' }];
    const table = {
      rowCount: 4,
      getRecordByCell: vi.fn((_col: number, row: number) => records[row - 1])
    } as unknown as VTable.ListTable;

    expect(collectReorderedIds(table, 'id')).toEqual(['a', 'c']);
  });

  it('returns empty array when no data rows', () => {
    const table = {
      rowCount: 1,
      getRecordByCell: vi.fn()
    } as unknown as VTable.ListTable;

    expect(collectReorderedIds(table, 'id')).toEqual([]);
  });

  it('skips records where id is not a string', () => {
    const table = {
      rowCount: 2,
      getRecordByCell: vi.fn().mockReturnValue({ id: 123 })
    } as unknown as VTable.ListTable;

    expect(collectReorderedIds(table, 'id')).toEqual([]);
  });
});

// ── updateTableRecords ───────────────────────────────────────────────────────

describe('updateTableRecords', () => {
  it('preserves column widths by field name', () => {
    const setColWidth = vi.fn();
    const table = {
      colCount: 3,
      getColWidth: vi.fn((col: number) => (col === 1 ? 120 : 200)),
      setRecords: vi.fn(),
      updateColumns: vi.fn(),
      setColWidth
    } as unknown as VTable.ListTable;

    const columns = [{ field: 'name' }, { field: 'age' }] as TableColumns;
    updateTableRecords(table, [{ id: '1' }] as Record<string, unknown>[], columns, columns);

    expect(table.setRecords).toHaveBeenCalledWith([{ id: '1' }]);
    expect(table.updateColumns).toHaveBeenCalledWith(columns);
    // After updateColumns, colCount is still 3, so widths restored
    expect(setColWidth).toHaveBeenCalledWith(1, 120);
    expect(setColWidth).toHaveBeenCalledWith(2, 200);
  });

  it('handles missing field gracefully', () => {
    const table = {
      colCount: 2,
      getColWidth: vi.fn().mockReturnValue(100),
      setRecords: vi.fn(),
      updateColumns: vi.fn(),
      setColWidth: vi.fn()
    } as unknown as VTable.ListTable;

    const columns = [{/* no field */}] as TableColumns;
    expect(() => updateTableRecords(table, [], columns, columns)).not.toThrow();
  });

  it('uses prevColumns for width snapshot when columns change', () => {
    const setColWidth = vi.fn();
    const table = {
      colCount: 3,
      getColWidth: vi.fn((col: number) => (col === 1 ? 150 : 250)),
      setRecords: vi.fn(),
      updateColumns: vi.fn(),
      setColWidth
    } as unknown as VTable.ListTable;

    const oldColumns = [{ field: 'name' }, { field: 'age' }] as TableColumns;
    const newColumns = [{ field: 'age' }, { field: 'name' }] as TableColumns;
    updateTableRecords(table, [], oldColumns, newColumns);

    // age was col=2 (width=250), now col=1 → restored to 250
    expect(setColWidth).toHaveBeenCalledWith(1, 250);
    // name was col=1 (width=150), now col=2 → restored to 150
    expect(setColWidth).toHaveBeenCalledWith(2, 150);
  });
});
