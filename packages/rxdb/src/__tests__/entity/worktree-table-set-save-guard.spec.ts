/**
 * @fileoverview 换挂之后旧的实体对象保存被拒（US-314 B2.4）。
 *
 * @remarks
 * 换挂（`mountWorktreeTableSet`）清掉了实体身份缓存，可调用方手里还可能攥着换挂之前的实体对象（表单、草稿缓存）。
 * 照存的话它会写进另一套表：主检出位上新建的实体存进检出位的影子表，主表上读出的行拿主表上的值改影子表里同 id 的那一行。
 * 判定只比「这个实体的写落在哪套表」：没有副本的实体无论挂哪套都写主表集，不拦；同一个检出位重新挂上（后缀相同）也不拦。
 *
 * 这里不真的换挂：换挂要适配器建表集、持有分支，那些在两个适配器的套件里测。这里把实例的 `worktreeTableSet` 换掉，
 * 只钉公开写入口在发出写之前就拒。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, type UUID } from '../../entity/entity.interface.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import { uuid } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { WorktreeTableSet, WorktreeTableSetMismatchError } from '../../system/worktree-table-set.js';
import { createTestDB, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

@Entity({ name: 'GuardedNote', properties: [{ name: 'title', type: PropertyType.string }] })
class GuardedNote extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

/** 不进影子表集的实体（形同 QueryCache 同步的实体）：无论挂哪套都写主表集 */
@Entity({ name: 'SharedLookup', properties: [{ name: 'title', type: PropertyType.string }] })
class SharedLookup extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

const ENTITIES: EntityType[] = [GuardedNote, SharedLookup];
/** 一个可写检出位的表集：只有 GuardedNote 在里面有副本 */
const CHECKOUT = WorktreeTableSet.of('wt_guard', [GuardedNote]);

interface Context {
  rxdb: RxDB;
  adapter: MockLocalAdapter;
  repositories: IRepository<EntityType>[];
  cleanup: () => Promise<void>;
}

/** 让实例看起来挂在 `tableSet` 上（只换 `worktreeTableSet` 这一个读数） */
const mount = (ctx: Context, tableSet: WorktreeTableSet): void => {
  vi.spyOn(ctx.rxdb, 'worktreeTableSet', 'get').mockReturnValue(tableSet);
};

const fresh = (title = 'fresh'): GuardedNote => {
  const note = new GuardedNote();
  note.title = title;
  return note;
};

const stored = <T extends EntityType>(ctx: Context, EntityType: T): InstanceType<T> =>
  ctx.rxdb.entityManager.createEntityRef(EntityType, { id: uuid(), title: 'stored' } as never, {
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

describe('换挂之后旧的实体对象保存被拒（US-314 B2.4）', () => {
  let ctx: Context;

  beforeEach(async () => {
    const { rxdb, adapter, cleanup } = await createTestDB({ entities: ENTITIES });
    const repositories = ENTITIES.map(entity => adapter.stubEntityRepository(entity));
    ctx = { rxdb, adapter, repositories, cleanup };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.cleanup();
  });

  it.each<[string, (c: Context, note: GuardedNote) => Promise<unknown>]>([
    ['实体实例 save()（新建）', (_c, note) => note.save()],
    ['EntityManager.save()', (c, note) => c.rxdb.entityManager.save(note)],
    ['EntityManager.saveMany()', (c, note) => c.rxdb.entityManager.saveMany([note])],
    ['门面 Repository.create()', (c, note) => c.rxdb.entityManager.getRepository(GuardedNote).create(note)]
  ])('主检出位上新建的实体，挂到检出位之后 %s 被拒，一条写都没发出', async (_label, run) => {
    const note = fresh();
    mount(ctx, CHECKOUT);

    const error = await rejectionOf(() => run(ctx, note));

    expect(error).toBeInstanceOf(WorktreeTableSetMismatchError);
    expect(error).toMatchObject({
      code: 'worktree_table_set_mismatch',
      entityTableSet: null,
      mountedTableSet: 'wt_guard'
    });
    for (const repository of ctx.repositories) expect(repository.create).not.toHaveBeenCalled();
    expect(ctx.adapter.mutations).not.toHaveBeenCalled();
  });

  it.each<[string, (c: Context, note: GuardedNote) => Promise<unknown>]>([
    [
      '门面 Repository.update()',
      (c, note) => c.rxdb.entityManager.getRepository(GuardedNote).update(note, { title: 'x' })
    ],
    ['门面 Repository.remove()', (c, note) => c.rxdb.entityManager.getRepository(GuardedNote).remove(note)],
    ['EntityManager.remove()', (c, note) => c.rxdb.entityManager.remove(note)],
    ['EntityManager.removeMany()', (c, note) => c.rxdb.entityManager.removeMany([note])]
  ])('主表上读出的实体，挂到检出位之后 %s 被拒', async (_label, run) => {
    const note = stored(ctx, GuardedNote);
    mount(ctx, CHECKOUT);

    const error = await rejectionOf(() => run(ctx, note));

    expect(error).toBeInstanceOf(WorktreeTableSetMismatchError);
    for (const repository of ctx.repositories) {
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    }
  });

  it('检出位上建出的实体，挂回主检出位之后保存同样被拒', async () => {
    mount(ctx, CHECKOUT);
    const note = fresh('检出位里建的');
    mount(ctx, WorktreeTableSet.MAIN);

    const error = await rejectionOf(() => note.save());

    expect(error).toMatchObject({ entityTableSet: 'wt_guard', mountedTableSet: null });
  });

  it('批量写里只要有一条不符，整批拒绝', async () => {
    const before = fresh('换挂之前建的');
    mount(ctx, CHECKOUT);
    const after = fresh('换挂之后建的');

    const error = await rejectionOf(() => ctx.rxdb.entityManager.saveMany([after, before]));

    expect(error).toBeInstanceOf(WorktreeTableSetMismatchError);
    expect(ctx.adapter.mutations).not.toHaveBeenCalled();
  });

  it('挂回建出它的那套表就照常保存', async () => {
    const note = fresh();
    mount(ctx, CHECKOUT);
    await expect(note.save()).rejects.toBeInstanceOf(WorktreeTableSetMismatchError);

    mount(ctx, WorktreeTableSet.MAIN);
    await expect(note.save()).resolves.toBe(note);
  });

  it('同一个检出位重新挂上（新的表集对象、同一个后缀）照常保存', async () => {
    mount(ctx, CHECKOUT);
    const note = fresh();
    mount(ctx, WorktreeTableSet.of('wt_guard', [GuardedNote]));

    await expect(note.save()).resolves.toBe(note);
  });

  it('没有副本的实体无论挂哪套都写主表集，不拦', async () => {
    const lookup = new SharedLookup();
    lookup.title = '主检出位上建的';
    mount(ctx, CHECKOUT);

    await expect(lookup.save()).resolves.toBe(lookup);
  });
});
