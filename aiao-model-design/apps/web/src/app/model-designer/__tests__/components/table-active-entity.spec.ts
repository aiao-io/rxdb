import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { resolveActiveEntity } from '../../components/table/table-view.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../../models/index.js';
import TableShellPage from '../../pages/table-shell.page';
import { DesignerStateService } from '../../services/designer-state.service';

describe('resolveActiveEntity', () => {
  const entities = [{ id: 'e1', name: 'User' }] as unknown as DesignEntity[];

  it('MUST resolve an existing route entity', () => {
    expect(resolveActiveEntity(entities, 'e1')).toBe(entities[0]);
  });

  it('MUST NOT fall back to the first entity for a missing route id', () => {
    expect(resolveActiveEntity(entities, 'missing')).toBeNull();
    expect(resolveActiveEntity(entities, null)).toBeNull();
  });
});

describe('TableShellPage route input', () => {
  it('allows the route input to arrive after the first signal evaluation', async () => {
    const fakeState = {
      entities: signal<DesignEntity[]>([]),
      propertiesMap: signal(new Map()),
      relationsMap: signal(new Map()),
      indexesMap: signal(new Map()),
      onEntitySelected: vi.fn(() => true)
    };

    await TestBed.configureTestingModule({
      imports: [TableShellPage],
      providers: [
        provideRouter([]),
        { provide: DesignerStateService, useValue: fakeState },
        { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }
      ]
    })
      .overrideComponent(TableShellPage, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(TableShellPage);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.componentInstance.activeEntity()).toBeNull();
  });
});

type TableShellFixture = {
  fixture: ReturnType<typeof TestBed.createComponent<TableShellPage>>;
  router: { events: Subject<NavigationEnd>; navigate: ReturnType<typeof vi.fn> };
  state: {
    entities: ReturnType<typeof signal<DesignEntity[]>>;
    propertiesMap: ReturnType<typeof signal<Map<string, DesignProperty[]>>>;
    relationsMap: ReturnType<typeof signal<Map<string, DesignRelation[]>>>;
    indexesMap: ReturnType<typeof signal<Map<string, DesignIndex[]>>>;
    onEntitySelected: ReturnType<typeof vi.fn>;
    onTableEntityUpdated: ReturnType<typeof vi.fn>;
    onEntityDeleted: ReturnType<typeof vi.fn>;
    onPropertyAdded: ReturnType<typeof vi.fn>;
    onRelationAdded: ReturnType<typeof vi.fn>;
    onIndexAdded: ReturnType<typeof vi.fn>;
  };
};

async function setupTableShell(entityId = 'e1'): Promise<TableShellFixture> {
  const routerEvents = new Subject<NavigationEnd>();
  const router = {
    events: routerEvents,
    url: `/model-designer/table/${entityId}/properties`,
    navigate: vi.fn().mockResolvedValue(true)
  };
  const entity = {
    id: 'e1',
    name: 'Order',
    displayName: 'Orders',
    tableName: 'orders',
    extendsBase: 'EntityBase',
    entityNamespace: 'sales'
  } as unknown as DesignEntity;
  const property = { id: 'p1', name: 'status', propertyType: 'string' } as unknown as DesignProperty;
  const relation = { id: 'r1', name: 'customer', relationKind: 'MANY_TO_ONE' } as unknown as DesignRelation;
  const index = { id: 'i1', propertyIds: ['p1'], isUnique: true } as unknown as DesignIndex;
  const state = {
    entities: signal([entity]),
    propertiesMap: signal(new Map([['e1', [property]]])),
    relationsMap: signal(new Map([['e1', [relation]]])),
    indexesMap: signal(new Map([['e1', [index]]])),
    onEntitySelected: vi.fn(() => entityId === 'e1'),
    onTableEntityUpdated: vi.fn(),
    onEntityDeleted: vi.fn().mockResolvedValue(true),
    onPropertyAdded: vi.fn(),
    onRelationAdded: vi.fn(),
    onIndexAdded: vi.fn()
  };

  await TestBed.configureTestingModule({
    imports: [TableShellPage],
    providers: [
      { provide: Router, useValue: router },
      { provide: DesignerStateService, useValue: state },
      { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }
    ]
  })
    .overrideComponent(TableShellPage, { set: { template: '' } })
    .compileComponents();

  const fixture = TestBed.createComponent(TableShellPage);
  fixture.componentRef.setInput('entityId', entityId);
  fixture.detectChanges();
  TestBed.flushEffects();
  fixture.detectChanges();
  return { fixture, router: { events: routerEvents, navigate: router.navigate }, state };
}

describe('TableShellPage behavior', () => {
  it('resolves the active entity and inherited/custom counts', async () => {
    const { fixture } = await setupTableShell();
    const page = fixture.componentInstance;

    expect(page.activeEntity()?.name).toBe('Order');
    expect(page.propertiesCount()).toBeGreaterThan(1);
    expect(page.relationsCount()).toBe(1);
    expect(page.indexesCount()).toBe(1);
  });

  it('tracks the active tab from navigation events', async () => {
    const { fixture, router } = await setupTableShell();
    const page = fixture.componentInstance;

    router.events.next(new NavigationEnd(1, '/model-designer/table/e1/relations', '/model-designer/table/e1/relations'));
    expect(page.activeTab()).toBe('relations');
    router.events.next(new NavigationEnd(2, '/model-designer/table/e1/indexes', '/model-designer/table/e1/indexes'));
    expect(page.activeTab()).toBe('indexes');
    router.events.next(new NavigationEnd(3, '/model-designer/table/e1/properties', '/model-designer/table/e1/properties'));
    expect(page.activeTab()).toBe('properties');
  });

  it('redirects a missing route entity when the state contains entities', async () => {
    const { router } = await setupTableShell('missing');

    expect(router.navigate).toHaveBeenCalledWith(['model-designer', 'canvas']);
  });

  it('emits changed entity metadata and derives the repository type', async () => {
    const { fixture, state } = await setupTableShell();
    const page = fixture.componentInstance;

    page.entityForm.name().value.set('Invoice');
    page.entityForm.displayName().value.set('Invoices');
    page.entityForm.tableName().value.set('invoices');
    page.entityForm.extendsBase().value.set('TreeEntityBase');
    page.entityForm.entityNamespace().value.set('billing');
    page.emitEntityChanges();

    expect(state.onTableEntityUpdated).toHaveBeenCalledWith({
      id: 'e1',
      changes: {
        name: 'Invoice',
        displayName: 'Invoices',
        tableName: 'invoices',
        extendsBase: 'TreeEntityBase',
        repositoryType: 'TreeRepository',
        entityNamespace: 'billing'
      }
    });
  });

  it('handles entity deletion and routes back to canvas after confirmation', async () => {
    const { fixture, router, state } = await setupTableShell();

    await fixture.componentInstance.onEntityDelete('e1');

    expect(state.onEntityDeleted).toHaveBeenCalledWith('e1');
    expect(router.navigate).toHaveBeenCalledWith(['model-designer', 'canvas']);
  });

  it('emits add actions with unique names and the first property for an index', async () => {
    const { fixture, state } = await setupTableShell();
    const page = fixture.componentInstance;

    page.onAddProperty();
    page.onAddRelation();
    page.onAddIndex();

    expect(state.onPropertyAdded).toHaveBeenCalledWith({ entityId: 'e1', name: 'newProperty', type: 'string' });
    expect(state.onRelationAdded).toHaveBeenCalledWith({
      entityId: 'e1',
      name: 'newRelation1',
      kind: 'ONE_TO_MANY',
      targetEntity: ''
    });
    expect(state.onIndexAdded).toHaveBeenCalledWith({ entityId: 'e1', propertyIds: ['p1'], isUnique: false });
  });

  it('keeps empty route state inert and does not navigate when no entity is selected', async () => {
    const { fixture, router, state } = await setupTableShell('');
    const page = fixture.componentInstance;

    expect(page.activeEntity()).toBeNull();
    expect(page.propertiesCount()).toBe(0);
    expect(page.relationsCount()).toBe(0);
    expect(page.indexesCount()).toBe(0);
    expect(router.navigate).not.toHaveBeenCalled();

    page.emitEntityChanges();
    page.onAddProperty();
    page.onAddRelation();
    page.onAddIndex();
    expect(state.onTableEntityUpdated).not.toHaveBeenCalled();
    expect(state.onPropertyAdded).not.toHaveBeenCalled();
    expect(state.onRelationAdded).not.toHaveBeenCalled();
    expect(state.onIndexAdded).not.toHaveBeenCalled();
  });

  it('emits only valid entity metadata changes and supports clearing optional fields', async () => {
    const { fixture, state } = await setupTableShell();
    const page = fixture.componentInstance;

    page.entityForm.name().value.set('bad-name');
    page.entityForm.tableName().value.set('bad-table');
    page.entityForm.displayName().value.set('Invoices');
    page.entityForm.entityNamespace().value.set('');
    page.emitEntityChanges();
    expect(state.onTableEntityUpdated).toHaveBeenCalledWith({
      id: 'e1',
      changes: { displayName: 'Invoices', entityNamespace: null }
    });

    state.onTableEntityUpdated.mockClear();
    page.entityForm.name().value.set('Order');
    page.entityForm.tableName().value.set('');
    page.entityForm.displayName().value.set('');
    page.entityForm.entityNamespace().value.set('');
    page.emitEntityChanges();
    expect(state.onTableEntityUpdated).toHaveBeenCalledWith({
      id: 'e1',
      changes: { displayName: null, tableName: null, entityNamespace: null }
    });
  });

  it('handles cancelled entity deletion and empty property maps', async () => {
    const { fixture, state, router } = await setupTableShell();
    const page = fixture.componentInstance;
    state.onEntityDeleted.mockResolvedValue(false);

    await page.onEntityDelete('e1');
    expect(router.navigate).not.toHaveBeenCalledWith(['model-designer', 'canvas']);

    state.propertiesMap.set(new Map());
    state.relationsMap.set(new Map());
    state.indexesMap.set(new Map());
    page.onAddProperty();
    page.onAddRelation();
    page.onAddIndex();
    expect(state.onPropertyAdded).toHaveBeenCalledWith({ entityId: 'e1', name: 'newProperty', type: 'string' });
    expect(state.onRelationAdded).toHaveBeenCalledWith({
      entityId: 'e1',
      name: 'newRelation1',
      kind: 'ONE_TO_MANY',
      targetEntity: ''
    });
    expect(state.onIndexAdded).toHaveBeenCalledWith({ entityId: 'e1', propertyIds: [], isUnique: false });
  });
});
