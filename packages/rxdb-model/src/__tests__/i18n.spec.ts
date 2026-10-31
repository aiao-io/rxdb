// @vitest-environment happy-dom

import type { EntityMetadata } from '@aiao/rxdb';
import { I18n } from '@aiao/rxdb-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDetailTabs } from '../entity-detail/detail-tabs.js';
import { buildEditableColumns } from '../entity-table/columns/build-editable-columns.js';
import { formatDateValue } from '../entity-table/columns/column-utils.js';
import { NumberEditor } from '../entity-table/editors/number-editor.js';
import { TagsEditor } from '../entity-table/editors/tags-editor.js';
import { labelTableFocusControl } from '../entity-table/vtable/focus-control-label.js';
import { modelText, setTableI18n } from '../i18n.js';
import { modelEnMessages, modelMessages } from '../messages.js';

const catalogs = [...modelMessages, { locale: 'en', namespace: 'rxdb-model', messages: modelEnMessages }];

const metadata = {
  name: 'Book',
  namespace: 'public',
  repository: 'Repository',
  properties: [],
  relations: [],
  propertyMap: new Map(),
  computedPropertyMap: new Map(),
  foreignKeyRelationMap: new Map(),
  relationMap: new Map()
} as unknown as EntityMetadata;

const context = (table: object) => ({
  table,
  col: 1,
  row: 1,
  value: null,
  container: document.createElement('div'),
  endEdit: vi.fn(),
  referencePosition: { rect: { left: 0, top: 0, width: 120, height: 24 } }
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('model message catalogs', () => {
  it('preserves default Chinese and explicit column options', async () => {
    const runtime = new I18n({ catalogs, deviceLocale: 'en' });
    expect(buildEditableColumns(metadata).map(column => column.title)).toEqual(['ID', '创建时间', '更新时间', '操作']);
    expect(buildDetailTabs(metadata)[0]?.label).toBe('基本信息');
    expect(buildEditableColumns(metadata, { i18n: runtime }).map(column => column.title)).toEqual([
      'ID',
      'Created at',
      'Updated at',
      'Actions'
    ]);
    expect(buildDetailTabs(metadata, runtime)[0]?.label).toBe('Basic information');
    expect(formatDateValue('', runtime)).toBe('');
    expect(formatDateValue('invalid', runtime)).toBe('');
    expect(formatDateValue(0, runtime)).toBe(
      runtime.formatDate(new Date(0), {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      })
    );
    expect(buildEditableColumns(metadata, { i18n: runtime, actionsTitle: 'Custom actions' }).at(-1)?.title).toBe(
      'Custom actions'
    );
    const partial = new I18n({ catalogs: modelMessages, deviceLocale: 'en' });
    partial.registerCatalog({ locale: 'en', namespace: 'rxdb-model', messages: { 'common.save': 'Submit' } });
    await partial.setLocale('en');
    expect(modelText('common.save', undefined, partial)).toBe('Submit');
    expect(modelText('common.cancel', undefined, partial)).toBe('取消');
    partial.destroy();
    runtime.destroy();
  });

  it('updates the table focus label and releases its subscription', async () => {
    const runtime = new I18n({ catalogs, deviceLocale: 'zh-Hans' });
    const container = document.createElement('div');
    container.innerHTML = '<input class="table-focus-control">';
    const clear = labelTableFocusControl(container, runtime);
    expect(container.querySelector('input')?.getAttribute('aria-label')).toBe('表格当前单元格');
    await runtime.setLocale('en');
    expect(container.querySelector('input')?.getAttribute('aria-label')).toBe('Current table cell');
    clear();
    await runtime.setLocale('zh-Hans');
    expect(container.querySelector('input')?.getAttribute('aria-label')).toBe('Current table cell');
    runtime.destroy();
  });

  it('updates an open tags editor and removes its subscription when closed', async () => {
    vi.useFakeTimers();
    const runtime = new I18n({ catalogs, deviceLocale: 'zh-Hans' });
    const table = { getCellOriginValue: () => null };
    setTableI18n(table, runtime);
    const editor = new TagsEditor();
    const before = runtime.changes$.observers.length;
    editor.onStart(context(table) as never);
    const input = document.querySelector('input');
    expect(input?.placeholder).toBe('输入后 Enter 添加');
    await runtime.setLocale('en');
    expect(input?.placeholder).toBe('Type and press Enter to add');
    expect(document.body.textContent).toContain('Enter / comma to add · Backspace to delete · Esc to cancel');
    editor.onEnd();
    expect(runtime.changes$.observers.length).toBe(before);
    await runtime.setLocale('zh-Hans');
    expect(input?.placeholder).toBe('Type and press Enter to add');
    runtime.destroy();
  });

  it('preserves tag data when an empty placeholder changes language', async () => {
    vi.useFakeTimers();
    const runtime = new I18n({
      deviceLocale: 'zh-Hans',
      catalogs: catalogs.map(catalog =>
        catalog.locale === 'zh-Hans' ?
          { ...catalog, messages: { ...catalog.messages, 'text.b6717239b9': '' } }
        : catalog
      )
    });
    const table = { getCellOriginValue: () => ['alpha'] };
    setTableI18n(table, runtime);
    const editor = new TagsEditor();
    editor.onStart(context(table) as never);
    expect(document.querySelector('input')?.placeholder).toBe('');
    await runtime.setLocale('en');
    expect(document.querySelector('input')?.placeholder).toBe('Type and press Enter to add');
    expect(document.body.textContent).toContain('alpha');
    expect(editor.getValue()).toEqual(['alpha']);
    editor.onEnd();
    runtime.destroy();
  });

  it('updates the current validation error without changing the entered value', async () => {
    vi.useFakeTimers();
    const runtime = new I18n({ catalogs, deviceLocale: 'zh-Hans' });
    const table = { getCellOriginValue: () => null };
    setTableI18n(table, runtime);
    const editor = new NumberEditor(true);
    editor.onStart(context(table) as never);
    const input = document.querySelector('input');
    if (!input) throw new Error('Missing number editor');
    input.value = 'bad';
    input.dispatchEvent(new Event('input'));
    expect(document.body.textContent).toContain('请输入整数');
    await runtime.setLocale('en');
    expect(document.body.textContent).toContain('Enter an integer');
    expect(input.value).toBe('bad');
    editor.onEnd();
    runtime.destroy();
  });
});
