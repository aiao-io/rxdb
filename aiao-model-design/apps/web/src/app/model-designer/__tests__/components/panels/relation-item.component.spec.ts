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

import { RelationItemComponent } from '../../../components/panels/relation-item.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../../i18n/translations';
import type { DesignRelation } from '../../../models/index.js';

function setup() {
  TestBed.configureTestingModule({
    imports: [RelationItemComponent],
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  const fixture = TestBed.createComponent(RelationItemComponent);
  fixture.componentRef.setInput('relation', {
    id: 'r1',
    name: 'orders',
    relationKind: 'ONE_TO_MANY',
    mappedEntityId: 'e2',
    mappedPropertyId: 'p1'
  });
  fixture.componentRef.setInput('entities', [{ id: 'e2', name: 'Order' }]);
  fixture.detectChanges();
  return fixture;
}

describe('RelationItemComponent validation reasons', () => {
  it('renders localized error messages with placeholders substituted', () => {
    const fixture = setup();
    fixture.componentRef.setInput('errors', ['validation.relationNameDuplicated', 'validation.missingInverseRelation']);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Relation name "orders" is duplicated');
    expect(fixture.nativeElement.textContent).toContain('Missing inverse ONE_TO_MANY relation on "Order"');
  });

  it('renders target id fallback when the target entity is unknown', () => {
    const fixture = setup();
    fixture.componentRef.setInput('errors', ['validation.targetEntityDoesNotExist']);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Target entity with ID "e2" does not exist');
  });

  it('ignores error keys without a matching validation template', () => {
    const fixture = setup();
    fixture.componentRef.setInput('errors', ['validation.notARealKey', 'foo.bar']);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('notARealKey');
    expect(fixture.nativeElement.textContent).not.toContain('foo.bar');
  });
});

describe('RelationItemComponent kind labels', () => {
  it('shows the shorthand kind label in the collapsed summary', () => {
    const fixture = setup();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('1:N → Order');
  });

  it('shows the shorthand kind label in the kind select options', () => {
    const fixture = setup();
    fixture.componentRef.setInput('expanded', true);
    fixture.detectChanges();

    const kindSelect = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(kindSelect.textContent).toContain('ONE_TO_MANY (1:N)');
  });
});

describe('RelationItemComponent autoFocus', () => {
  it('focuses and selects the name input when autoFocus is set', async () => {
    const fixture = setup();
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('autoFocus', true);
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 20));

    const input = fixture.nativeElement.querySelector('[data-testid="relation-name-input"]') as HTMLInputElement;
    expect(input.value).toBe('orders');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    document.body.removeChild(fixture.nativeElement);
  });

  it('leaves focus alone when autoFocus is false', () => {
    const fixture = setup();
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    TestBed.flushEffects();

    const input = fixture.nativeElement.querySelector('[data-testid="relation-name-input"]') as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    document.body.removeChild(fixture.nativeElement);
  });
});

describe('RelationItemComponent changes and state', () => {
  it('emits every valid relation field change', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const updated = vi.fn();
    component.updated.subscribe(updated);
    fixture.componentRef.setInput('expanded', true);
    fixture.componentRef.setInput('allRelations', [
      {
        id: 'r2',
        name: 'customerOrders',
        relationKind: 'MANY_TO_ONE',
        mappedEntityId: 'e2',
        designEntityId: 'e2'
      } as unknown as DesignRelation
    ]);
    fixture.detectChanges();

    const form = component.relationForm;
    form.name().value.set('customerOrders');
    form.displayName().value.set('Customer orders');
    form.relationKind().value.set('MANY_TO_MANY');
    form.mappedEntityId().value.set('e2');
    form.columnName().value.set('customer_id');
    form.mappedPropertyId().value.set('r2');
    form.onDeleteAction().value.set('CASCADE');
    form.onUpdateAction().value.set('RESTRICT');

    component.emitChanges();

    expect(updated).toHaveBeenCalledWith({
      name: 'customerOrders',
      displayName: 'Customer orders',
      relationKind: 'MANY_TO_MANY',
      columnName: 'customer_id',
      mappedPropertyId: 'r2',
      onDeleteAction: 'CASCADE',
      onUpdateAction: 'RESTRICT'
    });
    expect(component.isManyToMany()).toBe(true);
    expect(component.targetRelations().map(relation => relation.id)).toEqual(['r2']);
  });

  it('emits null when optional relation fields are cleared', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const updated = vi.fn();
    component.updated.subscribe(updated);
    fixture.componentRef.setInput('relation', {
      id: 'r1',
      name: 'orders',
      relationKind: 'ONE_TO_MANY',
      mappedEntityId: 'e2',
      displayName: 'Orders',
      columnName: 'customer_id',
      mappedPropertyId: 'p1',
      onDeleteAction: 'CASCADE',
      onUpdateAction: 'RESTRICT'
    } as unknown as DesignRelation);
    fixture.detectChanges();

    const form = component.relationForm;
    form.displayName().value.set('');
    form.mappedEntityId().value.set('');
    form.columnName().value.set('');
    form.mappedPropertyId().value.set('');
    form.onDeleteAction().value.set('NO_ACTION');
    form.onUpdateAction().value.set('NO_ACTION');
    component.emitChanges();

    expect(updated).toHaveBeenCalledWith({
      displayName: null,
      mappedEntityId: null,
      columnName: null,
      mappedPropertyId: null,
      onDeleteAction: 'NO_ACTION',
      onUpdateAction: 'NO_ACTION'
    });
  });

  it('skips invalid column names and emits no event when nothing changes', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const updated = vi.fn();
    component.updated.subscribe(updated);

    component.emitChanges();
    expect(updated).not.toHaveBeenCalled();

    component.relationForm.columnName().value.set('bad-column');
    component.relationForm.displayName().value.set('Customer');
    component.emitChanges();
    expect(updated).toHaveBeenCalledWith({ displayName: 'Customer' });
  });

  it('handles detail and deletion outputs and unknown relation kinds', () => {
    const fixture = setup();
    const component = fixture.componentInstance;
    const toggled = vi.fn();
    const deleted = vi.fn();
    component.expandToggled.subscribe(toggled);
    component.deleted.subscribe(deleted);

    component.toggleDetails();
    expect(toggled).toHaveBeenCalledOnce();
    expect(component.kindLabel('UNKNOWN')).toBe('UNKNOWN');

    fixture.componentRef.setInput('expanded', true);
    fixture.detectChanges();
    const deleteButton = fixture.nativeElement.querySelector('button[aria-label="Delete relation"]') as HTMLButtonElement;
    deleteButton.click();
    expect(deleted).toHaveBeenCalledOnce();
  });
});
