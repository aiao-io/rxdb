// @vitest-environment happy-dom
import type * as VTable from '@visactor/vtable';
import { describe, expect, it, vi } from 'vitest';
import {
  ROW_SERIES_COL_OFFSET,
  changeCellValue,
  completeTableEdit,
  getTableContainer,
  isTableEditing,
  setCellSwitchState
} from './vtable-compat.js';

function makeTable(overrides: Record<string, unknown> = {}): VTable.ListTable {
  return {
    setCellSwitchState: vi.fn(),
    changeCellValue: vi.fn(),
    editorManager: { editingEditor: null, editCell: vi.fn(), completeEdit: vi.fn() },
    getContainer: vi.fn().mockReturnValue(document.createElement('div')),
    ...overrides
  } as unknown as VTable.ListTable;
}

describe('ROW_SERIES_COL_OFFSET', () => {
  it('equals 1', () => {
    expect(ROW_SERIES_COL_OFFSET).toBe(1);
  });
});

describe('setCellSwitchState', () => {
  it('delegates to table.setCellSwitchState', () => {
    const table = makeTable();
    setCellSwitchState(table, 2, 3, true);
    expect((table as unknown as Record<string, ReturnType<typeof vi.fn>>).setCellSwitchState).toHaveBeenCalledWith(
      2,
      3,
      true
    );
  });

  it('does nothing when setCellSwitchState is absent', () => {
    const table = makeTable({ setCellSwitchState: undefined });
    expect(() => setCellSwitchState(table, 2, 3, true)).not.toThrow();
  });
});

describe('getTableContainer', () => {
  it('returns the container element', () => {
    const el = document.createElement('div');
    const table = makeTable({ getContainer: vi.fn().mockReturnValue(el) });
    expect(getTableContainer(table)).toBe(el);
  });

  it('returns undefined when getContainer is absent', () => {
    const table = makeTable({ getContainer: undefined });
    expect(getTableContainer(table)).toBeUndefined();
  });
});

describe('isTableEditing', () => {
  it('returns false when editingEditor is null', () => {
    const table = makeTable();
    expect(isTableEditing(table)).toBe(false);
  });

  it('returns true when editingEditor is set', () => {
    const table = makeTable({ editorManager: { editingEditor: {} } });
    expect(isTableEditing(table)).toBe(true);
  });

  it('returns false when editorManager is absent', () => {
    const table = makeTable({ editorManager: undefined });
    expect(isTableEditing(table)).toBe(false);
  });
});

describe('completeTableEdit', () => {
  it('calls completeEdit when editCell exists', () => {
    const completeEdit = vi.fn();
    const table = makeTable({ editorManager: { editCell: vi.fn(), completeEdit } });
    completeTableEdit(table);
    expect(completeEdit).toHaveBeenCalledOnce();
  });

  it('does nothing when editCell is absent', () => {
    const completeEdit = vi.fn();
    const table = makeTable({ editorManager: { completeEdit } });
    completeTableEdit(table);
    expect(completeEdit).not.toHaveBeenCalled();
  });

  it('does nothing when editorManager is absent', () => {
    const table = makeTable({ editorManager: undefined });
    expect(() => completeTableEdit(table)).not.toThrow();
  });
});

describe('changeCellValue', () => {
  it('delegates to table.changeCellValue with suppress flags', () => {
    const table = makeTable();
    changeCellValue(table, 1, 2, 'hello');
    expect((table as unknown as Record<string, ReturnType<typeof vi.fn>>).changeCellValue).toHaveBeenCalledWith(
      1,
      2,
      'hello',
      false,
      false
    );
  });

  it('does nothing when changeCellValue is absent', () => {
    const table = makeTable({ changeCellValue: undefined });
    expect(() => changeCellValue(table, 1, 2, 'hello')).not.toThrow();
  });
});
