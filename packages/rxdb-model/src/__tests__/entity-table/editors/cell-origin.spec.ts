// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorEditor } from '../../../entity-table/editors/color-editor.js';
import { DateEditor } from '../../../entity-table/editors/date-editor.js';
import { EnumEditor } from '../../../entity-table/editors/enum-editor.js';
import { JsonEditor } from '../../../entity-table/editors/json-editor.js';
import { KeyValueEditor } from '../../../entity-table/editors/key-value-editor.js';
import { MultiSelectEditor } from '../../../entity-table/editors/multiselect-editor.js';
import { NumberEditor } from '../../../entity-table/editors/number-editor.js';
import { RelationEditor } from '../../../entity-table/editors/relation-editor.js';
import { TagsEditor } from '../../../entity-table/editors/tags-editor.js';
import { TextFormatEditor } from '../../../entity-table/editors/text-format-editor.js';
import { UuidEditor } from '../../../entity-table/editors/uuid-editor.js';

interface CellEditor {
  onStart(ctx: never): void;
  onEnd(): void;
  getValue(): unknown;
}

/**
 * 表格给出的单元格原始值是 `null`（已清空的单元格）时，编辑器的初始值不得回退到 `ctx.value`。
 *
 * VTable 以键盘输入开始编辑时 `ctx.value` 是空串，宿主经 `startEditCell(col, row, value)` 开始编辑时是任意值；
 * 原先 `getCellOriginValue(...) ?? ctx.value` 把 `null` 当成「表格没给原始值」，JSON 编辑器因此把空单元格显示成 `""`、
 * 其余编辑器展示并提交 `ctx.value`（RV-01a1bbce895f76e893337d54012f0089）。
 */
const editors: Array<[string, () => CellEditor, unknown]> = [
  ['ColorEditor', () => new ColorEditor(), '#abcdef'],
  ['DateEditor', () => new DateEditor(), '2023-12-31T16:00:00.000Z'],
  ['JsonEditor', () => new JsonEditor(), { stale: true }],
  ['NumberEditor', () => new NumberEditor(), 42],
  ['KeyValueEditor', () => new KeyValueEditor(), { stale: 'yes' }],
  ['TagsEditor', () => new TagsEditor(), ['stale']],
  ['TextFormatEditor', () => new TextFormatEditor('email'), 'stale@example.test'],
  ['UuidEditor', () => new UuidEditor(), '550e8400-e29b-41d4-a716-446655440000'],
  ['EnumEditor', () => new EnumEditor([{ value: 'draft' }, { value: 'published' }]), 'published'],
  ['MultiSelectEditor', () => new MultiSelectEditor([{ id: 'a', name: 'A' }]), 'a'],
  ['RelationEditor', () => new RelationEditor([{ id: 'r1', displayName: 'R1' }], true), 'r1']
];

function startValue(editor: CellEditor, ctxValue: unknown, origin: unknown, withTable = true): unknown {
  const container = document.createElement('div');
  container.tabIndex = 0;
  document.body.appendChild(container);
  editor.onStart({
    col: 1,
    row: 1,
    value: ctxValue,
    container,
    table: withTable ? { getCellOriginValue: () => origin } : null,
    endEdit: vi.fn(),
    referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } }
  } as never);
  vi.advanceTimersByTime(10);
  const value = editor.getValue();
  editor.onEnd();
  document.body.innerHTML = '';
  return value;
}

describe('单元格原始值为 null 时不回退 ctx.value', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it.each(editors)('%s', (_name, create, stale) => {
    const empty = startValue(create(), null, null);
    expect(startValue(create(), stale, null)).toEqual(empty);
    expect(startValue(create(), '', null)).toEqual(empty);
  });

  it.each(editors)('%s：没有表格时仍取 ctx.value', (_name, create, stale) => {
    expect(startValue(create(), stale, null, false)).toEqual(startValue(create(), null, stale));
  });

  it('JsonEditor 以键盘开始编辑空单元格时显示空文本而不是 ""', () => {
    const editor = new JsonEditor();
    const container = document.createElement('div');
    document.body.appendChild(container);
    editor.onStart({
      col: 1,
      row: 1,
      value: '',
      container,
      table: { getCellOriginValue: () => null },
      endEdit: vi.fn(),
      referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } }
    } as never);
    vi.advanceTimersByTime(10);

    expect(document.querySelector('textarea')?.value).toBe('');
    expect(editor.getValue()).toBeNull();

    editor.onEnd();
  });
});
