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
  injectEntityDetail,
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
class OptionalModeHostComponent {
  readonly options = signal<{ fields: FormFieldConfig[]; data: { title: string }; mode?: 'view' | 'create' }>({
    fields,
    data: { title: 'A' }
  });
  readonly form = injectEntityForm(this.options);
  readonly detail = injectEntityDetail(this.options);
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

  // 撤下可选的 mode 时三端都恢复共享控制器的默认 edit（RV-01a1bb54b35b79d491932d4436e84437）
  it.each(['view', 'create'] as const)('表单与详情的 mode 从 %s 撤下后恢复默认 edit，草稿保留', initialMode => {
    const { fixture, host } = mount(OptionalModeHostComponent);
    host.options.set({ fields, data: { title: 'A' }, mode: initialMode });
    fixture.detectChanges();
    expect(host.form.snapshot().mode).toBe(initialMode);
    host.form.controller.setField('title', 'draft');
    host.detail.controller.form.setField('title', 'draft');

    host.options.set({ fields, data: { title: 'A' } });
    fixture.detectChanges();

    expect(host.form.snapshot().mode).toBe('edit');
    expect(host.detail.snapshot().mode).toBe('edit');
    const kept = initialMode === 'view' ? 'A' : 'draft';
    expect(host.form.snapshot().data['title']).toBe(kept);
    expect(host.detail.snapshot().form.data['title']).toBe(kept);
    host.form.controller.setField('title', 'B');
    host.detail.controller.form.setField('title', 'B');
    expect(host.form.snapshot().data['title']).toBe('B');
    expect(host.detail.snapshot().form.data['title']).toBe('B');
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
