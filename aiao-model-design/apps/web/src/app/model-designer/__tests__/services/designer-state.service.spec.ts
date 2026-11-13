vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aiao/rxdb', () => ({
  __decorateClass: (_d: unknown[], target: unknown) => target,
  RxDB: class {},
  Entity: () => (target: unknown) => target,
  TreeEntity: () => (target: unknown) => target,
  EntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
    async save() {
      //
    }
    async remove() {
      //
    }
  },
  TreeAdjacencyListEntityBase: class {
    [key: string]: unknown;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
      if (!this['id']) this['id'] = crypto.randomUUID();
    }
    async save() {
      //
    }
    async remove() {
      //
    }
  },
  PropertyType: { string: 'string', number: 'number', integer: 'integer', boolean: 'boolean' },
  RelationKind: { ONE_TO_MANY: 'ONE_TO_MANY', MANY_TO_ONE: 'MANY_TO_ONE' },
  OnDeleteAction: { CASCADE: 'CASCADE' },
  ENTITY_BASE_METADATA_OPTIONS: { properties: [], computedProperties: [], relations: [] },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] }
}));

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: () => ({ value: () => [] })
}));

import { RxDB } from '@aiao/rxdb';
import { DEFAULT_TRANSLATIONS } from '../../i18n';
import { AiOperationGuardService } from '../../services/ai-operation-guard.service';
import { CLIENT_PACKAGE_ADAPTER } from '../../services/client-package-adapter';
import { CodeGeneratorService } from '../../services/code-generator.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { DesignEntityService } from '../../services/design-entity.service';
import { DesignIndexService } from '../../services/design-index.service';
import { DesignPropertyService } from '../../services/design-property.service';
import { DesignRelationService } from '../../services/design-relation.service';
import { DesignerStateService } from '../../services/designer-state.service';
import { ModelDesignService } from '../../services/model-design.service';
import { ModelValidatorService } from '../../services/model-validator.service';

describe('DesignerStateService — 删除二次确认 / 关系 / 类型变更', () => {
  let service: DesignerStateService;
  let confirmDialog: { confirm: ReturnType<typeof vi.fn> };
  let removeManySpy: ReturnType<typeof vi.fn>;
  let entityCreateSpy: ReturnType<typeof vi.fn>;
  let entityUpdateSpy: ReturnType<typeof vi.fn>;
  let relationRemoveSpy: ReturnType<typeof vi.fn>;
  let createLinkedPairSpy: ReturnType<typeof vi.fn>;
  let propertyUpdateSpy: ReturnType<typeof vi.fn>;
  let propertyRemoveSpy: ReturnType<typeof vi.fn>;
  let indexRemoveSpy: ReturnType<typeof vi.fn>;
  let findByTargetEntitySpy: ReturnType<typeof vi.fn>;
  let allRelationsSignal: WritableSignal<
    Array<{ id: string; name: string; designEntityId: string; mappedEntityId?: string | null }>
  >;
  let entitiesSignal: WritableSignal<unknown[]>;
  let archivePackageSpy: ReturnType<typeof vi.fn>;
  let publishPackageSpy: ReturnType<typeof vi.fn>;
  let downloadBlobSpy: ReturnType<typeof vi.fn>;
  let validateModelSpy: ReturnType<typeof vi.fn>;
  let validateEntityIdentitySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    confirmDialog = { confirm: vi.fn().mockResolvedValue(true) };
    removeManySpy = vi.fn().mockResolvedValue(undefined);
    entityCreateSpy = vi.fn().mockResolvedValue({ id: 'new-entity' });
    entityUpdateSpy = vi.fn().mockResolvedValue(undefined);
    relationRemoveSpy = vi.fn().mockResolvedValue(undefined);
    createLinkedPairSpy = vi.fn().mockResolvedValue({ source: { id: 'r1' }, inverse: { id: 'r2' } });
    propertyUpdateSpy = vi.fn().mockResolvedValue(undefined);
    propertyRemoveSpy = vi.fn().mockResolvedValue(undefined);
    indexRemoveSpy = vi.fn().mockResolvedValue(undefined);
    findByTargetEntitySpy = vi.fn().mockReturnValue([]);
    allRelationsSignal = signal([]);
    entitiesSignal = signal<unknown[]>([]);
    archivePackageSpy = vi.fn().mockResolvedValue({
      blob: new Blob(['tgz'], { type: 'application/gzip' }),
      packageName: '@acme/blog-rxdb',
      version: '1.0.0',
      designRevision: 'a'.repeat(64),
      filename: 'acme-blog-rxdb-1.0.0.tgz'
    });
    publishPackageSpy = vi.fn().mockResolvedValue({
      packageName: '@acme/blog-rxdb',
      version: '1.1.0',
      designRevision: 'b'.repeat(64),
      status: 'published'
    });
    downloadBlobSpy = vi.fn();
    validateModelSpy = vi.fn(() => ({
      valid: true,
      entityErrors: new Map<string, string[]>(),
      relationErrors: new Map<string, string[]>(),
      propertyErrors: new Map<string, string[]>(),
      globalErrors: []
    }));

    validateEntityIdentitySpy = vi.fn().mockReturnValue({ valid: true, errors: [] });

    TestBed.configureTestingModule({
      providers: [
        DesignerStateService,
        { provide: ConfirmDialogService, useValue: confirmDialog },
        {
          provide: DesignEntityService,
          useValue: {
            entities: entitiesSignal,
            selectedEntityIds: signal(new Set<string>()),
            create: entityCreateSpy,
            update: entityUpdateSpy,
            removeMany: removeManySpy
          }
        },
        {
          provide: DesignRelationService,
          useValue: {
            allRelations: allRelationsSignal,
            relationsOf: () => () => [],
            remove: relationRemoveSpy,
            createLinkedPair: createLinkedPairSpy,
            findByTargetEntity: findByTargetEntitySpy
          }
        },
        {
          provide: DesignPropertyService,
          useValue: {
            propertiesOf: () => () => [],
            childPropertiesOf: () => () => [],
            update: propertyUpdateSpy,
            remove: propertyRemoveSpy
          }
        },
        {
          provide: DesignIndexService,
          useValue: {
            indexesOf: () => () => [],
            remove: indexRemoveSpy
          }
        },
        {
          provide: CodeGeneratorService,
          useValue: {
            toClientDesignContract: vi.fn(() => ({ entities: [], metadata: { designName: 'Blog' } })),
            downloadBlob: downloadBlobSpy
          }
        },
        { provide: CLIENT_PACKAGE_ADAPTER, useValue: { archive: archivePackageSpy, publish: publishPackageSpy } },
        {
          provide: ModelValidatorService,
          useValue: { validateModel: validateModelSpy, validateEntityIdentity: validateEntityIdentitySpy }
        },
        { provide: AiOperationGuardService, useValue: {} },
        { provide: ModelDesignService, useValue: { activeDesign: () => null } },
        {
          provide: RxDB,
          useValue: {
            versionManager: { history: () => ({ undoCount$: of(0), redoCount$: of(0), undo: vi.fn(), redo: vi.fn() }) }
          }
        }
      ]
    });

    service = TestBed.inject(DesignerStateService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('onEntitiesDeleted', () => {
    it('MUST ask for confirmation before removing entities', async () => {
      await service.onEntitiesDeleted(['e1', 'e2']);

      expect(confirmDialog.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: DEFAULT_TRANSLATIONS.confirmDialog.deleteEntityTitle,
          message: DEFAULT_TRANSLATIONS.confirmDialog.deleteEntityMessage.replace('{count}', '2'),
          danger: true
        })
      );
      expect(removeManySpy).toHaveBeenCalledWith(['e1', 'e2']);
    });

    it('MUST list affected relation names in the confirm message', async () => {
      allRelationsSignal.set([
        { id: 'r1', name: 'posts', designEntityId: 'e1', mappedEntityId: 'e2' },
        { id: 'r2', name: 'author', designEntityId: 'e2', mappedEntityId: 'e1' }
      ]);
      findByTargetEntitySpy.mockImplementation((id: string) =>
        allRelationsSignal().filter(r => r.mappedEntityId === id)
      );

      await service.onEntitiesDeleted(['e1']);

      const message = confirmDialog.confirm.mock.calls[0][0].message as string;
      expect(message).toContain('posts');
      expect(message).toContain('author');
      expect(message).toContain(DEFAULT_TRANSLATIONS.confirmDialog.deleteEntityAffectedPrefix.split('{list}')[0]);
    });

    it('MUST NOT remove entities when the user cancels', async () => {
      confirmDialog.confirm.mockResolvedValue(false);

      await service.onEntitiesDeleted(['e1']);

      expect(removeManySpy).not.toHaveBeenCalled();
    });

    it('MUST skip confirmation for an empty id list', async () => {
      await service.onEntitiesDeleted([]);

      expect(confirmDialog.confirm).not.toHaveBeenCalled();
      expect(removeManySpy).not.toHaveBeenCalled();
    });
  });

  describe('onEntityDeleted', () => {
    it('MUST delegate to onEntitiesDeleted and respect cancellation', async () => {
      confirmDialog.confirm.mockResolvedValue(false);

      const deleted = await service.onEntityDeleted('e1');

      expect(confirmDialog.confirm).toHaveBeenCalled();
      expect(removeManySpy).not.toHaveBeenCalled();
      expect(deleted).toBe(false);
    });

    it('MUST report a confirmed deletion', async () => {
      const deleted = await service.onEntityDeleted('e1');

      expect(removeManySpy).toHaveBeenCalledWith(['e1']);
      expect(deleted).toBe(true);
    });
  });

  describe('onRelationDeleted', () => {
    it('MUST ask for confirmation before removing a relation', async () => {
      await service.onRelationDeleted('r1');

      expect(confirmDialog.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: DEFAULT_TRANSLATIONS.confirmDialog.deleteRelationTitle,
          message: DEFAULT_TRANSLATIONS.confirmDialog.deleteRelationMessage,
          danger: true
        })
      );
      expect(relationRemoveSpy).toHaveBeenCalledWith('r1');
    });

    it('MUST NOT remove the relation when the user cancels', async () => {
      confirmDialog.confirm.mockResolvedValue(false);

      await service.onRelationDeleted('r1');

      expect(relationRemoveSpy).not.toHaveBeenCalled();
    });
  });

  describe('onPropertyDeleted', () => {
    it('MUST ask for confirmation before removing a property', async () => {
      await service.onPropertyDeleted('p1');

      expect(confirmDialog.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: DEFAULT_TRANSLATIONS.confirmDialog.deletePropertyTitle,
          message: DEFAULT_TRANSLATIONS.confirmDialog.deletePropertyMessage,
          danger: true
        })
      );
      expect(propertyRemoveSpy).toHaveBeenCalledWith('p1');
    });

    it('MUST NOT remove the property when the user cancels', async () => {
      confirmDialog.confirm.mockResolvedValue(false);

      await service.onPropertyDeleted('p1');

      expect(propertyRemoveSpy).not.toHaveBeenCalled();
    });
  });

  describe('onChildPropertyDeleted', () => {
    it('MUST use the same confirmation flow as a top-level property', async () => {
      await service.onChildPropertyDeleted('child-1');

      expect(confirmDialog.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: DEFAULT_TRANSLATIONS.confirmDialog.deletePropertyTitle,
          message: DEFAULT_TRANSLATIONS.confirmDialog.deletePropertyMessage,
          danger: true
        })
      );
      expect(propertyRemoveSpy).toHaveBeenCalledWith('child-1');
    });

    it('MUST keep the child property when the user cancels', async () => {
      confirmDialog.confirm.mockResolvedValue(false);

      await service.onChildPropertyDeleted('child-1');

      expect(propertyRemoveSpy).not.toHaveBeenCalled();
    });
  });

  describe('onIndexDeleted', () => {
    it('MUST ask for confirmation before removing an index', async () => {
      await service.onIndexDeleted('i1');

      expect(confirmDialog.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: DEFAULT_TRANSLATIONS.confirmDialog.deleteIndexTitle,
          message: DEFAULT_TRANSLATIONS.confirmDialog.deleteIndexMessage,
          danger: true
        })
      );
      expect(indexRemoveSpy).toHaveBeenCalledWith('i1');
    });

    it('MUST NOT remove the index when the user cancels', async () => {
      confirmDialog.confirm.mockResolvedValue(false);

      await service.onIndexDeleted('i1');

      expect(indexRemoveSpy).not.toHaveBeenCalled();
    });
  });

  describe('onRelationCreated', () => {
    it('MUST create a linked relation pair', async () => {
      await service.onRelationCreated({ sourceEntityId: 'e1', targetEntityId: 'e2' });
      expect(createLinkedPairSpy).toHaveBeenCalledWith('e1', 'e2', 'MANY_TO_ONE');
    });
  });

  describe('onPropertyUpdated', () => {
    it('MUST confirm SQL impact when propertyType changes', async () => {
      await service.onPropertyUpdated({ id: 'p1', changes: { propertyType: 'number' } });

      expect(confirmDialog.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: DEFAULT_TRANSLATIONS.confirmDialog.sqlImpactTitle,
          message: DEFAULT_TRANSLATIONS.confirmDialog.sqlImpactMessage,
          confirmText: DEFAULT_TRANSLATIONS.confirmDialog.sqlImpactConfirmButton,
          danger: false
        })
      );
      expect(propertyUpdateSpy).toHaveBeenCalledWith('p1', { propertyType: 'number' });
    });

    it('MUST NOT update when SQL impact confirm is cancelled', async () => {
      confirmDialog.confirm.mockResolvedValue(false);

      await service.onPropertyUpdated({ id: 'p1', changes: { propertyType: 'boolean' } });

      expect(propertyUpdateSpy).not.toHaveBeenCalled();
    });

    it('MUST update non-type changes without SQL impact confirm', async () => {
      await service.onPropertyUpdated({ id: 'p1', changes: { name: 'title' } });

      expect(confirmDialog.confirm).not.toHaveBeenCalled();
      expect(propertyUpdateSpy).toHaveBeenCalledWith('p1', { name: 'title' });
    });
  });

  describe('SQL generation validation', () => {
    beforeEach(() => {
      entitiesSignal.set([{ id: 'e1', name: 'User', modelDesignId: 'design-1' }]);
      validateEntityIdentitySpy.mockReturnValue({
        valid: false,
        errors: ['validation.entityNameAlreadyExists']
      });
    });

    it('MUST block CREATE SQL generation for an invalid model', () => {
      service.onGenerateSql();

      expect(service.generatedFiles()).toEqual([]);
      expect(service.generatedErrors()).toContain(
        `User: ${DEFAULT_TRANSLATIONS.validation.entityNameAlreadyExists.replace('{name}', 'User')}`
      );
      expect(service.codePreviewOpen()).toBe(true);
    });
  });

  describe('client package archive', () => {
    it('MUST archive generated files through the host adapter and download the tgz', async () => {
      service.generatedFiles.set([
        { path: 'index.js', content: 'export class Post {}' },
        { path: 'index.d.ts', content: 'export declare class Post {}' }
      ]);
      service.clientPackageName.set('@acme/blog-rxdb');

      await service.onArchiveClientPackage();

      expect(archivePackageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ packageName: '@acme/blog-rxdb', generatedFiles: service.generatedFiles() })
      );
      expect(downloadBlobSpy).toHaveBeenCalledWith(expect.any(Blob), 'acme-blog-rxdb-1.0.0.tgz');
      expect(service.clientPackageVersion()).toBe('1.0.0');
    });

    it('MUST publish generated files and expose only the confirmed version', async () => {
      service.generatedFiles.set([
        { path: 'index.js', content: 'export class Post {}' },
        { path: 'index.d.ts', content: 'export declare class Post {}' }
      ]);
      service.clientPackageName.set('@acme/blog-rxdb');

      await service.onPublishClientPackage();

      expect(publishPackageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ packageName: '@acme/blog-rxdb', generatedFiles: service.generatedFiles() })
      );
      expect(service.clientPackageVersion()).toBe('1.1.0');
    });
  });

  describe('左侧导航实体操作', () => {
    it('onAddEntity(namespace) 在指定命名空间创建实体', async () => {
      await service.onAddEntity('shop');
      expect(entityCreateSpy).toHaveBeenCalledWith(undefined, 'shop');
    });

    it('onAddEntity() 不带命名空间创建实体', async () => {
      await service.onAddEntity();
      expect(entityCreateSpy).toHaveBeenCalledWith(undefined, undefined);
    });

    it('onEntityRenamed 走 entityService.update', async () => {
      await service.onEntityRenamed('e1', 'Post');
      expect(entityUpdateSpy).toHaveBeenCalledWith('e1', { name: 'Post' });
    });

    it('onEntityMovedToNamespace 把实体更新到目标命名空间', async () => {
      entitiesSignal.set([{ id: 'e1', name: 'Post', entityNamespace: 'public' }]);
      await service.onEntityMovedToNamespace('e1', 'shop');
      expect(entityUpdateSpy).toHaveBeenCalledWith('e1', { entityNamespace: 'shop' });
    });

    it('onEntityMovedToNamespace 目标与当前命名空间相同时跳过', async () => {
      entitiesSignal.set([{ id: 'e1', name: 'Post', entityNamespace: null }]);
      await service.onEntityMovedToNamespace('e1', 'public');
      expect(entityUpdateSpy).not.toHaveBeenCalled();
    });

    it('onEntityMovedToNamespace 实体不存在时跳过', async () => {
      await service.onEntityMovedToNamespace('missing', 'shop');
      expect(entityUpdateSpy).not.toHaveBeenCalled();
    });
  });
});
