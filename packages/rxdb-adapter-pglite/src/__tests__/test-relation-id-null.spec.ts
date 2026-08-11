/**
 * 测试：当设置 entity.xxxId = null 时自动清理关系缓存
 * 真实 PGlite 场景测试
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, IdCard, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';

describe('关系外键设置为 null 时自动清理缓存 (PGlite)', () => {
  let adapter: RxDBAdapterPGlite;
  let rxdb: RxDB;
  const dbName = `relation-id-null-${Date.now()}`;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName,
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

  afterAll(async () => {
    if (rxdb) {
      await new Promise(resolve => setTimeout(resolve, 500));
      await rxdb.disconnectAll();
    }
  });

  it('设置 xxxId = null 后，通过关系字段的查询应该正确更新', async () => {
    // 1. 创建用户和身份证
    const user = new User();
    user.name = '测试用户';
    await user.save();

    const idCard = new IdCard();
    idCard.code = 'ID-NULL-TEST-001';
    idCard.ownerId = user.id;
    await idCard.save();

    user.idCardId = idCard.id;
    await user.save();

    // 2. 查询有该身份证的用户
    let lastResult: User[] = [];
    const subscription = User.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'idCard.code', operator: '=', value: 'ID-NULL-TEST-001' }]
      }
    }).subscribe(result => {
      lastResult = result;
    });

    // 等待初始查询
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(lastResult.length).toBe(1);
    expect(lastResult[0].id).toBe(user.id);

    // 3. 设置 idCardId = null（这应该触发缓存清理）
    user.idCardId = null;
    await user.save();

    // 4. 等待查询更新
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. 验证查询结果已更新（用户不再有该身份证）
    expect(lastResult.length).toBe(0);

    subscription.unsubscribe();
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('直接设置 xxxId = null 而不通过 xxx$.remove()', async () => {
    // 1. 创建用户和身份证
    const user = new User();
    user.name = '测试用户2';
    await user.save();

    const idCard = new IdCard();
    idCard.code = 'ID-NULL-TEST-002';
    idCard.ownerId = user.id;
    await idCard.save();

    user.idCardId = idCard.id;
    await user.save();

    // 2. 直接设置 idCardId = null
    user.idCardId = null;
    await user.save();

    // 3. 验证数据库中的值
    return new Promise<void>((resolve, reject) => {
      const subscription = User.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: user.id }]
        }
      }).subscribe({
        next: users => {
          try {
            expect(users.length).toBe(1);
            expect(users[0].idCardId).toBeNull();
            subscription.unsubscribe();
            resolve();
          } catch (error) {
            subscription.unsubscribe();
            reject(error);
          }
        },
        error: reject
      });
    });
  });
});
