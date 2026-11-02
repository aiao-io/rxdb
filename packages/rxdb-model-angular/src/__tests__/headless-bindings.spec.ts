import type { FormFieldConfig } from '@aiao/rxdb-model';
import type {
  EntityListControllerOptions,
  EntityListLoadContext,
  EntityListLoadResult
} from '@aiao/rxdb-model/headless';
import { Component, provideZonelessChangeDetection, signal, type Type, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  injectEntityForm,
  injectEntityList,
  injectQueryTable,
  type InjectEntityFormReturn
} from '../headless/bindings';

const fields: FormFieldConfig[] = [{ field: 'title', displayName: '标题', type: 'string' }];
const item = { id: 'one', title: 'one', save: async () => undefined, remove: async () => undefined };

@Component({ standalone: true, template: '' })
class ListHostComponent {
  readonly options = signal<EntityListControllerOptions>({ records: [item], page: 0, pageSize: 10 });
  readonly list = injectEntityList(this.options);
  readonly table = injectQueryTable(this.options);
}

@Component({ standalone: true, template: '' })
class HostComponent {
  readonly options: WritableSignal<{ fields: FormFieldConfig[]; data: { title: string }; mode: 'edit' | 'view' }> =
    signal({
      fields,
      data: { title: 'A' },
      mode: 'edit'
    });
  readonly binding: InjectEntityFormReturn = injectEntityForm(this.options);
}

@Component({ standalone: true, template: '' })
class QueryTableHostComponent {
  readonly options = signal({
    records: [{ id: 'one', save: async () => undefined, remove: async () => undefined }],
    capabilities: { canCreate: false, canEdit: false, canDelete: false }
  });
  readonly binding = injectQueryTable(this.options);
}

/** 以 zoneless 变更检测创建宿主组件并完成首次检测。 */
function mount<T>(type: Type<T>) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(type);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('Angular headless bindings', () => {
  it('signal options 同步字段、mode 和 data，且 mode 变化不丢草稿', () => {
    const { fixture, host } = mount(HostComponent);
    host.binding.controller.setField('title', 'draft');
    host.options.set({ fields, data: { title: 'A' }, mode: 'view' });
    fixture.detectChanges();
    expect(host.binding.snapshot().data['title']).toBe('draft');
    host.options.set({ fields, data: { title: 'B' }, mode: 'view' });
    fixture.detectChanges();
    expect(host.binding.snapshot().data['title']).toBe('B');
  });

  it('查询表格会同步宿主能力变化', () => {
    const { fixture, host } = mount(QueryTableHostComponent);
    expect(host.binding.snapshot().capabilities?.canCreate).toBe(false);
    host.options.set({
      records: [{ id: 'one', save: async () => undefined, remove: async () => undefined }],
      capabilities: { canCreate: true, canEdit: true, canDelete: false }
    });
    fixture.detectChanges();
    expect(host.binding.snapshot().capabilities?.canEdit).toBe(true);
  });

  it('列表与查询表格初始化保留宿主记录；重传等值输入或只改能力不清记录、不中止进行中的查询', () => {
    const { fixture, host } = mount(ListHostComponent);
    const bindings = [host.list, host.table];
    for (const binding of bindings) expect(binding.snapshot().records).toEqual([item]);
    const signals: AbortSignal[] = [];
    const pending = (context: EntityListLoadContext) =>
      new Promise<EntityListLoadResult>(() => {
        signals.push(context.signal);
      });
    for (const binding of bindings) void binding.controller.refresh(pending);
    host.options.set({ records: [item], page: 0, pageSize: 10 });
    fixture.detectChanges();
    host.options.set({
      records: [item],
      page: 0,
      pageSize: 10,
      capabilities: { canCreate: false, canEdit: true, canDelete: true }
    });
    fixture.detectChanges();
    expect(signals.map(signal => signal.aborted)).toEqual([false, false]);
    for (const binding of bindings)
      expect(binding.snapshot()).toMatchObject({ records: [item], loading: true, capabilities: { canCreate: false } });
  });

  it('列表与查询表格跟随分页、页大小与排序输入，刷新使用新请求上下文', () => {
    const { fixture, host } = mount(ListHostComponent);
    const request = { page: 2, pageSize: 20, sorts: [{ field: 'title', sort: 'desc' as const }] };
    host.options.set({ records: [item], ...request });
    fixture.detectChanges();
    for (const binding of [host.list, host.table]) {
      expect(binding.snapshot()).toMatchObject(request);
      const load = vi.fn(() => ({ records: [] }));
      void binding.controller.refresh(load);
      expect(load).toHaveBeenCalledWith(expect.objectContaining(request));
    }
  });
});
