vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@aiao/rxdb', () => ({
  RxDB: class {},
  Entity: () => (target: unknown) => target,
  EntityBase: class {},
  PropertyType: { string: 'string' },
  RelationKind: { ONE_TO_MANY: 'ONE_TO_MANY', MANY_TO_ONE: 'MANY_TO_ONE' },
  OnDeleteAction: { CASCADE: 'CASCADE' },
  ENTITY_BASE_METADATA_OPTIONS: { properties: [], computedProperties: [], relations: [] },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] }
}));

import { PropertyItemComponent } from '../../../components/panels/property-item.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../../i18n/translations';

function setup() {
  TestBed.configureTestingModule({
    imports: [PropertyItemComponent],
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  const fixture = TestBed.createComponent(PropertyItemComponent);
  fixture.componentRef.setInput('property', { id: 'p1', name: 'status', propertyType: 'string' });
  fixture.detectChanges();
  return fixture;
}

describe('PropertyItemComponent type dropdown keyboard navigation', () => {
  it('opens the listbox on ArrowDown and highlights the next type', () => {
    const fixture = setup();
    const combobox = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLButtonElement;

    combobox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();

    const listbox = fixture.nativeElement.querySelector('[role="listbox"]');
    expect(listbox).not.toBeNull();
    const highlighted = listbox.querySelector('.bg-base-200');
    expect(highlighted?.textContent).toContain('Number');
  });

  it('commits the highlighted type on Enter and emits the change', () => {
    const fixture = setup();
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);
    const combobox = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLButtonElement;

    combobox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    const listbox = fixture.nativeElement.querySelector('[role="listbox"]') as HTMLElement;
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(updated).toHaveBeenCalledWith({ propertyType: 'number' });
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
  });

  it('closes the listbox on Escape without emitting changes', () => {
    const fixture = setup();
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);
    const combobox = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLButtonElement;

    combobox.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).not.toBeNull();

    combobox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
    expect(updated).not.toHaveBeenCalled();
  });

  it('wraps around with ArrowUp from the first option', () => {
    const fixture = setup();
    const combobox = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLButtonElement;

    combobox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();

    const listbox = fixture.nativeElement.querySelector('[role="listbox"]');
    const highlighted = listbox?.querySelector('.bg-base-200');
    expect(highlighted?.textContent).toContain('UUID');
  });
});
