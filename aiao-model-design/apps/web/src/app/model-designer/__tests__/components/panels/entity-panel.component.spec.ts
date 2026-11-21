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
  ENTITY_BASE_METADATA_OPTIONS: {
    properties: [{ name: 'id', type: 'uuid', displayName: 'ID' }],
    computedProperties: [],
    relations: [{ name: 'parent', kind: 'm:1', columnName: 'parentId', displayName: 'Parent' }]
  },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: {
    properties: [{ name: 'treeParentId', type: 'uuid', displayName: 'Tree Parent' }],
    computedProperties: [],
    relations: []
  }
}));

import { EntityPanelComponent } from '../../../components/panels/entity-panel.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../../i18n/translations';
import type { DesignIndex, DesignProperty, DesignRelation } from '../../../models/index.js';

/**
 * 造一个满足 UUID 模板字面量类型的确定性测试 id。
 *
 * 实体主键类型是 `${string}-${string}-${string}-${string}-${string}`，
 * 裸字符串过不了类型检查；测试只关心 id 的稳定与可辨识。
 */
function uid(seed: string): DesignProperty['id'] {
  return `${seed}-0000-4000-8000-000000000000`;
}

/** 面板渲染测试只喂组件真正读的字段，不造完整 RxDB 实体。 */
interface SetupOptions {
  properties?: Partial<DesignProperty>[];
  relations?: Partial<DesignRelation>[];
  indexes?: Partial<DesignIndex>[];
  childPropertiesMap?: Map<string, Partial<DesignProperty>[]>;
}

function setup(options: SetupOptions = {}) {
  TestBed.configureTestingModule({
    imports: [EntityPanelComponent],
    providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
  });
  const fixture = TestBed.createComponent(EntityPanelComponent);
  fixture.componentRef.setInput('entity', { id: uid('e1'), name: 'Order' });
  fixture.componentRef.setInput('properties', options.properties ?? []);
  fixture.componentRef.setInput('relations', options.relations ?? []);
  fixture.componentRef.setInput('indexes', options.indexes ?? []);
  fixture.componentRef.setInput('childPropertiesMap', options.childPropertiesMap ?? new Map());
  fixture.componentRef.setInput('entities', [{ id: uid('e2'), name: 'Customer' }]);
  fixture.detectChanges();
  return fixture;
}

describe('EntityPanelComponent scroll target', () => {
  it('scrolls its own tab body, not another tabpanel earlier in the document', async () => {
    const decoy = document.createElement('div');
    decoy.setAttribute('role', 'tabpanel');
    const decoyScrollTo = vi.fn();
    decoy.scrollTo = decoyScrollTo;
    document.body.appendChild(decoy);

    const fixture = setup();
    document.body.appendChild(fixture.nativeElement);
    const ownTabBody = fixture.nativeElement.querySelector('[role="tabpanel"]') as HTMLElement;
    const ownScrollTo = vi.fn();
    ownTabBody.scrollTo = ownScrollTo;

    fixture.componentInstance.propertyAdded.subscribe(ev => {
      fixture.componentRef.setInput('properties', [{ id: uid('p1'), name: ev.name, propertyType: ev.type }]);
    });
    fixture.componentInstance.addProperty();
    fixture.detectChanges();
    TestBed.flushEffects();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(ownScrollTo).toHaveBeenCalled();
    expect(decoyScrollTo).not.toHaveBeenCalled();
    document.body.removeChild(fixture.nativeElement);
    document.body.removeChild(decoy);
  });
});

describe('EntityPanelComponent focus on add', () => {
  it('focuses and selects the name of the newly added property', async () => {
    const fixture = setup({ properties: [{ id: uid('p0'), name: 'existing', propertyType: 'string' }] });
    document.body.appendChild(fixture.nativeElement);

    fixture.componentInstance.propertyAdded.subscribe(ev => {
      fixture.componentRef.setInput('properties', [
        { id: uid('p0'), name: 'existing', propertyType: 'string' },
        { id: uid('p1'), name: ev.name, propertyType: ev.type }
      ]);
    });
    fixture.componentInstance.addProperty();
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 20));

    const inputs = fixture.nativeElement.querySelectorAll(
      '[data-testid="property-name-input"]'
    ) as NodeListOf<HTMLInputElement>;
    const last = inputs[inputs.length - 1];
    expect(last.value).toBe('newProperty');
    expect(document.activeElement).toBe(last);
    expect(last.selectionStart).toBe(0);
    expect(last.selectionEnd).toBe(last.value.length);
    document.body.removeChild(fixture.nativeElement);
  });

  it('focuses and selects the name of the newly added relation', async () => {
    const fixture = setup();
    fixture.componentInstance.activeTab.set('relations');
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);

    fixture.componentInstance.relationAdded.subscribe(ev => {
      fixture.componentRef.setInput('relations', [
        { id: uid('r1'), name: ev.name, relationKind: ev.kind, mappedEntityId: null, mappedPropertyId: null }
      ]);
    });
    fixture.componentInstance.addRelationFromFooter();
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 20));

    const input = fixture.nativeElement.querySelector('[data-testid="relation-name-input"]') as HTMLInputElement;
    expect(input.value).toBe('newRelation1');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    document.body.removeChild(fixture.nativeElement);
  });

  it('expands the newly added index', () => {
    const fixture = setup({ properties: [{ id: uid('p0'), name: 'id', propertyType: 'string' }] });
    fixture.componentInstance.activeTab.set('indexes');
    fixture.detectChanges();

    fixture.componentInstance.indexAdded.subscribe(ev => {
      fixture.componentRef.setInput('indexes', [
        { id: uid('i1'), propertyIds: ev.propertyIds, isUnique: ev.isUnique, displayName: null }
      ]);
    });
    fixture.componentInstance.addIndex();
    fixture.detectChanges();
    TestBed.flushEffects();

    expect(fixture.componentInstance.expandedItemId()).toBe(uid('i1'));
  });
});

describe('EntityPanelComponent inherited groups bulk toggle', () => {
  it('expands and collapses all inherited property groups', () => {
    const fixture = setup();
    const expandAll = fixture.nativeElement.querySelector('[data-testid="expand-all-groups"]') as HTMLButtonElement;
    const collapseAll = fixture.nativeElement.querySelector('[data-testid="collapse-all-groups"]') as HTMLButtonElement;

    expandAll.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.expandedGroups()).toEqual(new Set(['EntityBase']));

    collapseAll.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.expandedGroups().size).toBe(0);
  });

  it('bulk-expands inherited relation groups from the relations tab', () => {
    const fixture = setup();
    fixture.componentInstance.activeTab.set('relations');
    fixture.detectChanges();

    const expandAll = fixture.nativeElement.querySelector('[data-testid="expand-all-groups"]') as HTMLButtonElement;
    expandAll.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.expandedGroups()).toEqual(new Set(['EntityBase']));
  });
});

describe('EntityPanelComponent keyValue child focus', () => {
  it('focuses and selects the name of a newly added keyValue child property', async () => {
    const fixture = setup({
      properties: [{ id: uid('p0'), name: 'meta', propertyType: 'keyValue' }],
      childPropertiesMap: new Map([[uid('p0'), []]])
    });
    document.body.appendChild(fixture.nativeElement);

    fixture.componentInstance.childPropertyAdded.subscribe(ev => {
      fixture.componentRef.setInput(
        'childPropertiesMap',
        new Map([
          [
            uid('p0'),
            [
              {
                id: uid('c1'),
                name: ev.name,
                propertyType: 'string',
                isNullable: false,
                isRequired: false,
                isUnique: false,
                isReadonly: false,
                isSortable: false
              }
            ]
          ]
        ])
      );
    });
    fixture.componentInstance.addChildProperty(uid('p0'));
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 20));

    const inputs = fixture.nativeElement.querySelectorAll(
      '[data-testid="property-name-input"]'
    ) as NodeListOf<HTMLInputElement>;
    const childInput = inputs[1];
    expect(childInput.value).toBe('newField');
    expect(document.activeElement).toBe(childInput);
    expect(childInput.selectionStart).toBe(0);
    expect(childInput.selectionEnd).toBe(childInput.value.length);
    document.body.removeChild(fixture.nativeElement);
  });
});

describe('EntityPanelComponent escape layering', () => {
  it('closes the panel with Escape when nothing else is open', () => {
    const fixture = setup();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    const root = fixture.nativeElement.querySelector('[tabindex="-1"]') as HTMLElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(closed).toHaveBeenCalled();
  });

  it('collapses meta first instead of closing the panel', () => {
    const fixture = setup();
    fixture.componentInstance.toggleMeta();
    fixture.detectChanges();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    const root = fixture.nativeElement.querySelector('[tabindex="-1"]') as HTMLElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(closed).not.toHaveBeenCalled();
    expect(fixture.componentInstance.metaExpanded()).toBe(false);
  });

  it('closes an open type dropdown without closing the panel', () => {
    const fixture = setup({ properties: [{ id: uid('p0'), name: 'title', propertyType: 'string' }] });
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    const combobox = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLButtonElement;
    combobox.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).not.toBeNull();

    combobox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
    expect(closed).not.toHaveBeenCalled();
  });
});

describe('EntityPanelComponent relation errors', () => {
  it('renders relation validation reasons passed from the host', () => {
    const fixture = setup({
      relations: [{ id: uid('r1'), name: 'orders', relationKind: 'ONE_TO_MANY', mappedEntityId: null }]
    });
    fixture.componentRef.setInput(
      'relationErrors',
      new Map([[uid('r1'), ['validation.relationMustSpecifyMappedEntityId']]])
    );
    fixture.componentInstance.activeTab.set('relations');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Relation must specify mappedEntityId');
  });
});

describe('EntityPanelComponent direct edits', () => {
  it('emits entity metadata changes and debounces repeated saves', () => {
    const fixture = setup();
    fixture.componentRef.setInput('entity', {
      id: uid('e1'),
      name: 'Order',
      displayName: null,
      tableName: null,
      entityNamespace: null,
      extendsBase: 'EntityBase'
    });
    fixture.detectChanges();
    const changes: unknown[] = [];
    fixture.componentInstance.entityUpdated.subscribe(value => changes.push(value));
    const form = fixture.componentInstance.entityForm;
    form.name().value.set('Invoice');
    form.displayName().value.set('Invoices');
    form.tableName().value.set('invoices');
    form.entityNamespace().value.set('billing');
    form.extendsBase().value.set('TreeEntityBase');

    fixture.componentInstance.emitEntityChanges();
    expect(changes).toEqual([
      {
        name: 'Invoice',
        displayName: 'Invoices',
        tableName: 'invoices',
        extendsBase: 'TreeEntityBase',
        repositoryType: 'TreeRepository',
        entityNamespace: 'billing'
      }
    ]);

    vi.useFakeTimers();
    form.displayName().value.set('Invoice records');
    fixture.componentInstance.emitEntityChangesDebounced();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    expect(changes).toHaveLength(2);
  });

  it('handles property, child property, and index reorder guards', () => {
    const parentId = uid('p1');
    const fixture = setup({
      properties: [
        { id: uid('p1'), name: 'first', propertyType: 'string', sortOrder: 'a0' },
        { id: uid('p2'), name: 'second', propertyType: 'string', sortOrder: 'a2' }
      ],
      childPropertiesMap: new Map([
        [parentId, [
          { id: uid('c1'), name: 'firstChild', propertyType: 'string', sortOrder: 'a0' },
          { id: uid('c2'), name: 'secondChild', propertyType: 'string', sortOrder: 'a2' }
        ]]
      ]),
      indexes: [
        { id: uid('i1'), propertyIds: [uid('p1')], sortOrder: 'a0' },
        { id: uid('i2'), propertyIds: [uid('p2')], sortOrder: 'a2' }
      ]
    });
    const propertyUpdated: unknown[] = [];
    const childUpdated: unknown[] = [];
    const indexUpdated: unknown[] = [];
    fixture.componentInstance.propertyUpdated.subscribe(value => propertyUpdated.push(value));
    fixture.componentInstance.childPropertyUpdated.subscribe(value => childUpdated.push(value));
    fixture.componentInstance.indexUpdated.subscribe(value => indexUpdated.push(value));

    fixture.componentInstance.onPropertyDrop({ previousIndex: 0, currentIndex: 0 } as never);
    fixture.componentInstance.onPropertyDrop({ previousIndex: 4, currentIndex: 0 } as never);
    fixture.componentInstance.onPropertyDrop({ previousIndex: 0, currentIndex: 1 } as never);
    fixture.componentInstance.onChildPropertyDrop(parentId, { previousIndex: 0, currentIndex: 0 } as never);
    fixture.componentInstance.onChildPropertyDrop(parentId, { previousIndex: 3, currentIndex: 0 } as never);
    fixture.componentInstance.onChildPropertyDrop(parentId, { previousIndex: 0, currentIndex: 1 } as never);
    fixture.componentInstance.onIndexDrop({ previousIndex: 0, currentIndex: 0 } as never);
    fixture.componentInstance.onIndexDrop({ previousIndex: 3, currentIndex: 0 } as never);
    fixture.componentInstance.onIndexDrop({ previousIndex: 0, currentIndex: 1 } as never);

    expect(propertyUpdated).toHaveLength(1);
    expect(propertyUpdated[0]).toEqual({ id: uid('p1'), changes: { sortOrder: expect.any(String) } });
    expect(childUpdated).toHaveLength(1);
    expect(childUpdated[0]).toEqual({ id: uid('c1'), changes: { sortOrder: expect.any(String) } });
    expect(indexUpdated).toHaveLength(1);
    expect(indexUpdated[0]).toEqual({ id: uid('i1'), changes: { sortOrder: expect.any(String) } });
  });

  it('covers computed index state and item/group toggles', () => {
    const fixture = setup({
      properties: [{ id: uid('p1'), name: 'status', propertyType: 'string' }],
      indexes: [
        { id: uid('i1'), propertyIds: [uid('p1'), 'id'] },
        { id: uid('i2'), propertyIds: ['id', uid('p1')] },
        { id: uid('i3'), propertyIds: [] },
        { id: uid('i4'), propertyIds: undefined }
      ]
    });
    const component = fixture.componentInstance;

    expect(component.duplicateIndexIds()).toEqual(new Set([uid('i1'), uid('i2')]));
    expect(component.emptyIndexIds()).toEqual(new Set([uid('i3'), uid('i4')]));
    expect(component.canAddIndex()).toBe(true);
    expect(component.propertyCount()).toBeGreaterThan(0);
    expect(component.metaSummary()).toBe('EntityBase');

    component.toggleGroup('EntityBase');
    expect(component.expandedGroups()).toEqual(new Set(['EntityBase']));
    component.toggleGroup('EntityBase');
    expect(component.expandedGroups()).toEqual(new Set());
    component.toggleItemExpand('i1');
    expect(component.expandedItemId()).toBe('i1');
    component.toggleItemExpand('i1');
    expect(component.expandedItemId()).toBeNull();
    component.toggleMeta();
    expect(component.metaExpanded()).toBe(true);
    component.toggleMeta();
    expect(component.metaExpanded()).toBe(false);

    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.onPanelEscape();
    expect(closed).toHaveBeenCalledOnce();
    component.toggleMeta();
    component.onPanelEscape();
    expect(closed).toHaveBeenCalledOnce();
    expect(component.metaExpanded()).toBe(false);
  });

  it('adds an index from inherited properties when no custom property exists', () => {
    const fixture = setup();
    const added = vi.fn();
    fixture.componentInstance.indexAdded.subscribe(added);
    fixture.componentInstance.addIndex();
    expect(added).toHaveBeenCalledWith({ propertyIds: ['id'], isUnique: false });
    expect(fixture.componentInstance.canAddIndex()).toBe(true);
  });
});


describe('EntityPanelComponent branch coverage', () => {
  it('covers metadata no-op and invalid-field guards', () => {
    const fixture = setup();
    fixture.componentRef.setInput('entity', {
      id: uid('e1'),
      name: 'Order',
      displayName: null,
      tableName: null,
      entityNamespace: null,
      extendsBase: 'EntityBase'
    });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const updates: unknown[] = [];
    component.entityUpdated.subscribe(value => updates.push(value));

    component.emitEntityChanges();
    expect(updates).toHaveLength(0);

    component.entityForm.name().value.set('bad name');
    component.entityForm.tableName().value.set('bad table');
    component.emitEntityChanges();
    expect(updates).toHaveLength(0);
    expect(component.entityForm.name().invalid()).toBe(true);
    expect(component.entityForm.tableName().invalid()).toBe(true);

    fixture.componentRef.setInput('entity', {
      id: uid('e1'),
      name: 'Order',
      extendsBase: '',
      tableName: 'orders',
      entityNamespace: 'billing'
    });
    fixture.detectChanges();
    expect(component.metaSummary()).toBe('EntityBase · orders · billing');
    expect(component.currentExtendsBase()).toBe('EntityBase');

    fixture.componentRef.setInput('entity', null);
    fixture.detectChanges();
    component.emitEntityChanges();

    fixture.componentRef.setInput('entity', {
      id: uid('e1'),
      name: 'Order',
      displayName: 'Order display',
      tableName: 'orders',
      entityNamespace: 'billing',
      extendsBase: 'EntityBase'
    });
    fixture.detectChanges();
    component.entityForm.displayName().value.set('');
    component.entityForm.tableName().value.set('');
    component.entityForm.entityNamespace().value.set('');
    component.emitEntityChanges();
    expect(updates.at(-1)).toEqual({ displayName: null, tableName: null, entityNamespace: null });
  });

  it('covers pending add effects when the parent has not supplied new ids yet', () => {
    const fixture = setup();
    const component = fixture.componentInstance;

    component.addProperty();
    component.addRelationFromFooter();
    component.addIndex();
    component.addChildProperty(uid('missing-parent'));
    fixture.detectChanges();
    TestBed.flushEffects();

    expect(component.focusPropertyId()).toBeNull();
    expect(component.focusRelationId()).toBeNull();
    expect(component.expandedItemId()).toBeNull();
    expect(component.focusChildPropertyId()).toBeNull();
  });

  it('clears stale indexes when a tree base is removed', () => {
    const staleIndexId = uid('stale-index');
    const fixture = setup({ indexes: [{ id: staleIndexId, propertyIds: ['treeParentId'] }] });
    fixture.componentRef.setInput('entity', {
      id: uid('e1'),
      name: 'Order',
      extendsBase: 'TreeEntityBase'
    });
    fixture.detectChanges();

    const deleted = vi.fn();
    fixture.componentInstance.indexesDeleteBatch.subscribe(deleted);
    fixture.componentInstance.entityForm.extendsBase().value.set('EntityBase');
    fixture.componentInstance.emitEntityChanges();

    expect(deleted).toHaveBeenCalledWith([staleIndexId]);

    fixture.componentRef.setInput('indexes', []);
    fixture.componentRef.setInput('entity', {
      id: uid('e1'),
      name: 'Order',
      extendsBase: 'TreeEntityBase'
    });
    fixture.detectChanges();
    fixture.componentInstance.entityForm.extendsBase().value.set('EntityBase');
    fixture.componentInstance.emitEntityChanges();
    expect(deleted).toHaveBeenCalledTimes(1);
  });

  it('covers the leading edge of each reorder handler and debounce replacement', () => {
    const parentId = uid('parent');
    const fixture = setup({
      properties: [
        { id: uid('p1'), name: 'first', propertyType: 'string', sortOrder: 'a0' },
        { id: uid('p2'), name: 'second', propertyType: 'string', sortOrder: 'a2' }
      ],
      childPropertiesMap: new Map([
        [parentId, [
          { id: uid('c1'), name: 'firstChild', propertyType: 'string', sortOrder: 'a0' },
          { id: uid('c2'), name: 'secondChild', propertyType: 'string', sortOrder: 'a2' }
        ]]
      ]),
      indexes: [
        { id: uid('i1'), propertyIds: [uid('p1')], sortOrder: 'a0' },
        { id: uid('i2'), propertyIds: [uid('p2')], sortOrder: 'a2' }
      ]
    });
    const propertyUpdated: unknown[] = [];
    const childUpdated: unknown[] = [];
    const indexUpdated: unknown[] = [];
    fixture.componentInstance.propertyUpdated.subscribe(value => propertyUpdated.push(value));
    fixture.componentInstance.childPropertyUpdated.subscribe(value => childUpdated.push(value));
    fixture.componentInstance.indexUpdated.subscribe(value => indexUpdated.push(value));

    fixture.componentInstance.onPropertyDrop({ previousIndex: 1, currentIndex: 0 } as never);
    fixture.componentInstance.onChildPropertyDrop(parentId, { previousIndex: 1, currentIndex: 0 } as never);
    fixture.componentInstance.onChildPropertyDrop(uid('missing-parent'), { previousIndex: 0, currentIndex: 1 } as never);
    fixture.componentInstance.onIndexDrop({ previousIndex: 1, currentIndex: 0 } as never);

    vi.useFakeTimers();
    fixture.componentInstance.emitEntityChangesDebounced();
    fixture.componentInstance.emitEntityChangesDebounced();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();

    expect(propertyUpdated).toHaveLength(1);
    expect(childUpdated).toHaveLength(1);
    expect(indexUpdated).toHaveLength(1);
  });
});
