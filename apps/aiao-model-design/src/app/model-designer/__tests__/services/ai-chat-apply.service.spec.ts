import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { AiChatApplyService } from '../../services/ai-chat-apply.service';
import { DesignEntityService } from '../../services/design-entity.service';
import { DesignIndexService } from '../../services/design-index.service';
import { DesignPropertyService } from '../../services/design-property.service';
import { DesignRelationService } from '../../services/design-relation.service';
import type { ChatChangeProposal } from '../../types/ai-schemas';

function createMockEntityService() {
  return {
    entities: signal([
      { id: 'e1', name: 'User', displayName: '用户' },
      { id: 'e2', name: 'Order', displayName: '订单' }
    ]),
    create: vi.fn().mockResolvedValue({ id: 'new-entity' }),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined)
  };
}

function createMockPropertyService() {
  return {
    propertiesOf: vi
      .fn()
      .mockReturnValue(signal([{ id: 'p1', name: 'userName', propertyType: 'string', designEntityId: 'e1' }])),
    create: vi.fn().mockResolvedValue({ id: 'new-prop' }),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined)
  };
}

function createMockRelationService() {
  return {
    relationsOf: vi
      .fn()
      .mockReturnValue(
        signal([{ id: 'r1', name: 'orders', designEntityId: 'e1', mappedEntityId: 'e2', relationKind: 'ONE_TO_MANY' }])
      ),
    create: vi.fn().mockResolvedValue({ id: 'new-rel' }),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined)
  };
}

function createMockIndexService() {
  return {
    indexesOf: vi.fn().mockReturnValue(signal([{ id: 'i1', propertyIds: ['p1'], isUnique: false }])),
    create: vi.fn().mockResolvedValue({ id: 'new-idx' }),
    remove: vi.fn().mockResolvedValue(undefined)
  };
}

function createService() {
  const entityService = createMockEntityService();
  const propertyService = createMockPropertyService();
  const relationService = createMockRelationService();
  const indexService = createMockIndexService();

  TestBed.configureTestingModule({
    providers: [
      AiChatApplyService,
      { provide: DesignEntityService, useValue: entityService },
      { provide: DesignPropertyService, useValue: propertyService },
      { provide: DesignRelationService, useValue: relationService },
      { provide: DesignIndexService, useValue: indexService }
    ]
  });

  return {
    service: TestBed.inject(AiChatApplyService),
    entityService,
    propertyService,
    relationService,
    indexService
  };
}

describe('AiChatApplyService', () => {
  describe('applyProposal', () => {
    it('should apply addEntity change', async () => {
      const { service, entityService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Add Audit entity',
        changes: [{ action: 'addEntity', entityId: 'new-e', entityName: 'Audit', details: { displayName: '审计日志' } }]
      };

      await service.applyProposal(proposal);

      expect(entityService.create).toHaveBeenCalledWith('Audit');
    });

    it('should apply the display name from an addEntity change', async () => {
      const { service, entityService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Add audit entity',
        changes: [
          {
            action: 'addEntity',
            entityId: 'ai-audit',
            entityName: 'Audit',
            details: { displayName: '审计日志' }
          }
        ]
      };

      await service.applyProposal(proposal);

      expect(entityService.update).toHaveBeenCalledWith('new-entity', { displayName: '审计日志' });
    });

    it('should preserve proposal ids through later changes', async () => {
      const { service, entityService, propertyService, indexService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Add indexed property',
        changes: [
          {
            action: 'addProperty',
            entityId: 'e1',
            entityName: 'User',
            details: { id: 'ai-property', name: 'email', propertyType: 'string' }
          },
          {
            action: 'addIndex',
            entityId: 'e1',
            entityName: 'User',
            details: { id: 'ai-index', propertyIds: ['ai-property'], isUnique: true }
          }
        ]
      };

      await service.applyProposal(proposal);

      expect(propertyService.create).toHaveBeenCalledWith('e1', 'email', 'string');
      expect(indexService.create).toHaveBeenCalledWith('e1', ['new-prop'], true);
      expect(entityService.update).not.toHaveBeenCalled();
    });

    it('should apply later changes to an entity created in the same proposal', async () => {
      const { service, propertyService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Add entity with property',
        changes: [
          { action: 'addEntity', entityId: 'ai-audit', entityName: 'Audit', details: {} },
          {
            action: 'addProperty',
            entityId: 'ai-audit',
            entityName: 'Audit',
            details: { id: 'ai-created-at', name: 'createdAt', propertyType: 'date' }
          }
        ]
      };

      await service.applyProposal(proposal);

      expect(propertyService.create).toHaveBeenCalledWith('new-entity', 'createdAt', 'date');
    });

    it('should resolve generated ids for both sides of a relation pair', async () => {
      const { service, relationService } = createService();
      relationService.create
        .mockResolvedValueOnce({ id: 'source-relation' })
        .mockResolvedValueOnce({ id: 'inverse-relation' });
      const proposal: ChatChangeProposal = {
        description: 'Add relation pair',
        changes: [
          {
            action: 'addRelation',
            entityId: 'e1',
            entityName: 'User',
            details: {
              id: 'ai-source-relation',
              relationKind: 'ONE_TO_MANY',
              mappedEntityId: 'e2',
              mappedPropertyId: 'ai-inverse-relation'
            }
          },
          {
            action: 'addRelation',
            entityId: 'e2',
            entityName: 'Order',
            details: {
              id: 'ai-inverse-relation',
              relationKind: 'MANY_TO_ONE',
              mappedEntityId: 'e1',
              mappedPropertyId: 'ai-source-relation'
            }
          }
        ]
      };

      await service.applyProposal(proposal);

      expect(relationService.update).toHaveBeenCalledWith('source-relation', {
        mappedPropertyId: 'inverse-relation'
      });
      expect(relationService.update).toHaveBeenCalledWith('inverse-relation', {
        mappedPropertyId: 'source-relation'
      });
    });

    it('should apply modifyEntity change', async () => {
      const { service, entityService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Rename User',
        changes: [{ action: 'modifyEntity', entityId: 'e1', entityName: 'User', details: { displayName: '用户信息' } }]
      };

      await service.applyProposal(proposal);

      expect(entityService.update).toHaveBeenCalledWith('e1', expect.objectContaining({ displayName: '用户信息' }));
    });

    it('should apply removeEntity change', async () => {
      const { service, entityService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Remove User',
        changes: [{ action: 'removeEntity', entityId: 'e1', entityName: 'User', details: {} }]
      };

      await service.applyProposal(proposal);

      expect(entityService.remove).toHaveBeenCalledWith('e1');
    });

    it('should apply addProperty change', async () => {
      const { service, propertyService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Add email',
        changes: [
          {
            action: 'addProperty',
            entityId: 'e1',
            entityName: 'User',
            details: { name: 'email', propertyType: 'string' }
          }
        ]
      };

      await service.applyProposal(proposal);

      expect(propertyService.create).toHaveBeenCalledWith('e1', 'email', 'string');
    });

    it('should apply modifyProperty change', async () => {
      const { service, propertyService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Make required',
        changes: [
          { action: 'modifyProperty', entityId: 'e1', entityName: 'User', details: { id: 'p1', isRequired: true } }
        ]
      };

      await service.applyProposal(proposal);

      expect(propertyService.update).toHaveBeenCalledWith('p1', expect.objectContaining({ isRequired: true }));
    });

    it('should apply removeProperty change', async () => {
      const { service, propertyService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Remove userName',
        changes: [{ action: 'removeProperty', entityId: 'e1', entityName: 'User', details: { id: 'p1' } }]
      };

      await service.applyProposal(proposal);

      expect(propertyService.remove).toHaveBeenCalledWith('p1');
    });

    it('should apply addRelation change', async () => {
      const { service, relationService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Add relation',
        changes: [
          {
            action: 'addRelation',
            entityId: 'e1',
            entityName: 'User',
            details: { relationKind: 'ONE_TO_MANY', mappedEntityId: 'e2' }
          }
        ]
      };

      await service.applyProposal(proposal);

      expect(relationService.create).toHaveBeenCalledWith('e1', 'e2', 'ONE_TO_MANY');
    });

    it('should apply modifyRelation change', async () => {
      const { service, relationService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Modify relation',
        changes: [
          {
            action: 'modifyRelation',
            entityId: 'e1',
            entityName: 'User',
            details: { id: 'r1', relationKind: 'MANY_TO_MANY' }
          }
        ]
      };

      await service.applyProposal(proposal);

      expect(relationService.update).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ relationKind: 'MANY_TO_MANY' })
      );
    });

    it('should apply removeRelation change', async () => {
      const { service, relationService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Remove relation',
        changes: [{ action: 'removeRelation', entityId: 'e1', entityName: 'User', details: { id: 'r1' } }]
      };

      await service.applyProposal(proposal);

      expect(relationService.remove).toHaveBeenCalledWith('r1');
    });

    it('should apply addIndex change', async () => {
      const { service, indexService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Add index',
        changes: [
          { action: 'addIndex', entityId: 'e1', entityName: 'User', details: { propertyIds: ['p1'], isUnique: true } }
        ]
      };

      await service.applyProposal(proposal);

      expect(indexService.create).toHaveBeenCalledWith('e1', ['p1'], true);
    });

    it('should apply removeIndex change', async () => {
      const { service, indexService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Remove index',
        changes: [{ action: 'removeIndex', entityId: 'e1', entityName: 'User', details: { id: 'i1' } }]
      };

      await service.applyProposal(proposal);

      expect(indexService.remove).toHaveBeenCalledWith('i1');
    });

    it('should apply multiple changes sequentially', async () => {
      const { service, entityService, propertyService } = createService();
      const proposal: ChatChangeProposal = {
        description: 'Multiple changes',
        changes: [
          { action: 'addEntity', entityId: 'new-e', entityName: 'Audit', details: {} },
          {
            action: 'addProperty',
            entityId: 'e1',
            entityName: 'User',
            details: { name: 'email', propertyType: 'string' }
          }
        ]
      };

      await service.applyProposal(proposal);

      expect(entityService.create).toHaveBeenCalled();
      expect(propertyService.create).toHaveBeenCalled();
    });

    it('should skip change when entity not found', async () => {
      const { service, entityService } = createService();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
      const proposal: ChatChangeProposal = {
        description: 'Missing entity',
        changes: [
          {
            action: 'modifyEntity',
            entityId: 'non-existent',
            entityName: 'NonExistent',
            details: { displayName: 'test' }
          }
        ]
      };

      await service.applyProposal(proposal);

      expect(entityService.update).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should skip addProperty when details lack name or propertyType', async () => {
      const { service, propertyService } = createService();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
      const proposal: ChatChangeProposal = {
        description: 'Invalid details',
        changes: [{ action: 'addProperty', entityId: 'e1', entityName: 'User', details: { name: 'phone' } }]
      };

      await service.applyProposal(proposal);

      expect(propertyService.create).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
