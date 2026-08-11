/**
 * 测试：验证多个同类型关系的缓存清理不会相互影响
 * 使用 User 和 IdCard 实体测试
 */
import { getEntityStatus, RxDB, SyncType, type EntityRelationMetadata } from '@aiao/rxdb';
import { ENTITIES, IdCard, User } from '@aiao/rxdb-test/shop';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

describe('多个同类型关系的缓存清理测试', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'test-user' },
      entities: [...ENTITIES],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });

    await rxdb.connect('pglite');
  });

  it('设置 idCardId = null 不应该影响其他关系数据', async () => {
    const user = new User();
    user.name = '测试用户';
    await user.save();

    const idCard = new IdCard();
    idCard.code = 'ID-MULTI-REL-001';
    idCard.ownerId = user.id;
    await idCard.save();

    user.idCardId = idCard.id;
    await user.save();

    let lastResult: User[] = [];
    const subscription = User.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'idCard.code', operator: '=', value: 'ID-MULTI-REL-001' }]
      }
    }).subscribe(result => {
      lastResult = result;
    });

    await new Promise(resolve => setTimeout(resolve, 200));
    expect(lastResult.length).toBe(1);
    expect(lastResult[0].id).toBe(user.id);

    user.idCardId = null;
    await user.save();

    await new Promise(resolve => setTimeout(resolve, 300));

    expect(lastResult.length).toBe(0);

    subscription.unsubscribe();
  });

  it('EntityStatus 的 getRelationCache 使用相同 relation 对象应返回相同缓存', async () => {
    const user = new User();
    user.name = '缓存一致性测试';
    await user.save();

    const userStatus = getEntityStatus(user)!;
    const relation = { name: 'testRelation' } as unknown as EntityRelationMetadata;

    const cache1 = userStatus.getRelationCache(relation);
    const cache2 = userStatus.getRelationCache(relation);

    expect(cache1).toBe(cache2);

    const card = new IdCard();
    card.code = 'TEST';
    cache1.add(card);

    expect(cache2.has(card)).toBe(true);
  });

  it('EntityStatus 的 getRelationCache 使用不同 relation 对象应返回不同缓存', async () => {
    const user = new User();
    user.name = '缓存独立性测试';
    await user.save();

    const userStatus = getEntityStatus(user)!;
    const relationA = { name: 'relationA' } as unknown as EntityRelationMetadata;
    const relationB = { name: 'relationB' } as unknown as EntityRelationMetadata;

    const cacheA = userStatus.getRelationCache(relationA);
    const cacheB = userStatus.getRelationCache(relationB);

    expect(cacheA).not.toBe(cacheB);

    const card = new IdCard();
    card.code = 'TEST';
    cacheA.add(card);

    expect(cacheA.has(card)).toBe(true);
    expect(cacheB.has(card)).toBe(false);
  });
});
