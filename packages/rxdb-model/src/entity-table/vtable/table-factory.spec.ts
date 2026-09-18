import { describe, expect, it } from 'vitest';
import {
  _resetEditorRegistry,
  buildTableOptions,
  createListTable,
  ensureBaseEditorRegistered,
  registerEditor
} from './table-factory.js';

describe('ensureBaseEditorRegistered', () => {
  it('does not throw on first call', () => {
    _resetEditorRegistry();
    expect(() => ensureBaseEditorRegistered()).not.toThrow();
  });

  it('is idempotent (second call is a no-op)', () => {
    _resetEditorRegistry();
    ensureBaseEditorRegistered();
    expect(() => ensureBaseEditorRegistered()).not.toThrow();
  });
});

describe('_resetEditorRegistry', () => {
  it('allows re-registration after reset', () => {
    ensureBaseEditorRegistered();
    _resetEditorRegistry();
    expect(() => ensureBaseEditorRegistered()).not.toThrow();
  });
});

describe('buildTableOptions', () => {
  it('returns default options with records and columns', () => {
    const records = [{ id: '1', name: 'test' }] as Record<string, unknown>[];
    const columns = [{ field: 'name', title: 'Name' }];
    const opts = buildTableOptions(records, columns, false);

    expect(opts.records).toBe(records);
    expect(opts.columns).toBe(columns);
    expect(opts.widthMode).toBe('autoWidth');
    expect(opts.autoFillWidth).toBe(true);
    expect(opts.rightFrozenColCount).toBe(1);
    expect(opts.hierarchyIndent).toBe(20);
    expect(opts.editCellTrigger).toEqual(['keydown', 'doubleclick']);
  });

  it('merges custom options', () => {
    const opts = buildTableOptions([], [], true, { widthMode: 'standard', defaultRowHeight: 40 });
    expect(opts.widthMode).toBe('standard');
    expect(opts.defaultRowHeight).toBe(40);
    expect(opts.autoFillWidth).toBe(true);
  });

  it('includes theme', () => {
    const opts = buildTableOptions([], [], false);
    expect(opts.theme).toBeDefined();
  });

  it('includes rowSeriesNumber with drag', () => {
    const opts = buildTableOptions([], [], false);
    expect(opts.rowSeriesNumber).toEqual({ title: '', width: 40, dragOrder: true });
  });
});

describe('registerEditor', () => {
  it('does not throw', () => {
    expect(() => registerEditor('test-editor', {})).not.toThrow();
  });
});

describe('createListTable', () => {
  it('is a function', () => {
    expect(typeof createListTable).toBe('function');
  });
});
