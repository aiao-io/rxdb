/**
 * @fileoverview 只读实例的公开写入口一律拒绝（US-313）。
 *
 * @remarks
 * 只读实例是只读检出位的快照库：数据是建立时刻的另一条线，写进去既不会进那条线，也会让快照与它对不上。
 * 判定在权限判定之前、选主端之前：只读实例上任何写都不该开始，与实体声明的写权限无关。
 * 与 US-027 的权限一样只是快速失败，适配器与执行器层不判定（只读检出位另有只读钩子与引擎封印）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../entity/entity-base.js';
import { Entity } from '../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, type UUID } from '../entity/entity.interface.js';
import { PropertyType } from '../entity/metadata-options.interface.js';
import type { EntityPropertyMetadataOptions } from '../entity/property-types.interface.js';
import type { IRepository } from '../repository/repository.interface.js';
import { uuid } from '../rxdb-utils.js';
import { RxDB } from '../RxDB.js';
import { RxDBError, RxDBReadOnlyError } from '../RxDBError.js';
import { createTestDB, type MockLocalAdapter } from './fixtures/test-db-setup.js';

const PROPERTIES: EntityPropertyMetadataOptions[] = [
  { name: 'title', type: PropertyType.string },
  { name: 'sortOrder', type: PropertyType.string }
];

@Entity({ name: 'ReadOnlyNote', properties: PROPERTIES })
class ReadOnlyNote extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

@Entity({ name: 'ReadOnlyLocked', properties: PROPERTIES, permissions: { create: 'system' } })
class ReadOnlyLocked extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

@Entity({ name: 'ReadOnlyOrdered', manualOrder: true, properties: PROPERTIES })
class ReadOnlyOrdered extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
}

const ENTITIES: EntityType[] = [ReadOnlyNote, ReadOnlyLocked, ReadOnlyOrdered];

interface Context {
  rxdb: RxDB;
  adapter: MockLocalAdapter;
  repositories: IRepository<EntityType>[];
  cleanup: () => Promise<void>;
}

const setup = async (readOnly: boolean): Promise<Context> => {
  const { rxdb, adapter, cleanup } = await createTestDB({ entities: ENTITIES, readOnly });
  const repositories = ENTITIES.map(entity => adapter.stubEntityRepository(entity));
  return { rxdb, adapter, repositories, cleanup };
};

const fresh = (ctx: Context): ReadOnlyNote => {
  const note = new ReadOnlyNote();
  note.title = 'fresh';
  void ctx;
  return note;
};

const stored = <T extends EntityType>(ctx: Context, EntityType: T): InstanceType<T> =>
  ctx.rxdb.entityManager.createEntityRef(EntityType, { id: uuid(), title: 'stored', sortOrder: 'a0' } as never, {
    local: true,
    modified: false
  }) as InstanceType<T>;

const rejectionOf = (write: () => Promise<unknown>): Promise<unknown> =>
  write().then(
    () => {
      throw new Error('写入应被拒绝，却成功了');
    },
    (error: unknown) => error
  );

/** 一次写都没发出去：仓储桩与适配器批量入口都没被调用 */
const expectNothingWritten = (ctx: Context): void => {
  for (const repository of ctx.repositories) {
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
  }
  expect(ctx.adapter.mutations).not.toHaveBeenCalled();
  expect(ctx.adapter.transaction).not.toHaveBeenCalled();
};

describe('只读实例（US-313）', () => {
  it('默认不是只读；显式 readOnly: true 才是', async () => {
    const writable = await setup(false);
    const readOnly = await setup(true);

    expect(writable.rxdb.readOnly).toBe(false);
    expect(readOnly.rxdb.readOnly).toBe(true);

    await writable.cleanup();
    await readOnly.cleanup();
  });

  describe('公开写入口', () => {
    let ctx: Context;

    beforeEach(async () => {
      ctx = await setup(true);
    });

    afterEach(async () => {
      await ctx.cleanup();
    });

    it.each<[string, (c: Context) => Promise<unknown>]>([
      ['门面 Repository.create()', c => c.rxdb.entityManager.getRepository(ReadOnlyNote).create(fresh(c))],
      [
        '门面 Repository.update()',
        c => c.rxdb.entityManager.getRepository(ReadOnlyNote).update(stored(c, ReadOnlyNote), { title: 'x' })
      ],
      [
        '门面 Repository.remove()',
        c => c.rxdb.entityManager.getRepository(ReadOnlyNote).remove(stored(c, ReadOnlyNote))
      ],
      [
        '门面 Repository.reorder()',
        c => c.rxdb.entityManager.getRepository(ReadOnlyOrdered).reorder(stored(c, ReadOnlyOrdered).id, { group: {} })
      ],
      ['EntityManager.save()', c => c.rxdb.entityManager.save(fresh(c))],
      ['EntityManager.remove()', c => c.rxdb.entityManager.remove(stored(c, ReadOnlyNote))],
      // 批量路径只有 `mutations()` 一道只读守卫：单条路径另有 Repository 守卫，这两条不经它
      ['EntityManager.saveMany()', c => c.rxdb.entityManager.saveMany([fresh(c)])],
      ['EntityManager.removeMany()', c => c.rxdb.entityManager.removeMany([stored(c, ReadOnlyNote)])],
      ['实体实例 save()', c => fresh(c).save()],
      ['实体实例 remove()', c => stored(c, ReadOnlyNote).remove()]
    ])('%s 抛 RxDBReadOnlyError，写没有发出', async (_label, run) => {
      const error = await rejectionOf(() => run(ctx));

      expect(error).toBeInstanceOf(RxDBReadOnlyError);
      expect(error).toBeInstanceOf(RxDBError);
      expectNothingWritten(ctx);
    });

    it('判定在写权限之前：只许系统创建的实体报的也是只读', async () => {
      const locked = new ReadOnlyLocked();
      locked.title = 'locked';

      const error = await rejectionOf(() => ctx.rxdb.entityManager.getRepository(ReadOnlyLocked).create(locked));

      expect(error).toBeInstanceOf(RxDBReadOnlyError);
    });

    it('notifyExternalUpdate 同步抛出，一个事件都不派发', () => {
      const dispatch = vi.spyOn(ctx.rxdb, 'dispatchEvent');

      expect(() => ctx.rxdb.entityManager.notifyExternalUpdate(ReadOnlyNote, uuid(), { title: 'x' })).toThrow(
        RxDBReadOnlyError
      );
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
