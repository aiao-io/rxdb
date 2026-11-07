import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DesignerToolbarComponent } from '../../components/toolbar/designer-toolbar.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';

function createComponent() {
  TestBed.configureTestingModule({
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  return TestBed.runInInjectionContext(() => new DesignerToolbarComponent());
}

describe('DesignerToolbarComponent', () => {
  it('should emit openVersionManager', () => {
    const comp = createComponent();
    const spy = vi.fn();
    comp.openVersionManager.subscribe(spy);
    comp.openVersionManager.emit();
    expect(spy).toHaveBeenCalled();
  });

  it('should emit generateSql', () => {
    const comp = createComponent();
    const spy = vi.fn();
    comp.generateSql.subscribe(spy);
    comp.generateSql.emit();
    expect(spy).toHaveBeenCalled();
  });

  it('should emit compareSql', () => {
    const comp = createComponent();
    const spy = vi.fn();
    comp.compareSql.subscribe(spy);
    comp.compareSql.emit();
    expect(spy).toHaveBeenCalled();
  });

  it('should emit executeSql and default to disabled', () => {
    const comp = createComponent();
    const spy = vi.fn();
    comp.executeSql.subscribe(spy);

    expect(comp.executeDisabled()).toBe(true);
    comp.executeSql.emit();
    expect(spy).toHaveBeenCalledOnce();
  });
});
