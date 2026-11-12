import { type RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ChatMessage,
  ChatSession,
  DesignEntity,
  DesignIndex,
  DesignProperty,
  DesignRelation,
  ModelDesign
} from '../../models/index.js';
import { createTestDatabase } from './sqlite-database';

/**
 * 用真实（非 mock）RxDB 实例验证 DesignProperty/DesignRelation/DesignIndex
 * 对 DesignEntity 的 CASCADE 删除声明在运行时确实生效——`model-design.service.ts`
 * 的 `rollback()` 依赖此行为清理旧实体的子记录，不可只信任装饰器声明。
 */
describe('DesignEntity cascade delete (real RxDB)', () => {
  let rxdb: RxDB;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const testDatabase = await createTestDatabase([
      ModelDesign,
      DesignEntity,
      DesignProperty,
      DesignRelation,
      DesignIndex,
      ChatSession,
      ChatMessage
    ]);
    rxdb = testDatabase.database;
    dispose = testDatabase.dispose;
  });

  afterAll(async () => {
    await dispose();
  });

  it('removes DesignProperty/DesignRelation/DesignIndex when their DesignEntity is removed via entityManager.mutations', async () => {
    const design = new ModelDesign({ name: 'cascade-test', namespace: 'public' });
    await design.save();

    const entity = new DesignEntity({ name: 'User', modelDesignId: design.id });
    await entity.save();

    const property = new DesignProperty({ name: 'email', designEntityId: entity.id, propertyType: 'string' });
    await property.save();

    const relation = new DesignRelation({ name: 'posts', designEntityId: entity.id, relationKind: 'ONE_TO_MANY' });
    await relation.save();

    const index = new DesignIndex({ designEntityId: entity.id, propertyIds: [property.id] });
    await index.save();

    const byEntity = {
      combinator: 'and' as const,
      rules: [{ field: 'designEntityId', operator: '=' as const, value: entity.id }]
    };

    expect(await firstValueFrom(DesignProperty.find({ where: byEntity }))).toHaveLength(1);
    expect(await firstValueFrom(DesignRelation.find({ where: byEntity }))).toHaveLength(1);
    expect(await firstValueFrom(DesignIndex.find({ where: byEntity }))).toHaveLength(1);

    const removeMap = new Map<unknown, Set<unknown>>();
    removeMap.set(DesignEntity, new Set([entity]));

    await rxdb.entityManager.mutations({ create: new Map(), update: new Map(), remove: removeMap });

    const remainingProperties = await firstValueFrom(DesignProperty.find({ where: byEntity }));
    const remainingRelations = await firstValueFrom(DesignRelation.find({ where: byEntity }));
    const remainingIndexes = await firstValueFrom(DesignIndex.find({ where: byEntity }));
    const remainingEntities = await firstValueFrom(
      DesignEntity.find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: entity.id }] } })
    );

    expect(remainingProperties).toHaveLength(0);
    expect(remainingRelations).toHaveLength(0);
    expect(remainingIndexes).toHaveLength(0);
    expect(remainingEntities).toHaveLength(0);
  });
});
