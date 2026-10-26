import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import { transactionalRepository } from '../../repository/transactional-repository.js';
import { RxDBBranch } from '../../system/branch.js';
import { WorktreeTableSet, WorktreeTableSetMismatchError } from '../../system/worktree-table-set.js';
import { createMockAdapter, createTestDB } from '../fixtures/test-db-setup.js';

@Entity({ name: 'TransactionalNote', properties: [{ name: 'title', type: PropertyType.string }] })
class TransactionalNote extends EntityBase {
  declare title: string;
}

const shadow = WorktreeTableSet.of('wt_txrepo', [TransactionalNote]);

describe('公开仓库的事务边界', () => {
  let context: Awaited<ReturnType<typeof createTestDB>>;

  beforeEach(async () => {
    context = await createTestDB({ entities: [TransactionalNote] });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await context.cleanup();
  });

  it.each(['create', 'update', 'remove'] as const)('%s 在排队之后检查来源，旧实体不进入执行器仓库', async operation => {
    const { rxdb, adapter } = context;
    const entity = new TransactionalNote({ title: 'main' });
    const scoped = adapter.stubEntityRepository(TransactionalNote);
    const repository = transactionalRepository(adapter, TransactionalNote, { ...scoped });
    const release = Promise.withResolvers<void>();
    const execute = adapter.transaction.getMockImplementation()!;
    adapter.transaction.mockImplementation(async (...args) => {
      await release.promise;
      return execute(...args);
    });

    const writing =
      operation === 'update' ? repository.update(entity, { title: 'edit' }) : repository[operation](entity);
    vi.spyOn(rxdb, 'worktreeTableSet', 'get').mockReturnValue(shadow);
    release.resolve();

    await expect(writing).rejects.toBeInstanceOf(WorktreeTableSetMismatchError);
    expect(scoped[operation]).not.toHaveBeenCalled();
  });

  it('读取、树查询与行号查询在事务里生成结果，并等待回填完成', async () => {
    const { adapter } = context;
    const entity = new TransactionalNote({ title: 'shadow' });
    const entered = Promise.withResolvers<void>();
    const hydrated = Promise.withResolvers<void>();
    const scoped = Object.assign(adapter.stubEntityRepository(TransactionalNote), {
      findByRowIds: vi.fn(async () => [entity]),
      findAncestors: vi.fn(async () => [entity]),
      metadata: { name: 'TransactionalNote' },
      getEntityRef: () => entity
    });
    vi.mocked(scoped.find).mockImplementation(async () => {
      entered.resolve();
      await hydrated.promise;
      return [entity];
    });
    const repository = transactionalRepository(adapter, TransactionalNote, { ...scoped });
    let settled = false;
    const reading = repository.find({ where: { combinator: 'and', rules: [] } }).then(rows => {
      settled = true;
      return rows;
    });
    await entered.promise;
    expect(settled).toBe(false);
    hydrated.resolve();

    expect(await reading).toEqual([entity]);
    expect(await repository.findByRowIds()).toEqual([entity]);
    expect(await repository.findAncestors()).toEqual([entity]);
    const transactions = adapter.transaction.mock.calls.length;
    expect(repository.getEntityRef()).toBe(entity);
    expect(repository.metadata).toBe(scoped.metadata);
    expect(adapter.transaction.mock.calls).toHaveLength(transactions);
  });

  it('另一个适配器关闭失败时，仍等本地连接结束再复位挂载', async () => {
    const { rxdb, adapter } = context;
    await rxdb.connect('sqlite');
    adapter.stubEntityRepository(RxDBBranch, [rxdb.entityManager.instantiate(RxDBBranch, { id: 'held' })]);
    await rxdb.mountWorktreeTableSet(shadow);
    const failing = createMockAdapter(rxdb);
    failing.disconnect.mockRejectedValue(new Error('remote close failed'));
    rxdb.adapter('other', () => failing);
    await rxdb.getAdapter('other');
    let duringClose: WorktreeTableSet | undefined;
    adapter.disconnect.mockImplementation(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      duringClose = rxdb.worktreeTableSet;
    });

    await expect(rxdb.disconnectAll()).rejects.toThrow('remote close failed');
    expect(duringClose).toBe(shadow);
    expect(rxdb.worktreeTableSet).toBe(WorktreeTableSet.MAIN);
  });
});
