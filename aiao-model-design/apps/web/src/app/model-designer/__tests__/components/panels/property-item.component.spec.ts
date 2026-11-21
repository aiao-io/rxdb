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
import type { DesignProperty } from '../../../models/index.js';

type SetupOptions = {
  childProperties?: DesignProperty[];
  isChild?: boolean;
  siblingNames?: string[];
  expanded?: boolean;
  autoFocus?: boolean;
  translations?: typeof DEFAULT_TRANSLATIONS;
};

function setup(propertyOverrides: Partial<DesignProperty> = {}, options: SetupOptions = {}) {
  TestBed.configureTestingModule({
    imports: [PropertyItemComponent],
    providers: [
      {
        provide: MODEL_DESIGNER_TRANSLATIONS,
        useValue: signal(options.translations ?? DEFAULT_TRANSLATIONS)
      }
    ]
  });
  const fixture = TestBed.createComponent(PropertyItemComponent);
  fixture.componentRef.setInput('property', {
    id: 'p1',
    name: 'status',
    propertyType: 'string',
    isNullable: false,
    isRequired: false,
    isUnique: false,
    isReadonly: false,
    isSortable: false,
    columnName: null,
    displayName: null,
    defaultValue: null,
    enumValues: null,
    ...propertyOverrides
  } as DesignProperty);
  fixture.componentRef.setInput('childProperties', options.childProperties ?? []);
  fixture.componentRef.setInput('isChild', options.isChild ?? false);
  fixture.componentRef.setInput('siblingNames', options.siblingNames ?? []);
  fixture.componentRef.setInput('expanded', options.expanded ?? false);
  fixture.componentRef.setInput('autoFocus', options.autoFocus ?? false);
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

  it('navigates the open listbox with arrows and closes it with Escape', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    component.typeSelectOpen.set(true);

    component.onTypeListKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    component.onTypeListKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(component.typeSelectOpen()).toBe(true);

    component.onTypeListKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.typeSelectOpen()).toBe(false);
  });

  it('closes the trigger and listbox without changing the property for non-commit keys', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const updated = vi.fn();
    component.updated.subscribe(updated);

    component.typeSelectOpen.set(true);
    component.onTypeListKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(component.typeSelectOpen()).toBe(false);
    expect(updated).not.toHaveBeenCalled();

    component.typeSelectOpen.set(true);
    component.closeTypeSelect();
    expect(component.typeSelectOpen()).toBe(false);
    expect(component.highlighted()).toBeNull();

    component.onTypeTriggerKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.typeSelectOpen()).toBe(false);
  });
});

describe('PropertyItemComponent changes and validation', () => {
  it('emits all valid field changes and deduplicates enum values', () => {
    const fixture = setup({ propertyType: 'enum', enumValues: ['draft'] }, { expanded: true });
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);
    const form = fixture.componentInstance.propertyForm;

    form.name().value.set('state');
    form.isNullable().value.set(true);
    form.isRequired().value.set(true);
    form.isUnique().value.set(true);
    form.isReadonly().value.set(true);
    form.isSortable().value.set(true);
    form.columnName().value.set('state_code');
    form.displayName().value.set('State');
    form.defaultValue().value.set('draft');
    form.enumValues().value.set('draft, published, draft');

    fixture.componentInstance.emitChanges();

    expect(updated).toHaveBeenCalledWith({
      name: 'state',
      isNullable: true,
      isRequired: true,
      isUnique: true,
      isReadonly: true,
      isSortable: true,
      columnName: 'state_code',
      displayName: 'State',
      defaultValue: 'draft',
      enumValues: ['draft', 'published']
    });
  });

  it('does not emit invalid names, duplicate names, or invalid column names', () => {
    const fixture = setup({ columnName: 'status' }, { siblingNames: ['taken'], expanded: true });
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);
    const form = fixture.componentInstance.propertyForm;

    form.name().value.set('bad-name');
    form.columnName().value.set('bad-column');
    form.displayName().value.set('Status');
    fixture.componentInstance.emitChanges();

    expect(updated).toHaveBeenCalledWith({ displayName: 'Status' });
    expect(fixture.componentInstance.isNameDuplicate()).toBe(false);

    form.name().value.set('taken');
    expect(fixture.componentInstance.isNameDuplicate()).toBe(true);
    fixture.componentInstance.emitChanges();
    expect(updated).toHaveBeenCalledTimes(2);
    expect(updated).toHaveBeenLastCalledWith({ displayName: 'Status' });
  });

  it('emits null for cleared enum values', () => {
    const fixture = setup({ propertyType: 'enum', enumValues: ['draft'] });
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);
    const enumValues = fixture.componentInstance.propertyForm.enumValues();

    enumValues.value.set('');
    fixture.componentInstance.emitChanges();
    expect(updated).toHaveBeenCalledWith({ enumValues: null });
  });

  it('suppresses unchanged empty enum values', () => {
    const emptyFixture = setup({ propertyType: 'enum', enumValues: [] });
    const emptyUpdated = vi.fn();
    emptyFixture.componentInstance.updated.subscribe(emptyUpdated);
    emptyFixture.componentInstance.propertyForm.enumValues().value.set('   ');
    emptyFixture.componentInstance.emitChanges();
    expect(emptyUpdated).not.toHaveBeenCalled();
  });

  it('renders flag summaries and supports child property mode', () => {
    const child = {
      id: 'c1',
      name: 'source',
      propertyType: 'string',
      isNullable: false,
      isRequired: false,
      isUnique: false,
      isReadonly: false,
      isSortable: false,
      columnName: null,
      displayName: null,
      defaultValue: null,
      enumValues: null
    } as DesignProperty;
    const fixture = setup(
      {
        propertyType: 'keyValue',
        isNullable: true,
        isRequired: true,
        isUnique: true,
        isReadonly: true,
        isSortable: true
      },
      { childProperties: [child] }
    );

    expect(fixture.nativeElement.textContent).toContain(DEFAULT_TRANSLATIONS.entityPanel.required);
    expect(fixture.nativeElement.textContent).toContain(DEFAULT_TRANSLATIONS.entityPanel.nullable);
    expect(fixture.nativeElement.textContent).toContain(DEFAULT_TRANSLATIONS.entityPanel.unique);
    expect(fixture.nativeElement.textContent).toContain(DEFAULT_TRANSLATIONS.entityPanel.readonly);
    expect(fixture.nativeElement.textContent).toContain(DEFAULT_TRANSLATIONS.entityPanel.sortable);

    const childToggle = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes(DEFAULT_TRANSLATIONS.entityPanel.keyValueProperties)
    ) as HTMLButtonElement;
    childToggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('source');
    childToggle.click();
    fixture.detectChanges();

    const addChild = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      button.textContent?.includes(DEFAULT_TRANSLATIONS.entityPanel.addChildProperty)
    ) as HTMLButtonElement;
    const childAdded = vi.fn();
    fixture.componentInstance.childAdded.subscribe(childAdded);
    addChild.click();
    expect(childAdded).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('property', {
      id: 'p1',
      name: 'source',
      propertyType: 'string',
      isNullable: false,
      isRequired: false,
      isUnique: false,
      isReadonly: false,
      isSortable: false,
      columnName: null,
      displayName: null,
      defaultValue: null,
      enumValues: null
    } as DesignProperty);
    fixture.componentRef.setInput('isChild', true);
    fixture.detectChanges();
    const childUpdated = vi.fn();
    fixture.componentInstance.updated.subscribe(childUpdated);
    fixture.componentInstance.setPropertyType('number');
    expect(childUpdated).toHaveBeenCalledWith({ propertyType: 'number' });
    expect(fixture.nativeElement.querySelector('button[aria-label*="Expand"]')).toBeNull();
  });

  it('emits detail toggles and supports autofocus', async () => {
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus');
    const fixture = setup();
    const toggled = vi.fn();
    const handled = vi.fn();
    fixture.componentInstance.expandToggled.subscribe(toggled);
    fixture.componentInstance.focusHandled.subscribe(handled);
    fixture.componentRef.setInput('autoFocus', true);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 20));

    const input = fixture.nativeElement.querySelector('[data-testid="property-name-input"]') as HTMLInputElement;
    expect(focus).toHaveBeenCalled();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(handled).toHaveBeenCalledOnce();

    fixture.componentInstance.toggleDetails();
    fixture.componentInstance.toggleChildrenCollapsed();
    fixture.componentInstance.toggleChildrenCollapsed();
    expect(toggled).toHaveBeenCalledOnce();
    document.body.removeChild(fixture.nativeElement);
    focus.mockRestore();
  });
});


describe('PropertyItemComponent remaining branches', () => {
  it('uses static labels when translations omit property type labels', () => {
    const fixture = setup({}, { translations: { ...DEFAULT_TRANSLATIONS, propertyTypes: {} } });
    const component = fixture.componentInstance;

    expect(component.propertyTypeOptions().find(option => option.value === 'string')?.label).toBe('String');
    expect(component.keyValueSubTypeOptions().find(option => option.value === 'number')?.label).toBe('Number');
  });

  it('covers parent and child type navigation while the list is already open', () => {
    const fixture = setup();
    const component = fixture.componentInstance;

    component.typeSelectOpen.set(true);
    component.onTypeTriggerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    component.onTypeTriggerKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    component.toggleTypeSelect();
    component.toggleTypeSelect();

    expect(component.typeSelectOpen()).toBe(true);

    fixture.componentRef.setInput('isChild', true);
    fixture.detectChanges();
    component.typeSelectOpen.set(true);
    component.onTypeTriggerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    component.onTypeListKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    component.onTypeListKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    component.onTypeListKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(component.typeSelectOpen()).toBe(false);
  });

  it('covers empty and duplicate names, child summaries, and fallback type metadata', () => {
    const fixture = setup({ propertyType: 'unknown' as never }, { siblingNames: ['taken'] });
    const component = fixture.componentInstance;

    component.propertyForm.name().value.set('taken');
    expect(component.isNameDuplicate()).toBe(true);
    expect(component.nameDuplicateError()).toContain('taken');

    component.propertyForm.name().value.set('');
    expect(component.isNameDuplicate()).toBe(false);
    expect(component.currentTypeMeta().value).toBe('uuid');

    fixture.componentRef.setInput('isChild', true);
    fixture.detectChanges();
    expect(component.nameDuplicateError()).toBe(DEFAULT_TRANSLATIONS.validation.childPropertyNameDuplicate);
    expect(component.flagSummary()).toEqual([]);
  });

  it('emits null for cleared optional values and handles an enum with no prior values', () => {
    const fixture = setup({
      propertyType: 'enum',
      enumValues: null,
      columnName: 'status_code',
      displayName: 'Status',
      defaultValue: 'draft'
    });
    const updated = vi.fn();
    fixture.componentInstance.updated.subscribe(updated);
    const form = fixture.componentInstance.propertyForm;
    form.columnName().value.set('');
    form.displayName().value.set('');
    form.defaultValue().value.set('');
    form.enumValues().value.set('draft, draft');
    fixture.componentInstance.emitChanges();

    expect(updated).toHaveBeenCalledWith({
      columnName: null,
      displayName: null,
      defaultValue: null,
      enumValues: ['draft']
    });
  });
});
