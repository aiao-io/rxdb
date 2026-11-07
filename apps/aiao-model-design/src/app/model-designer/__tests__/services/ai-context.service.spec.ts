import { describe, expect, it } from 'vitest';
import { AiContextService } from '../../services/ai-context.service';
import type { AiEntityContext } from '../../types/ai-schemas';

/** 创建 mock 实体上下文 */
function mockEntity(name: string, propCount = 2): AiEntityContext {
  return {
    id: `id-${name}`,
    name,
    displayName: `${name}显示`,
    properties: Array.from({ length: propCount }, (_, i) => ({
      id: `id-${name}-prop${i}`,
      name: `prop${i}`,
      propertyType: 'string',
      isRequired: false,
      isNullable: false,
      isUnique: false
    })),
    relations: [],
    indexes: []
  };
}

describe('AiContextService', () => {
  function createService(entities: AiEntityContext[] = [], selectedEntityId?: string) {
    return new AiContextService(entities, selectedEntityId);
  }

  describe('buildGenerateContext', () => {
    it('should return full entities when ≤20', () => {
      const entities = Array.from({ length: 5 }, (_, i) => mockEntity(`Entity${i}`));
      const service = createService(entities);
      const ctx = service.buildGenerateContext();
      expect(ctx.entityNames).toHaveLength(5);
      expect(ctx.entities).toHaveLength(5);
    });

    it('should return selected + related when >20 with selection', () => {
      const entities = Array.from({ length: 25 }, (_, i) => mockEntity(`Entity${i}`));
      // 添加关系：Entity0 关联 Entity1（通过 mappedEntityId）
      entities[0].relations = [{ id: 'rel-0', name: 'rel', relationKind: 'ONE_TO_MANY', mappedEntityId: 'id-Entity1' }];
      const service = createService(entities, 'Entity0');
      const ctx = service.buildGenerateContext('Entity0');
      expect(ctx.entityNames).toHaveLength(25);
      expect(ctx.entities?.length).toBeLessThanOrEqual(50);
      // 选中实体 + 关联实体应在 entities 中
      const entityNames = ctx.entities?.map(e => e.name);
      expect(entityNames).toContain('Entity0');
      expect(entityNames).toContain('Entity1');
    });

    it('should return entityNames + recent 5 when >20 without selection', () => {
      const entities = Array.from({ length: 25 }, (_, i) => mockEntity(`Entity${i}`));
      const service = createService(entities);
      const ctx = service.buildGenerateContext();
      expect(ctx.entityNames).toHaveLength(25);
      expect(ctx.entities).toHaveLength(5);
    });

    it('should handle empty model', () => {
      const service = createService([]);
      const ctx = service.buildGenerateContext();
      expect(ctx.entityNames).toHaveLength(0);
      expect(ctx.entities).toBeUndefined();
    });
  });

  describe('buildChatContext', () => {
    it('should place selected entity on top', () => {
      const entities = [mockEntity('User'), mockEntity('Order')];
      entities[0].relations = [
        { id: 'rel-orders', name: 'orders', relationKind: 'ONE_TO_MANY', mappedEntityId: 'id-Order' }
      ];
      const service = createService(entities, 'User');
      const ctx = service.buildChatContext('User');
      expect(ctx.entityNames).toHaveLength(2);
      expect(ctx.selectedEntity?.name).toBe('User');
      expect(ctx.relatedEntities).toHaveLength(1);
      expect(ctx.relatedEntities?.[0]?.name).toBe('Order');
    });

    it('should return entityNames shape without selection', () => {
      const entities = [mockEntity('User')];
      const service = createService(entities);
      const ctx = service.buildChatContext();
      expect(ctx.entityNames).toHaveLength(1);
      expect(ctx.selectedEntity).toBeUndefined();
    });

    it('should handle empty model', () => {
      const service = createService([]);
      const ctx = service.buildChatContext();
      expect(ctx.entityNames).toHaveLength(0);
    });
  });

  describe('buildValidateContext', () => {
    it('should return complete model with name and namespace', () => {
      const entities = [mockEntity('User')];
      const service = createService(entities);
      const ctx = service.buildValidateContext('TestModel', 'public');
      expect(ctx.name).toBe('TestModel');
      expect(ctx.namespace).toBe('public');
      expect(ctx.entities).toHaveLength(1);
    });

    it('should return all entities without trimming', () => {
      const entities = Array.from({ length: 30 }, (_, i) => mockEntity(`Entity${i}`));
      const service = createService(entities);
      const ctx = service.buildValidateContext('Model', 'ns');
      expect(ctx.entities).toHaveLength(30);
    });

    it('should handle empty model', () => {
      const service = createService([]);
      const ctx = service.buildValidateContext('Empty', 'public');
      expect(ctx.entities).toHaveLength(0);
    });
  });
});
