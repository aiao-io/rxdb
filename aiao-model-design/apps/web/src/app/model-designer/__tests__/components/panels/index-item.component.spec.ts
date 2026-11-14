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

import { IndexItemComponent } from '../../../components/panels/index-item.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../../i18n/translations';

function setup(availableCount: number) {
  TestBed.configureTestingModule({
    imports: [IndexItemComponent],
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  const fixture = TestBed.createComponent(IndexItemComponent);
  const props = Array.from({ length: availableCount }, (_, i) => ({ id: `p${i}`, name: `prop${i}` }));
  fixture.componentRef.setInput('index', { id: 'i1', propertyIds: ['p0'], isUnique: false });
  fixture.componentRef.setInput('availableProperties', props);
  fixture.componentRef.setInput('expanded', true);
  fixture.detectChanges();
  return fixture;
}

function setSearch(fixture: ReturnType<typeof setup>, value: string) {
  const search = fixture.nativeElement.querySelector('[data-testid="index-property-search"]') as HTMLInputElement;
  search.value = value;
  search.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('IndexItemComponent property multi-select', () => {
  it('filters the candidate list by search term', () => {
    const fixture = setup(12);
    setSearch(fixture, 'prop1');

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll(
        '[data-testid="index-property-options"] label'
      ) as NodeListOf<HTMLLabelElement>
    ).map(l => l.textContent?.trim());
    expect(labels).toEqual(['prop1', 'prop10', 'prop11']);
  });

  it('shows a no-match hint when the filter has no results', () => {
    const fixture = setup(12);
    setSearch(fixture, 'zzz');

    expect(fixture.nativeElement.textContent).toContain(DEFAULT_TRANSLATIONS.indexPanel.noMatch);
  });

  it('hides the search box when there are few candidate properties', () => {
    const fixture = setup(5);

    expect(fixture.nativeElement.querySelector('[data-testid="index-property-search"]')).toBeNull();
  });

  it('toggles a property and emits the updated combination', () => {
    const fixture = setup(5);
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);

    const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    checkboxes[1].click();

    expect(updated).toHaveBeenCalledWith({ propertyIds: ['p0', 'p1'] });
  });

  it('shows the selected property count', () => {
    const fixture = setup(5);

    const badges = fixture.nativeElement.querySelectorAll('.badge') as NodeListOf<HTMLElement>;
    expect(Array.from(badges).some(b => b.textContent?.trim() === '1')).toBe(true);
  });

  it('clears the search term on Escape without letting it bubble', () => {
    const fixture = setup(12);
    setSearch(fixture, 'prop1');
    const search = fixture.nativeElement.querySelector('[data-testid="index-property-search"]') as HTMLInputElement;

    const bubbled = vi.fn();
    fixture.nativeElement.addEventListener('keydown', bubbled);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.searchText()).toBe('');
    expect(bubbled).not.toHaveBeenCalled();
  });
});
