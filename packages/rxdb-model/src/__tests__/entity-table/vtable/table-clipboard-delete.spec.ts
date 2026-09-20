import type * as VTable from '@visactor/vtable';
import { describe, expect, it, vi } from 'vitest';
import { collectDeleteWrites } from '../../../entity-table/vtable/table-clipboard.js';

// ── helpers ────────────────────────────────────────────────────────────────

type FakeCell = { col: number; row: number; field?: string };

function makeDeleteTable(selectedCells: FakeCell[][], records: Record<string, unknown>[]) {
  return {
    getSelectedCellInfos: vi.fn().mockReturnValue(selectedCells),
    getRecordByCell: vi.fn((_col: number, row: number) => records[row - 1])
  } as unknown as VTable.ListTable;
}

// ── collectDeleteWrites ─────────────────────────────────────────────────────

describe('collectDeleteWrites', () => {
  it('returns empty when no cells selected', () => {
    const table = makeDeleteTable([], []);
    const columns = [{ field: 'name', cellType: 'text' }];
    const result = collectDeleteWrites(table, columns, new Set());
    expect(result.writes).toEqual([]);
    expect(result.boolCells).toEqual([]);
  });

  it('collects write for text cell', () => {
    const record = { name: 'Alice' };
    const table = makeDeleteTable([[{ col: 1, row: 1, field: 'name' }]], [record]);
    const columns = [{ field: 'name', cellType: 'text' }];
    const result = collectDeleteWrites(table, columns, new Set());
    expect(result.writes).toEqual([{ col: 1, row: 1, value: '', field: 'name', record }]);
    expect(result.boolCells).toEqual([]);
  });

  it('collects boolCell for switch cell', () => {
    const record = { active: true };
    const table = makeDeleteTable([[{ col: 1, row: 1 }]], [record]);
    const columns = [{ field: 'active', cellType: 'switch' }];
    const result = collectDeleteWrites(table, columns, new Set());
    expect(result.writes).toEqual([{ col: 1, row: 1, value: false, field: 'active', record }]);
    expect(result.boolCells).toEqual([{ col: 1, row: 1 }]);
  });

  it('skips readonly records', () => {
    const table = makeDeleteTable([[{ col: 1, row: 1 }]], [{ name: 'locked', _readonly: true }]);
    const columns = [{ field: 'name', cellType: 'text' }];
    const result = collectDeleteWrites(table, columns, new Set());
    expect(result.writes).toEqual([]);
  });

  it('skips addRow records', () => {
    const table = makeDeleteTable([[{ col: 1, row: 1 }]], [{ name: '', _isAddRow: true }]);
    const columns = [{ field: 'name', cellType: 'text' }];
    const result = collectDeleteWrites(table, columns, new Set());
    expect(result.writes).toEqual([]);
  });

  it('skips header row (row === 0)', () => {
    const table = makeDeleteTable([[{ col: 1, row: 0 }]], [{ name: 'test' }]);
    const columns = [{ field: 'name', cellType: 'text' }];
    const result = collectDeleteWrites(table, columns, new Set());
    expect(result.writes).toEqual([]);
  });

  it('skips _ prefix fields', () => {
    const table = makeDeleteTable([[{ col: 1, row: 1 }]], [{ _internal: 'x' }]);
    const columns = [{ field: '_internal', cellType: 'text' }];
    const result = collectDeleteWrites(table, columns, new Set());
    expect(result.writes).toEqual([]);
  });

  it('skips nonClearable fields', () => {
    const table = makeDeleteTable([[{ col: 1, row: 1 }]], [{ name: 'keep' }]);
    const columns = [{ field: 'name', cellType: 'text' }];
    const result = collectDeleteWrites(table, columns, new Set(['name']));
    expect(result.writes).toEqual([]);
  });

  it('respects cellClearable callback returning false', () => {
    const table = makeDeleteTable([[{ col: 1, row: 1 }]], [{ name: 'custom' }]);
    const columns = [{ field: 'name', cellType: 'text' }];
    const cellClearable = vi.fn().mockReturnValue(false);
    const result = collectDeleteWrites(table, columns, new Set(), cellClearable);
    expect(result.writes).toEqual([]);
    expect(cellClearable).toHaveBeenCalledWith({ name: 'custom' }, 'name');
  });

  it('allows clearing when cellClearable returns true', () => {
    const table = makeDeleteTable([[{ col: 1, row: 1 }]], [{ name: 'clearable' }]);
    const columns = [{ field: 'name', cellType: 'text' }];
    const cellClearable = vi.fn().mockReturnValue(true);
    const result = collectDeleteWrites(table, columns, new Set(), cellClearable);
    expect(result.writes).toHaveLength(1);
  });

  it('skips already-clear text cells', () => {
    const table = makeDeleteTable([[{ col: 1, row: 1 }]], [{ name: '' }]);
    const columns = [{ field: 'name', cellType: 'text' }];
    const result = collectDeleteWrites(table, columns, new Set());
    expect(result.writes).toEqual([]);
  });

  it('skips already-clear null cells', () => {
    const table = makeDeleteTable([[{ col: 1, row: 1 }]], [{ name: null }]);
    const columns = [{ field: 'name', cellType: 'text' }];
    const result = collectDeleteWrites(table, columns, new Set());
    expect(result.writes).toEqual([]);
  });

  it('reports boolCells even when already false', () => {
    const table = makeDeleteTable([[{ col: 1, row: 1 }]], [{ active: false }]);
    const columns = [{ field: 'active', cellType: 'switch' }];
    const result = collectDeleteWrites(table, columns, new Set());
    expect(result.writes).toEqual([]);
    expect(result.boolCells).toEqual([{ col: 1, row: 1 }]);
  });
});
