import type { FormFieldConfig } from '@aiao/rxdb-model';
import { Component, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { injectEntityForm, type InjectEntityFormReturn } from '../headless/bindings';

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
});
