import type { FormFieldConfig } from '@aiao/rxdb-model';
import { Component, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { injectEntityForm, injectQueryTable, type InjectEntityFormReturn } from '../headless/bindings';

const fields: FormFieldConfig[] = [{ field: 'title', displayName: '标题', type: 'string' }];

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

describe('Angular headless bindings', () => {
  it('signal options 同步字段、mode 和 data，且 mode 变化不丢草稿', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    host.binding.controller.setField('title', 'draft');
    host.options.set({ fields, data: { title: 'A' }, mode: 'view' });
    fixture.detectChanges();
    expect(host.binding.snapshot().data['title']).toBe('draft');
    host.options.set({ fields, data: { title: 'B' }, mode: 'view' });
    fixture.detectChanges();
    expect(host.binding.snapshot().data['title']).toBe('B');
  });

  it('查询表格会同步宿主能力变化', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(QueryTableHostComponent);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    expect(host.binding.snapshot().capabilities?.canCreate).toBe(false);
    host.options.set({
      records: [{ id: 'one', save: async () => undefined, remove: async () => undefined }],
      capabilities: { canCreate: true, canEdit: true, canDelete: false }
    });
    fixture.detectChanges();
    expect(host.binding.snapshot().capabilities?.canEdit).toBe(true);
  });
});
