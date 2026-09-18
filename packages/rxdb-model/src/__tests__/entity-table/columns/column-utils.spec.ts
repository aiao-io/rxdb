// @vitest-environment happy-dom
import type { StylePropertyFunctionArg } from '@visactor/vtable/es/ts-types/index.js';
import { describe, expect, it, vi } from 'vitest';
import {
  actionsColumn,
  buildPropertyColumn,
  disabledEditorForReadonly,
  formatDateValue,
  getCellRecord,
  isReadonly,
  isReadonlyOrAddRow,
  makeDeleteIcons,
  makeEditorForReadonly,
  makeViewIcons,
  parsePropertyColumnValue,
  switchDisabledForReadonly
} from '../../../entity-table/columns/column-utils.js';
import { EnumEditor } from '../../../entity-table/editors/enum-editor.js';
import { RelationEditor } from '../../../entity-table/editors/relation-editor.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeArgs(record: Record<string, unknown>): StylePropertyFunctionArg {
  return {
    col: 1,
    row: 1,
    table: {
      getRecordByCell: vi.fn().mockReturnValue(record)
    }
  } as unknown as StylePropertyFunctionArg;
}

// ── isReadonly ─────────────────────────────────────────────────────────────

describe('isReadonly', () => {
  it('returns true when _readonly is true', () => {
    expect(isReadonly({ _readonly: true })).toBe(true);
  });

  it('returns false when _readonly is false', () => {
    expect(isReadonly({ _readonly: false })).toBe(false);
  });

  it('returns false when _readonly is absent', () => {
    expect(isReadonly({})).toBe(false);
  });

  it('returns false for null / undefined', () => {
    expect(isReadonly(null)).toBe(false);
    expect(isReadonly(undefined)).toBe(false);
  });
});

// ── isReadonlyOrAddRow ─────────────────────────────────────────────────────

describe('isReadonlyOrAddRow', () => {
  it('returns true for readonly record', () => {
    expect(isReadonlyOrAddRow({ _readonly: true })).toBe(true);
  });

  it('returns true for addRow record', () => {
    expect(isReadonlyOrAddRow({ _isAddRow: true })).toBe(true);
  });

  it('returns false for normal record', () => {
    expect(isReadonlyOrAddRow({ name: 'foo' })).toBe(false);
  });

  it('returns false for null / undefined', () => {
    expect(isReadonlyOrAddRow(null)).toBe(false);
    expect(isReadonlyOrAddRow(undefined)).toBe(false);
  });
});

// ── getCellRecord ──────────────────────────────────────────────────────────

describe('getCellRecord', () => {
  it('returns the record from table.getRecordByCell', () => {
    const record = { id: '1', name: 'test' };
    const args = makeArgs(record);
    expect(getCellRecord(args)).toEqual(record);
  });

  it('returns undefined when table is missing', () => {
    const args = { col: 1, row: 1 } as unknown as StylePropertyFunctionArg;
    expect(getCellRecord(args)).toBeUndefined();
  });
});

// ── makeDeleteIcons ────────────────────────────────────────────────────────

describe('makeDeleteIcons', () => {
  it('returns an array of two icon options with given label', () => {
    const icons = makeDeleteIcons('Delete');
    expect(icons).toHaveLength(2);
    const [svgIcon, textIcon] = icons as { name: string; type: string; content?: string }[];
    expect(svgIcon.type).toBe('svg');
    expect(svgIcon.name).toBe('delete-action');
    expect(textIcon.type).toBe('text');
    expect(textIcon.content).toBe('Delete');
  });

  it('resolves delete color from current CSS variables', () => {
    document.documentElement.style.setProperty('--entity-table-delete', 'rgb(10, 20, 30)');

    const icons = makeDeleteIcons('Delete') as Array<{ svg?: string; style?: { fill?: string } }>;

    expect(icons[0].svg).toContain('stroke="rgb(10, 20, 30)"');
    expect(icons[1].style?.fill).toBe('rgb(10, 20, 30)');

    document.documentElement.style.removeProperty('--entity-table-delete');
  });

  it('reads computed style once when falling back to error color', () => {
    document.documentElement.style.setProperty('--color-error', 'rgb(10, 20, 30)');

    const spy = vi.spyOn(window, 'getComputedStyle');
    const icons = makeDeleteIcons('Delete') as Array<{ svg?: string; style?: { fill?: string } }>;

    expect(spy).toHaveBeenCalledOnce();
    expect(icons[0].svg).toContain('stroke="rgb(10, 20, 30)"');
    expect(icons[1].style?.fill).toBe('rgb(10, 20, 30)');

    spy.mockRestore();
    document.documentElement.style.removeProperty('--color-error');
  });

  it('falls back to the default delete color when CSS value contains quotes', () => {
    document.documentElement.style.setProperty('--entity-table-delete', 'red" onclick="alert(1)');

    const icons = makeDeleteIcons('Delete') as Array<{ svg?: string; style?: { fill?: string } }>;

    expect(icons[0].svg).toContain('stroke="#ef4444"');
    expect(icons[0].svg).not.toContain('onclick=');
    expect(icons[1].style?.fill).toBe('#ef4444');

    document.documentElement.style.removeProperty('--entity-table-delete');
  });
});

// ── disabledEditorForReadonly ──────────────────────────────────────────────

describe('disabledEditorForReadonly', () => {
  it('returns undefined for readonly record', () => {
    const args = makeArgs({ _readonly: true });
    expect((disabledEditorForReadonly as (a: StylePropertyFunctionArg) => unknown)(args)).toBeUndefined();
  });

  it('returns "input-editor" for editable record', () => {
    const args = makeArgs({ name: 'foo' });
    expect((disabledEditorForReadonly as (a: StylePropertyFunctionArg) => unknown)(args)).toBe('input-editor');
  });
});

// ── switchDisabledForReadonly ──────────────────────────────────────────────

describe('switchDisabledForReadonly', () => {
  it('returns true for readonly record', () => {
    expect(switchDisabledForReadonly(makeArgs({ _readonly: true }))).toBe(true);
  });

  it('returns false for normal record', () => {
    expect(switchDisabledForReadonly(makeArgs({ name: 'foo' }))).toBe(false);
  });
});

// ── actionsColumn ──────────────────────────────────────────────────────────

describe('actionsColumn', () => {
  it('creates a column with fixed 100-width and actions field', () => {
    const col = actionsColumn('Actions', 'Delete');
    expect(col.field).toBe('actions');
    expect(col.width).toBe(100);
    expect(col.minWidth).toBe(100);
    expect(col.maxWidth).toBe(100);
  });

  it('icon callback returns empty array for readonly records', () => {
    const col = actionsColumn('Actions', 'Delete');
    const iconFn = col.icon as (args: StylePropertyFunctionArg) => unknown[];
    expect(iconFn(makeArgs({ _readonly: true }))).toEqual([]);
  });

  it('icon callback returns delete icons for normal records', () => {
    const col = actionsColumn('Actions', 'Delete');
    const iconFn = col.icon as (args: StylePropertyFunctionArg) => unknown[];
    const icons = iconFn(makeArgs({ id: '1' }));
    expect(icons).toHaveLength(2);
  });
});

// ── formatDateValue ────────────────────────────────────────────────────────

describe('formatDateValue', () => {
  it('returns empty string for null / undefined', () => {
    expect(formatDateValue(null)).toBe('');
    expect(formatDateValue(undefined)).toBe('');
    expect(formatDateValue('')).toBe('');
  });

  it('formats a Date object', () => {
    const d = new Date('2024-01-15T10:30:00');
    expect(formatDateValue(d)).toBe(d.toLocaleString());
  });

  it('formats an ISO string', () => {
    const iso = '2024-06-01T12:00:00.000Z';
    expect(formatDateValue(iso)).toBe(new Date(iso).toLocaleString());
  });

  it('returns empty string for invalid date', () => {
    expect(formatDateValue('not-a-date')).toBe('');
  });
});

// ── buildPropertyColumn ────────────────────────────────────────────────────

describe('buildPropertyColumn', () => {
  it('assigns field and title', () => {
    const col = buildPropertyColumn({ field: 'name', type: 'string', title: '姓名' });
    expect(col.field).toBe('name');
    expect(col.title).toBe('姓名');
  });

  it('uses field as fallback title', () => {
    const col = buildPropertyColumn({ field: 'email', type: 'string' });
    expect(col.title).toBe('email');
  });

  it('boolean type → cellType switch with disable callback when not readonly', () => {
    const col = buildPropertyColumn({ field: 'active', type: 'boolean' }) as Record<string, unknown>;
    expect(col['cellType']).toBe('switch');
    expect(typeof col['disable']).toBe('function');
  });

  it('boolean readonly → disable = true', () => {
    const col = buildPropertyColumn({ field: 'active', type: 'boolean', readonly: true }) as Record<string, unknown>;
    expect(col['disable']).toBe(true);
  });

  it('enum type → per-column EnumEditor instance, no menuList', () => {
    const col = buildPropertyColumn({ field: 'status', type: 'enum', enumValues: ['a', 'b'] }) as Record<
      string,
      unknown
    >;
    expect(col['menuList']).toBeUndefined();
    expect(col['editor']).toBeDefined();
  });

  it('enum nullable=true → prepends null option (via nullable flag)', () => {
    const col = buildPropertyColumn({ field: 's', type: 'enum', enumValues: ['a'], nullable: true }) as Record<
      string,
      unknown
    >;
    expect(col['nullable']).toBe(true);
  });

  it('enum readonly → no editor', () => {
    const col = buildPropertyColumn({ field: 'status', type: 'enum', readonly: true }) as Record<string, unknown>;
    expect(col['editor']).toBeUndefined();
  });

  it('string type → editor when not readonly', () => {
    const col = buildPropertyColumn({ field: 'name', type: 'string' }) as Record<string, unknown>;
    expect(col['editor']).toBeDefined();
  });

  it('string readonly → no editor', () => {
    const col = buildPropertyColumn({ field: 'name', type: 'string', readonly: true }) as Record<string, unknown>;
    expect(col['editor']).toBeUndefined();
  });

  it('date type → fieldFormat produces date string', () => {
    const col = buildPropertyColumn({ field: 'createdAt', type: 'date' }) as Record<string, unknown>;
    const fmt = col['fieldFormat'] as (r: Record<string, unknown>) => string;
    const d = new Date('2024-01-01');
    expect(fmt({ createdAt: d })).toBe(d.toLocaleString());
    expect(fmt({ createdAt: null })).toBe('');
  });

  it('stringArray type → fieldFormat joins with comma', () => {
    const col = buildPropertyColumn({ field: 'tags', type: 'stringArray' }) as Record<string, unknown>;
    const fmt = col['fieldFormat'] as (r: Record<string, unknown>) => string;
    expect(fmt({ tags: ['a', 'b', 'c'] })).toBe('a, b, c');
    expect(fmt({ tags: null })).toBe('');
  });

  it('numberArray type → fieldFormat joins with comma', () => {
    const col = buildPropertyColumn({ field: 'scores', type: 'numberArray' }) as Record<string, unknown>;
    const fmt = col['fieldFormat'] as (r: Record<string, unknown>) => string;
    expect(fmt({ scores: [1, 2, 3] })).toBe('1, 2, 3');
  });

  it('json type → fieldFormat produces JSON string', () => {
    const col = buildPropertyColumn({ field: 'meta', type: 'json' }) as Record<string, unknown>;
    const fmt = col['fieldFormat'] as (r: Record<string, unknown>) => string;
    expect(fmt({ meta: { key: 'val' } })).toBe('{"key":"val"}');
    expect(fmt({ meta: null })).toBe('');
  });

  it('keyValue type → fieldFormat produces JSON string', () => {
    const col = buildPropertyColumn({ field: 'kv', type: 'keyValue' }) as Record<string, unknown>;
    const fmt = col['fieldFormat'] as (r: Record<string, unknown>) => string;
    expect(fmt({ kv: { x: 1 } })).toBe('{"x":1}');
  });

  it('stores _propertyType on column definition', () => {
    for (const type of [
      'string',
      'uuid',
      'enum',
      'number',
      'integer',
      'boolean',
      'date',
      'stringArray',
      'numberArray',
      'json',
      'keyValue'
    ] as const) {
      const col = buildPropertyColumn({ field: 'f', type, enumValues: type === 'enum' ? ['a'] : undefined }) as Record<
        string,
        unknown
      >;
      expect(col['_propertyType']).toBe(type);
    }
  });
});

// ── parsePropertyColumnValue ───────────────────────────────────────────────

describe('parsePropertyColumnValue', () => {
  it('returns null for empty / null input', () => {
    expect(parsePropertyColumnValue('string', null)).toBeNull();
    expect(parsePropertyColumnValue('string', '')).toBeNull();
  });

  it('parses number', () => {
    expect(parsePropertyColumnValue('number', '3.14')).toBeCloseTo(3.14);
    expect(parsePropertyColumnValue('number', 'abc')).toBeNull();
  });

  it('parses integer', () => {
    expect(parsePropertyColumnValue('integer', '42')).toBe(42);
    expect(parsePropertyColumnValue('integer', '42.9')).toBe(42);
  });

  it('parses boolean', () => {
    expect(parsePropertyColumnValue('boolean', true)).toBe(true);
    expect(parsePropertyColumnValue('boolean', 'true')).toBe(true);
    expect(parsePropertyColumnValue('boolean', 'false')).toBe(false);
  });

  it('parses date', () => {
    const result = parsePropertyColumnValue('date', '2024-06-01');
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^2024-06-01/);
  });

  it('returns null for invalid date', () => {
    expect(parsePropertyColumnValue('date', 'not-a-date')).toBeNull();
  });

  it('parses stringArray from comma-separated', () => {
    expect(parsePropertyColumnValue('stringArray', 'a, b, c')).toEqual(['a', 'b', 'c']);
    expect(parsePropertyColumnValue('stringArray', ' x , y ')).toEqual(['x', 'y']);
  });

  it('parses numberArray from comma-separated', () => {
    expect(parsePropertyColumnValue('numberArray', '1, 2, 3')).toEqual([1, 2, 3]);
    expect(parsePropertyColumnValue('numberArray', '1, abc, 3')).toEqual([1, 3]);
  });

  it('parses json', () => {
    expect(parsePropertyColumnValue('json', '{"a":1}')).toEqual({ a: 1 });
    expect(parsePropertyColumnValue('json', 'invalid')).toBeNull();
  });

  it('parses uuid to lowercase', () => {
    expect(parsePropertyColumnValue('uuid', 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    );
  });

  it('parses enum: empty string returns null', () => {
    expect(parsePropertyColumnValue('enum', '')).toBeNull();
  });

  it('parses enum: valid value returns string', () => {
    expect(parsePropertyColumnValue('enum', 'active')).toBe('active');
  });

  it('parses keyValue as JSON', () => {
    expect(parsePropertyColumnValue('keyValue', '{"x":"y"}')).toEqual({ x: 'y' });
  });

  it('returns raw value for string / uuid', () => {
    expect(parsePropertyColumnValue('string', 'hello')).toBe('hello');
    expect(parsePropertyColumnValue('uuid', 'abc-123')).toBe('abc-123');
  });

  it('passes through Date directly for date type returns ISO string', () => {
    const d = new Date('2024-01-01');
    expect(parsePropertyColumnValue('date', d)).toBe(d.toISOString());
  });

  it('passes through array directly for stringArray', () => {
    const arr = ['x', 'y', 'z'];
    expect(parsePropertyColumnValue('stringArray', arr)).toEqual(['x', 'y', 'z']);
  });

  it('passes through array directly for numberArray', () => {
    const arr = [1, 2, 3];
    expect(parsePropertyColumnValue('numberArray', arr)).toEqual([1, 2, 3]);
  });

  it('passes through object directly for json', () => {
    const obj = { a: 1, b: 'c' };
    expect(parsePropertyColumnValue('json', obj)).toBe(obj);
  });

  it('passes through object directly for keyValue', () => {
    const obj = { key: 'value' };
    expect(parsePropertyColumnValue('keyValue', obj)).toBe(obj);
  });
});

// ── makeEditorForReadonly ───────────────────────────────────────────────

describe('makeEditorForReadonly', () => {
  it('returns the editor name for editable record', () => {
    const editorFn = makeEditorForReadonly('date-editor') as (a: StylePropertyFunctionArg) => unknown;
    expect(editorFn(makeArgs({ name: 'foo' }))).toBe('date-editor');
  });

  it('returns undefined for readonly record', () => {
    const editorFn = makeEditorForReadonly('tags-editor') as (a: StylePropertyFunctionArg) => unknown;
    expect(editorFn(makeArgs({ _readonly: true }))).toBeUndefined();
  });

  it('works with any editor name', () => {
    const editorFn = makeEditorForReadonly('json-editor') as (a: StylePropertyFunctionArg) => unknown;
    expect(editorFn(makeArgs({}))).toBe('json-editor');
  });
});

// ── buildPropertyColumn editor names ─────────────────────────────────

describe('buildPropertyColumn editor names', () => {
  function getEditorName(col: Record<string, unknown>, record: Record<string, unknown> = {}): unknown {
    const editorFn = col['editor'] as ((a: StylePropertyFunctionArg) => unknown) | undefined;
    return editorFn?.(makeArgs(record));
  }

  it('enum uses per-column EnumEditor instance', () => {
    const col = buildPropertyColumn({ field: 'status', type: 'enum', enumValues: ['a'] }) as Record<string, unknown>;
    const editor = getEditorName(col);
    expect(editor).toBeInstanceOf(EnumEditor);
    expect(getEditorName(col, { _readonly: true })).toBeUndefined();
  });

  it('date uses date-editor', () => {
    const col = buildPropertyColumn({ field: 'ts', type: 'date' }) as Record<string, unknown>;
    expect(getEditorName(col)).toBe('date-editor');
  });

  it('stringArray uses tags-editor', () => {
    const col = buildPropertyColumn({ field: 'tags', type: 'stringArray' }) as Record<string, unknown>;
    expect(getEditorName(col)).toBe('tags-editor');
  });

  it('numberArray uses number-tags-editor', () => {
    const col = buildPropertyColumn({ field: 'scores', type: 'numberArray' }) as Record<string, unknown>;
    expect(getEditorName(col)).toBe('number-tags-editor');
  });

  it('json uses json-editor', () => {
    const col = buildPropertyColumn({ field: 'data', type: 'json' }) as Record<string, unknown>;
    expect(getEditorName(col)).toBe('json-editor');
  });

  it('keyValue uses key-value-editor', () => {
    const col = buildPropertyColumn({ field: 'kv', type: 'keyValue' }) as Record<string, unknown>;
    expect(getEditorName(col)).toBe('key-value-editor');
  });

  it('string uses input-editor', () => {
    const col = buildPropertyColumn({ field: 'name', type: 'string' }) as Record<string, unknown>;
    expect(getEditorName(col)).toBe('input-editor');
  });

  it('uuid uses uuid-editor and auto-assigns width 320', () => {
    const col = buildPropertyColumn({ field: 'id', type: 'uuid' }) as Record<string, unknown>;
    expect(getEditorName(col)).toBe('uuid-editor');
    expect(col['width']).toBe(320);
  });

  it('uuid respects explicit width override', () => {
    const col = buildPropertyColumn({ field: 'id', type: 'uuid', width: 400 }) as Record<string, unknown>;
    expect(col['width']).toBe(400);
  });

  it('number uses number-editor', () => {
    const col = buildPropertyColumn({ field: 'score', type: 'number' }) as Record<string, unknown>;
    expect(getEditorName(col)).toBe('number-editor');
  });

  it('integer uses integer-editor', () => {
    const col = buildPropertyColumn({ field: 'count', type: 'integer' }) as Record<string, unknown>;
    expect(getEditorName(col)).toBe('integer-editor');
  });

  it('boolean defaults to width 80 with minWidth 60 and maxWidth 120', () => {
    const col = buildPropertyColumn({ field: 'active', type: 'boolean' }) as Record<string, unknown>;
    expect(col['width']).toBe(80);
    expect(col['minWidth']).toBe(60);
    expect(col['maxWidth']).toBe(120);
  });

  it('date defaults to width 180 with minWidth 140', () => {
    const col = buildPropertyColumn({ field: 'ts', type: 'date' }) as Record<string, unknown>;
    expect(col['width']).toBe(180);
    expect(col['minWidth']).toBe(140);
  });

  it('number defaults to width 100 with minWidth 70', () => {
    const col = buildPropertyColumn({ field: 'n', type: 'number' }) as Record<string, unknown>;
    expect(col['width']).toBe(100);
    expect(col['minWidth']).toBe(70);
  });

  it('integer defaults to width 80 with minWidth 60', () => {
    const col = buildPropertyColumn({ field: 'n', type: 'integer' }) as Record<string, unknown>;
    expect(col['width']).toBe(80);
    expect(col['minWidth']).toBe(60);
  });

  it('enum defaults to width 120 with minWidth 80', () => {
    const col = buildPropertyColumn({ field: 's', type: 'enum', enumValues: ['a'] }) as Record<string, unknown>;
    expect(col['width']).toBe(120);
    expect(col['minWidth']).toBe(80);
  });

  it('uuid has minWidth 200 and maxWidth 400', () => {
    const col = buildPropertyColumn({ field: 'id', type: 'uuid' }) as Record<string, unknown>;
    expect(col['minWidth']).toBe(200);
    expect(col['maxWidth']).toBe(400);
  });

  it('keyValue uses per-column KeyValueEditor when schema provided', () => {
    const schema = { color: { label: '颜色', type: 'string' as const } };
    const col = buildPropertyColumn({ field: 'kv', type: 'keyValue', keyValueSchema: schema }) as Record<
      string,
      unknown
    >;
    const editorFn = col['editor'] as (a: StylePropertyFunctionArg) => unknown;
    const inst = editorFn(makeArgs({}));
    expect(inst).toBeDefined();
    expect((inst as { editorType?: string })?.editorType).toBe('key-value-editor');
  });
});

// ── enum enumItems 文本映射 ────────────────────────────────────────────────

describe('buildPropertyColumn enum enumItems', () => {
  it('maps stored values to texts via fieldFormat', () => {
    const col = buildPropertyColumn({
      field: 'status',
      type: 'enum',
      enumItems: [{ value: 'a', text: '甲' }, { value: 'b' }]
    }) as Record<string, unknown>;
    const fmt = col['fieldFormat'] as (r: Record<string, unknown>) => string;

    expect(fmt({ status: 'a' })).toBe('甲');
    expect(fmt({ status: 'b' })).toBe('b'); // 无 text → 回退 value
    expect(fmt({ status: 'unknown' })).toBe('unknown'); // 未知值原样返回
  });

  it('uses a per-column EnumEditor instance even without enum values', () => {
    const col = buildPropertyColumn({ field: 'status', type: 'enum' }) as Record<string, unknown>;
    const editorFn = col['editor'] as ((a: StylePropertyFunctionArg) => unknown) | undefined;
    expect(editorFn).toBeDefined();
    expect(editorFn?.(makeArgs({}))).toBeInstanceOf(EnumEditor);
  });
});

// ── 关系列 ─────────────────────────────────────────────────────────────────

describe('buildPropertyColumn relation types', () => {
  it('formats a related id through static items', () => {
    const col = buildPropertyColumn({
      field: 'owner',
      type: 'manyToOne',
      relatedItems: [
        { id: 'u1', displayName: 'Alice' },
        { id: 'u2', displayName: 'Bob' }
      ]
    }) as Record<string, unknown>;
    const fmt = col['fieldFormat'] as (r: Record<string, unknown>) => string;

    expect(fmt({ owner: 'u1' })).toBe('Alice');
    expect(fmt({ owner: 'missing' })).toBe('missing');
    expect(fmt({ owner: null })).toBe('');
    expect(fmt({ owner: '' })).toBe('');
  });

  it('resolves display names through a provider', () => {
    const provider = vi.fn().mockReturnValue([{ id: 'u1', displayName: 'Provider Alice' }]);
    const col = buildPropertyColumn({
      field: 'owner',
      type: 'oneToOne',
      relatedItemsProvider: provider
    }) as Record<string, unknown>;
    const fmt = col['fieldFormat'] as (r: Record<string, unknown>) => string;

    expect(fmt({ owner: 'u1' })).toBe('Provider Alice');
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('builds a RelationEditor for editable relation cells', () => {
    const col = buildPropertyColumn({
      field: 'owner',
      type: 'manyToOne',
      relatedItems: [{ id: 'u1', displayName: 'Alice' }]
    }) as Record<string, unknown>;
    const editorFn = col['editor'] as (a: StylePropertyFunctionArg) => unknown;
    const inst = editorFn(makeArgs({}));
    expect(inst).toBeInstanceOf(RelationEditor);
    expect(editorFn(makeArgs({ _readonly: true }))).toBeUndefined();
  });

  it('omits the editor for readonly relation columns', () => {
    const col = buildPropertyColumn({
      field: 'owner',
      type: 'oneToOne',
      readonly: true
    }) as Record<string, unknown>;
    expect(col['editor']).toBeUndefined();
  });
});

// ── actionsColumn 带查看按钮 ───────────────────────────────────────────────

describe('actionsColumn with view label', () => {
  it('uses a wider column and renders view + delete icons', () => {
    const col = actionsColumn('操作', '删除', '查看');
    expect(col.width).toBe(130);
    expect(col.minWidth).toBe(130);
    expect(col.maxWidth).toBe(130);

    const iconFn = col.icon as (args: StylePropertyFunctionArg) => unknown[];
    const icons = iconFn(makeArgs({ id: '1' }));
    expect(icons).toHaveLength(3);

    const names = (icons as Array<{ name?: string }>).map(i => i.name);
    expect(names).toContain('view-action');
    expect(names.filter(n => n === 'delete-action')).toHaveLength(2);
  });

  it('keeps returning an empty icon list for readonly records', () => {
    const col = actionsColumn('操作', '删除', '查看');
    const iconFn = col.icon as (args: StylePropertyFunctionArg) => unknown[];
    expect(iconFn(makeArgs({ _readonly: true }))).toEqual([]);
  });
});

// ── makeViewIcons ─────────────────────────────────────────────────────────

describe('makeViewIcons', () => {
  it('returns a single svg icon for the view action', () => {
    const icons = makeViewIcons() as Array<Record<string, unknown>>;
    expect(icons).toHaveLength(1);
    expect(icons[0]?.['type']).toBe('svg');
    expect(icons[0]?.['name']).toBe('view-action');
    expect(String(icons[0]?.['svg'])).toContain('<svg');
  });
});
