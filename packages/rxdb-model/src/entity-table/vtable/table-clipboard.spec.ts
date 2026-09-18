import type * as VTable from '@visactor/vtable';
import { describe, expect, it, vi } from 'vitest';
import {
  applyClipboard,
  applySystemText,
  formatAsTsv,
  snapshotSelection,
  TableClipboardManager,
  type ClipboardCell,
  type ClipboardContent
} from './table-clipboard.js';

// ── helpers ────────────────────────────────────────────────────────────────

type FakeCell = {
  col: number;
  row: number;
  field?: string;
  cellType?: string;
};

function makeTable(
  selectedCells: FakeCell[][],
  records: Record<string, unknown>[],
  cellInfoMap: Record<string, { cellType?: string; field?: string }> = {}
) {
  // getCellInfo 优先用 cellInfoMap，其次从 selectedCells 构建
  const cellByKey = new Map<string, FakeCell>();
  for (const row of selectedCells) {
    for (const cell of row) cellByKey.set(`${cell.col},${cell.row}`, cell);
  }
  return {
    getSelectedCellInfos: vi.fn().mockReturnValue(selectedCells),
    getRecordByCell: vi.fn((col: number, row: number) => records[row - 1]),
    getCellInfo: vi.fn((col: number, row: number) => {
      const key = `${col},${row}`;
      if (cellInfoMap[key]) return cellInfoMap[key];
      const fromSelected = cellByKey.get(key);
      return fromSelected ?
          { cellType: fromSelected.cellType ?? 'text', field: fromSelected.field }
        : { cellType: 'text' };
    })
  } as unknown as VTable.ListTable;
}

// ── formatAsTsv ────────────────────────────────────────────────────────────

describe('formatAsTsv', () => {
  it('serializes single cell', () => {
    const content: ClipboardContent = [[{ col: 1, field: 'name', value: 'Alice', cellType: 'text' }]];
    expect(formatAsTsv(content)).toBe('Alice');
  });

  it('joins columns with tab and rows with newline', () => {
    const content: ClipboardContent = [
      [
        { col: 1, field: 'a', value: 'A1', cellType: 'text' },
        { col: 2, field: 'b', value: 'B1', cellType: 'text' }
      ],
      [
        { col: 1, field: 'a', value: 'A2', cellType: 'text' },
        { col: 2, field: 'b', value: 'B2', cellType: 'text' }
      ]
    ];
    expect(formatAsTsv(content)).toBe('A1\tB1\nA2\tB2');
  });

  it('converts null / undefined values to empty string', () => {
    const content: ClipboardContent = [[{ col: 1, field: 'x', value: null, cellType: 'text' }]];
    expect(formatAsTsv(content)).toBe('');
  });
});

// ── snapshotSelection ──────────────────────────────────────────────────────

describe('snapshotSelection', () => {
  it('returns null when no cells are selected', () => {
    const table = makeTable([], []);
    expect(snapshotSelection(table)).toBeNull();
  });

  it('returns null when only header row is selected (row === 0)', () => {
    const table = makeTable([[{ col: 1, row: 0, field: 'name', cellType: 'text' }]], [{ name: 'Alice' }]);
    expect(snapshotSelection(table)).toBeNull();
  });

  it('skips _ prefix fields', () => {
    const table = makeTable(
      [[{ col: 1, row: 1, field: '_readonly', cellType: 'text' }]],
      [{ _readonly: true, name: 'Alice' }]
    );
    expect(snapshotSelection(table)).toBeNull();
  });

  it('skips readonly records', () => {
    const table = makeTable(
      [[{ col: 1, row: 1, field: 'name', cellType: 'text' }]],
      [{ _readonly: true, name: 'Alice' }]
    );
    expect(snapshotSelection(table)).toBeNull();
  });

  it('captures normal cell values', () => {
    const table = makeTable([[{ col: 1, row: 1, field: 'name', cellType: 'text' }]], [{ name: 'Alice' }]);
    const result = snapshotSelection(table);
    expect(result).not.toBeNull();
    const cell: ClipboardCell = result![0][0];
    expect(cell.field).toBe('name');
    expect(cell.value).toBe('Alice');
    expect(cell.cellType).toBe('text');
  });

  it('captures propertyType from columns when provided', () => {
    const table = makeTable([[{ col: 1, row: 1, field: 'type', cellType: 'text' }]], [{ type: 'foo' }]);
    const columns = [{ _propertyType: 'enum' }];
    const result = snapshotSelection(table, columns as Record<string, unknown>[]);
    expect(result).not.toBeNull();
    expect(result![0][0].propertyType).toBe('enum');
  });

  it('propertyType is undefined when columns not provided', () => {
    const table = makeTable([[{ col: 1, row: 1, field: 'name', cellType: 'text' }]], [{ name: 'Alice' }]);
    const result = snapshotSelection(table);
    expect(result![0][0].propertyType).toBeUndefined();
  });
});

// ── applySystemText ────────────────────────────────────────────────────────

describe('applySystemText', () => {
  it('returns empty array when no cells selected', () => {
    const table = makeTable([], []);
    expect(applySystemText(table, 'foo')).toEqual([]);
  });

  it('writes TSV values to destination cells', () => {
    const record = { id: '1', name: 'old' };
    const table = makeTable([[{ col: 1, row: 1, field: 'name', cellType: 'text' }]], [record]);
    const writes = applySystemText(table, 'new_value');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({ col: 1, row: 1, value: 'new_value', field: 'name', record });
  });

  it('converts text to boolean for switch cells', () => {
    const record = { id: '1', active: false };
    const table = makeTable([[{ col: 1, row: 1, field: 'active', cellType: 'switch' }]], [record], {
      '1,1': { cellType: 'switch', field: 'active' }
    });
    const writes = applySystemText(table, 'true');
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe(true);
  });

  it('converts "false" text to false for switch cells', () => {
    const record = { id: '1', active: true };
    const table = makeTable([[{ col: 1, row: 1, field: 'active', cellType: 'switch' }]], [record], {
      '1,1': { cellType: 'switch', field: 'active' }
    });
    const writes = applySystemText(table, 'false');
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe(false);
  });

  it('skips boolean cells for unrecognized text values', () => {
    const record = { id: '1', active: true };
    const table = makeTable([[{ col: 1, row: 1, field: 'active', cellType: 'switch' }]], [record], {
      '1,1': { cellType: 'switch', field: 'active' }
    });
    const writes = applySystemText(table, 'hello');
    expect(writes).toHaveLength(0);
  });

  it('skips readonly records', () => {
    const record = { id: '1', name: 'locked', _readonly: true };
    const table = makeTable([[{ col: 1, row: 1, field: 'name', cellType: 'text' }]], [record]);
    const writes = applySystemText(table, 'new');
    expect(writes).toHaveLength(0);
  });

  it('cycles clipboard rows when fewer clipboard rows than dest rows', () => {
    const records = [
      { id: '1', name: 'a' },
      { id: '2', name: 'b' }
    ];
    const table = makeTable(
      [[{ col: 1, row: 1, field: 'name', cellType: 'text' }], [{ col: 1, row: 2, field: 'name', cellType: 'text' }]],
      records
    );
    const writes = applySystemText(table, 'X');
    expect(writes).toHaveLength(2);
    expect(writes[0].value).toBe('X');
    expect(writes[1].value).toBe('X');
  });

  it('skips cell when pasted value is not in enum menuList', () => {
    const record = { id: '1', type: 'string' };
    const table = makeTable([[{ col: 1, row: 1, field: 'type', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'type' }
    });
    const columns = [
      {
        field: 'type',
        menuList: [
          { value: 'string', text: 'string' },
          { value: 'number', text: 'number' }
        ]
      }
    ];
    const writes = applySystemText(table, 'invalid_type', columns);
    expect(writes).toHaveLength(0);
  });

  it('allows cell when pasted value is in enum menuList', () => {
    const record = { id: '1', type: 'string' };
    const table = makeTable([[{ col: 1, row: 1, field: 'type', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'type' }
    });
    const columns = [
      {
        field: 'type',
        menuList: [
          { value: 'string', text: 'string' },
          { value: 'number', text: 'number' }
        ]
      }
    ];
    const writes = applySystemText(table, 'number', columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe('number');
  });

  // ── propertyType 验证 ─────────────────────────────────────────────────────

  it.each([
    ['uuid', 'aaaaa'],
    ['number', 'aaaaa'],
    ['integer', 'aaaaa'],
    ['integer', '3.14'],
    ['date', 'aaaaa'],
    ['json', 'TypeDemo'],
    ['keyValue', 'aaaaa'],
    ['keyValue', '[1,2,3]'], // 数组不是 keyValue
    ['stringArray', 'aaaaa'], // 非 JSON
    ['stringArray', '{"a":1}'], // 对象不是数组
    ['stringArray', '[1,2,3]'], // 数字数组不是 stringArray
    ['numberArray', 'aaaaa'], // 非 JSON
    ['numberArray', '["a","b"]'] // 字符串数组不是 numberArray
  ])('skips invalid "%s" value "%s" from system clipboard', (propertyType, pasteText) => {
    const record = { id: '1', val: 'old' };
    const table = makeTable([[{ col: 1, row: 1, field: 'val', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'val' }
    });
    const columns = [{ field: 'val', _propertyType: propertyType }];
    const writes = applySystemText(table, pasteText, columns);
    expect(writes).toHaveLength(0);
  });

  it('converts valid number string to number type', () => {
    const record = { id: '1', val: 0 };
    const table = makeTable([[{ col: 1, row: 1, field: 'val', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'val' }
    });
    const columns = [{ field: 'val', _propertyType: 'number' }];
    const writes = applySystemText(table, '3.14', columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe(3.14);
  });

  it('converts valid integer string to integer type', () => {
    const record = { id: '1', val: 0 };
    const table = makeTable([[{ col: 1, row: 1, field: 'val', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'val' }
    });
    const columns = [{ field: 'val', _propertyType: 'integer' }];
    const writes = applySystemText(table, '42', columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe(42);
  });

  it('allows valid UUID string', () => {
    const record = { id: '1', uid: '' };
    const table = makeTable([[{ col: 1, row: 1, field: 'uid', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'uid' }
    });
    const columns = [{ field: 'uid', _propertyType: 'uuid' }];
    const writes = applySystemText(table, '550e8400-e29b-41d4-a716-446655440000', columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('allows valid date string and keeps it as string', () => {
    const record = { id: '1', ts: null };
    const table = makeTable([[{ col: 1, row: 1, field: 'ts', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'ts' }
    });
    const columns = [{ field: 'ts', _propertyType: 'date' }];
    const writes = applySystemText(table, '2024-01-15T12:00:00', columns);
    expect(writes).toHaveLength(1);
    expect(typeof writes[0].value).toBe('string');
  });

  it('parses valid JSON string for json column', () => {
    const record = { id: '1', data: null };
    const table = makeTable([[{ col: 1, row: 1, field: 'data', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'data' }
    });
    const columns = [{ field: 'data', _propertyType: 'json' }];
    const writes = applySystemText(table, '{"a":1}', columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toEqual({ a: 1 });
  });

  it('parses valid JSON object for keyValue column', () => {
    const record = { id: '1', meta: null };
    const table = makeTable([[{ col: 1, row: 1, field: 'meta', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'meta' }
    });
    const columns = [{ field: 'meta', _propertyType: 'keyValue' }];
    const writes = applySystemText(table, '{"key":"val"}', columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toEqual({ key: 'val' });
  });

  it('parses valid stringArray JSON for stringArray column', () => {
    const record = { id: '1', tags: null };
    const table = makeTable([[{ col: 1, row: 1, field: 'tags', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'tags' }
    });
    const columns = [{ field: 'tags', _propertyType: 'stringArray' }];
    const writes = applySystemText(table, '["a","b","c"]', columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toEqual(['a', 'b', 'c']);
  });

  it('parses valid numberArray JSON for numberArray column', () => {
    const record = { id: '1', scores: null };
    const table = makeTable([[{ col: 1, row: 1, field: 'scores', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'scores' }
    });
    const columns = [{ field: 'scores', _propertyType: 'numberArray' }];
    const writes = applySystemText(table, '[1,2.5,3]', columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toEqual([1, 2.5, 3]);
  });

  it('allows enum value that is in menuList', () => {
    const record = { id: '1', status: 'draft' };
    const table = makeTable([[{ col: 1, row: 1, field: 'status', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'status' }
    });
    const columns = [
      { field: 'status', _propertyType: 'enum', menuList: [{ value: 'draft' }, { value: 'published' }] }
    ];
    const writes = applySystemText(table, 'published', columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe('published');
  });

  it('skips enum value not in menuList', () => {
    const record = { id: '1', status: 'draft' };
    const table = makeTable([[{ col: 1, row: 1, field: 'status', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'status' }
    });
    const columns = [
      { field: 'status', _propertyType: 'enum', menuList: [{ value: 'draft' }, { value: 'published' }] }
    ];
    const writes = applySystemText(table, 'aaaaa', columns);
    expect(writes).toHaveLength(0);
  });

  it('skips any value for enum column without menuList (cannot validate)', () => {
    const record = { id: '1', status: 'draft' };
    const table = makeTable([[{ col: 1, row: 1, field: 'status', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'status' }
    });
    // 无 menuList 的 enum 列不允许任何外部粘贴
    const columns = [{ field: 'status', _propertyType: 'enum' }];
    const writes = applySystemText(table, 'anything', columns);
    expect(writes).toHaveLength(0);
  });

  it.each(['uuid', 'number', 'integer', 'date', 'json', 'keyValue', 'stringArray', 'numberArray'])(
    'allows empty string to clear %s column',
    propertyType => {
      const record = { id: '1', val: 'something' };
      const table = makeTable([[{ col: 1, row: 1, field: 'val', cellType: 'text' }]], [record], {
        '1,1': { cellType: 'text', field: 'val' }
      });
      const columns = [{ field: 'val', _propertyType: propertyType }];
      const writes = applySystemText(table, '', columns);
      // 空字符串应产生写入（清空），而不是被跳过
      expect(writes).toHaveLength(1);
    }
  );
});

// ── applyClipboard ─────────────────────────────────────────────────────────

describe('applyClipboard', () => {
  it('returns empty array when no cells selected', () => {
    const table = makeTable([], []);
    const clipboard: ClipboardContent = [[{ col: 1, field: 'name', value: 'X', cellType: 'text' }]];
    expect(applyClipboard(table, clipboard)).toEqual([]);
  });

  it('writes clipboard value to matching cellType destination', () => {
    const record = { id: '1', name: 'old' };
    const table = makeTable([[{ col: 1, row: 1, field: 'name', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'name' }
    });
    const clipboard: ClipboardContent = [[{ col: 1, field: 'name', value: 'new', cellType: 'text' }]];
    const writes = applyClipboard(table, clipboard);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ col: 1, row: 1, value: 'new', field: 'name', record });
  });

  it('skips cell when cellType does not match', () => {
    const record = { id: '1', active: false };
    const table = makeTable([[{ col: 1, row: 1, field: 'active', cellType: 'switch' }]], [record], {
      '1,1': { cellType: 'switch' }
    });
    const clipboard: ClipboardContent = [[{ col: 1, field: 'active', value: true, cellType: 'text' }]];
    const writes = applyClipboard(table, clipboard);
    expect(writes).toHaveLength(0);
  });

  it('skips cell when value is not in menuList', () => {
    const record = { id: '1', type: 'string' };
    const table = makeTable([[{ col: 1, row: 1, field: 'type', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'type' }
    });
    const columns = [
      {
        field: 'type',
        menuList: [
          { value: 'string', text: 'string' },
          { value: 'number', text: 'number' }
        ]
      }
    ];
    const clipboard: ClipboardContent = [[{ col: 1, field: 'type', value: 'invalid_type', cellType: 'text' }]];
    const writes = applyClipboard(table, clipboard, columns);
    expect(writes).toHaveLength(0);
  });

  it('allows cell when value is in menuList', () => {
    const record = { id: '1', type: 'string' };
    const table = makeTable([[{ col: 1, row: 1, field: 'type', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'type' }
    });
    const columns = [
      {
        field: 'type',
        menuList: [
          { value: 'string', text: 'string' },
          { value: 'number', text: 'number' }
        ]
      }
    ];
    const clipboard: ClipboardContent = [[{ col: 1, field: 'type', value: 'number', cellType: 'text' }]];
    const writes = applyClipboard(table, clipboard, columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe('number');
  });

  it('skips cell when source propertyType is enum and target is stringArray', () => {
    const record = { id: '1', tags: ['a'] };
    const table = makeTable([[{ col: 1, row: 1, field: 'tags', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'tags' }
    });
    const columns = [{ field: 'tags', _propertyType: 'stringArray' }];
    const clipboard: ClipboardContent = [
      [{ col: 1, field: 'type', value: 'active', cellType: 'text', propertyType: 'enum' }]
    ];
    const writes = applyClipboard(table, clipboard, columns);
    expect(writes).toHaveLength(0);
  });

  it('allows cell when source and target have compatible propertyType (number → integer)', () => {
    const record = { id: '1', count: 0 };
    const table = makeTable([[{ col: 1, row: 1, field: 'count', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'count' }
    });
    const columns = [{ field: 'count', _propertyType: 'integer' }];
    const clipboard: ClipboardContent = [
      [{ col: 1, field: 'num', value: 42, cellType: 'text', propertyType: 'number' }]
    ];
    const writes = applyClipboard(table, clipboard, columns);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe(42);
  });

  it('allows paste when source has no propertyType (backward compat)', () => {
    const record = { id: '1', tags: ['a'] };
    const table = makeTable([[{ col: 1, row: 1, field: 'tags', cellType: 'text' }]], [record], {
      '1,1': { cellType: 'text', field: 'tags' }
    });
    const columns = [{ field: 'tags', _propertyType: 'stringArray' }];
    const clipboard: ClipboardContent = [[{ col: 1, field: 'tags', value: 'b', cellType: 'text' }]];
    const writes = applyClipboard(table, clipboard, columns);
    expect(writes).toHaveLength(1);
  });
});

// ── TableClipboardManager ──────────────────────────────────────────────────

describe('TableClipboardManager', () => {
  function makeClipboardTable(cells: FakeCell[][], records: Record<string, unknown>[]) {
    return makeTable(cells, records);
  }

  function stubClipboard(writeText: (text: string) => Promise<void>, readText: () => Promise<string>) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, readText },
      writable: true,
      configurable: true
    });
  }

  it('copy stores content and writes to system clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, vi.fn());

    const mgr = new TableClipboardManager();
    const record = { name: 'Alice' };
    const table = makeClipboardTable([[{ col: 1, row: 1, field: 'name', cellType: 'text' }]], [record]);
    await mgr.copy(table);
    expect(writeText).toHaveBeenCalledWith('Alice');
  });

  it('copy does nothing when selection is empty', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText, vi.fn());

    const mgr = new TableClipboardManager();
    const table = makeClipboardTable([], []);
    await mgr.copy(table);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copy fallback when system clipboard fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    stubClipboard(writeText, vi.fn());

    const mgr = new TableClipboardManager();
    const record = { name: 'Bob' };
    const table = makeClipboardTable([[{ col: 1, row: 1, field: 'name', cellType: 'text' }]], [record]);
    await mgr.copy(table);
  });

  it('paste uses system clipboard when text differs from last copy', async () => {
    const readText = vi.fn().mockResolvedValue('SystemText');
    stubClipboard(vi.fn(), readText);

    const mgr = new TableClipboardManager();
    const record = { name: 'old' };
    const table = makeClipboardTable([[{ col: 1, row: 1, field: 'name', cellType: 'text' }]], [record]);
    const writes = await mgr.paste(table);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe('SystemText');
  });

  it('paste uses internal clipboard when system text matches last copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue('Alice');
    stubClipboard(writeText, readText);

    const mgr = new TableClipboardManager();
    const record = { name: 'Alice' };
    const table = makeClipboardTable([[{ col: 1, row: 1, field: 'name', cellType: 'text' }]], [record]);
    await mgr.copy(table);
    const writes = await mgr.paste(table);
    expect(writes).toHaveLength(1);
    expect(writes[0].value).toBe('Alice');
  });

  it('paste returns empty when no clipboard and no system text', async () => {
    const readText = vi.fn().mockResolvedValue('');
    stubClipboard(vi.fn(), readText);

    const mgr = new TableClipboardManager();
    const table = makeClipboardTable([], []);
    const writes = await mgr.paste(table);
    expect(writes).toHaveLength(0);
  });

  it('paste fallback when system clipboard read fails', async () => {
    const readText = vi.fn().mockRejectedValue(new Error('denied'));
    stubClipboard(vi.fn(), readText);

    const mgr = new TableClipboardManager();
    const table = makeClipboardTable([], []);
    const writes = await mgr.paste(table);
    expect(writes).toHaveLength(0);
  });
});
