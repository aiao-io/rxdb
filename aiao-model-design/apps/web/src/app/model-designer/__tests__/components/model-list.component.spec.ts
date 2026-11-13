import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ModelListComponent } from '../../components/model-list/model-list.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';

function createComponent() {
  TestBed.configureTestingModule({
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  return TestBed.runInInjectionContext(() => new ModelListComponent());
}

describe('ModelListComponent', () => {
  it('should emit selected', () => {
    const comp = createComponent();
    const spy = vi.fn();
    comp.selected.subscribe(spy);
    comp.selected.emit('d1');
    expect(spy).toHaveBeenCalledWith('d1');
  });

  it('should emit created with the trimmed new name and reset it', () => {
    const comp = createComponent();
    const spy = vi.fn();
    comp.created.subscribe(spy);
    comp.newName.set('  Blog  ');
    comp.onCreate();
    expect(spy).toHaveBeenCalledWith('Blog');
    expect(comp.newName()).toBe('');
  });

  it('should NOT emit created when the new name is blank', () => {
    const comp = createComponent();
    const spy = vi.fn();
    comp.created.subscribe(spy);
    comp.newName.set('   ');
    comp.onCreate();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should emit deleted and stop propagation on delete', () => {
    const comp = createComponent();
    const spy = vi.fn();
    comp.deleted.subscribe(spy);
    const event = { stopPropagation: vi.fn() } as unknown as Event;
    comp.onDelete(event, 'd1');
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('d1');
  });

  it('should emit copied and stop propagation on copy', () => {
    const comp = createComponent();
    const spy = vi.fn();
    comp.copied.subscribe(spy);
    const event = { stopPropagation: vi.fn() } as unknown as Event;
    comp.onCopy(event, 'd1');
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('d1');
  });
});
