/**
 * @fileoverview `worktreeConformanceSuite` —— 只读检出位一致性套件（US-313）。
 *
 * @remarks
 * 判据只有一条：只读检出位里读到的，与「真的切过去读到的」逐行一致，而主实例一处都没动。
 * 比对去掉 `ENTITY_BOOKKEEPING_FIELDS`：切换写回的行 `updatedAt` 取写入时刻，快照复制的行保留原值。
 *
 * **调用点的义务**（{@link WorkingTreeConformanceSuiteContext.createDatabase}）：注册
 * {@link WORKTREE_CONFORMANCE_ENTITIES}，装上历史插件与带 `worktrees.adapter` 的工作树插件，
 * `enable()` 之后交回。密钥环由套件自己解锁（{@link WORKTREE_CONFORMANCE_KEY}）。
 * `worktrees.adapter` 要造**持久**存储的快照库：持久归属的检出位放开之后要能原样再打开（AC10），
 * `close()` / `prune()` 删的也得是真的存储。
 *
 * 与另外两套共用一个上下文形状：六个后端各写三个调用点，形状分叉的话写调用点的人就得逐套件回忆参数。
 *
 * @module @aiao/rxdb-plugin-working-tree/testing
 */

import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EntityRelationManyToManyMetadata,
  EntityType,
  LocalRxDBAdapter,
  RxDB,
  SwitchVersionActions
} from '@aiao/rxdb';
import { ENTITY_BOOKKEEPING_FIELDS, getEntityMetadata, RxDBChange, RxDBReadOnlyError, uuid } from '@aiao/rxdb';
import { WorktreeUnavailableError } from '../../checkout/worktree-errors.js';
import type { WorktreeView } from '../../checkout/worktree-manager.js';
import type { WorktreeTarget } from '../../checkout/worktree-target.js';
import type { WorkingTreeConformanceSuiteContext } from './suite-context.js';
import {
  WORKTREE_CONFORMANCE_ENTITIES,
  WORKTREE_CONFORMANCE_KEY,
  WorktreeConformanceLabel,
  WorktreeConformanceSecret,
  WorktreeConformanceTask
} from './worktree-conformance-entities.js';

/** 套件里另开的那条分支。 */
const FEATURE = 'worktree-feature';

/** 两个后端的加密门面都长这样；套件只用解锁与上锁。 */
interface EncryptionCapable {
  readonly encryption: {
    unlock(options: { readonly keyBytes: Uint8Array; readonly idleTimeoutMs: number }): Promise<void>;
    lock(): void;
  };
}

const localAdapterOf = (rxdb: RxDB): Promise<LocalRxDBAdapter> => firstValueFrom(rxdb.localAdapter$);

const encryptionOf = async (rxdb: RxDB): Promise<EncryptionCapable['encryption']> =>
  ((await localAdapterOf(rxdb)) as unknown as EncryptionCapable).encryption;

/** 比对口径：日期按毫秒，其余原样。 */
const plain = (value: unknown): unknown => (value instanceof Date ? value.toISOString() : value);

/**
 * 一张表的全部行：去掉簿记列，按 id 排序。
 *
 * @param rxdb - 读哪个实例
 * @param EntityClass - 该实例上的实体类
 */
const rowsOf = async (rxdb: RxDB, EntityClass: EntityType): Promise<Record<string, unknown>[]> => {
  const repository = rxdb.entityManager.getRepository(EntityClass);
  const entities = await firstValueFrom(repository.findAll({ where: { combinator: 'and', rules: [] } }));
  const fields = [...getEntityMetadata(EntityClass).propertyMap.keys()].filter(
    field => !ENTITY_BOOKKEEPING_FIELDS.includes(field)
  );
  return entities
    .map(entity => Object.fromEntries(fields.map(field => [field, plain(Reflect.get(entity, field))])))
    .sort((left, right) => String(left['id']).localeCompare(String(right['id'])));
};

/** 任务与标签之间的中间表：主实例的 `SchemaManager` 生成的那个类。 */
const labelsJunction = (): EntityType => {
  const relation = getEntityMetadata(WorktreeConformanceTask).relationMap.get('labels');
  const junction = (relation as EntityRelationManyToManyMetadata | undefined)?.junctionEntityType;
  if (!junction) throw new Error('任务的 labels 关系没有中间表：主实例还没初始化');
  return junction;
};

/** 中间表的外键对，排好序：中间表行的 id 与簿记列不是关系的一部分。 */
const junctionPairsOf = async (rxdb: RxDB, Junction: EntityType): Promise<unknown[][]> => {
  const columns = (getEntityMetadata(Junction).foreignKeyColumnNames ?? []).map(column => `"${column}"`).join(', ');
  const adapter = await localAdapterOf(rxdb);
  return adapter.transaction(async executor => {
    const { rows } = await executor.query(`SELECT ${columns} FROM ${executor.tableRef(Junction)} ORDER BY ${columns}`);
    return rows;
  }, false);
};

/** 套件实体的全部表与中间表的外键对；传 `view` 时读只读实例上的对应类。 */
const tablesOf = async (rxdb: RxDB, view?: WorktreeView): Promise<Record<string, unknown[]>> => {
  const resolve = <T extends EntityType>(EntityClass: T): T => (view ? view.entityOf(EntityClass) : EntityClass);
  const tables: Record<string, unknown[]> = {};
  for (const EntityClass of WORKTREE_CONFORMANCE_ENTITIES) {
    tables[getEntityMetadata(EntityClass).name] = await rowsOf(rxdb, resolve(EntityClass));
  }
  tables['labels'] = await junctionPairsOf(rxdb, resolve(labelsJunction()));
  return tables;
};

const save = async <T extends EntityType>(
  rxdb: RxDB,
  EntityClass: T,
  fields: Partial<InstanceType<T>>
): Promise<InstanceType<T>> => {
  const entity = rxdb.entityManager.instantiate(EntityClass);
  Object.assign(entity, fields);
  await entity.save();
  return entity;
};

/** 工作树当前的三个捕获位。 */
const credentialsOf = async (rxdb: RxDB) => {
  const status = await rxdb.workingTree.status();
  return {
    expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
    expectedHeadRevision: status.headRevision,
    expectedWorkingTreeRevision: status.workingTreeRevision
  };
};

const commitAll = async (rxdb: RxDB, message: string): Promise<string> => {
  const result = await rxdb.workingTree.commit(message, {
    ...(await credentialsOf(rxdb)),
    authorId: 'worktree-conformance',
    operationId: uuid()
  });
  if (!result.ok) throw new Error(`提交「${message}」没落库：${JSON.stringify(result.conflict)}`);
  return result.commitId;
};

const activeBranchOf = async (rxdb: RxDB): Promise<string | undefined> =>
  (await rxdb.versionManager.getCurrentBranch())?.id;

/** 两条分支各有提交与未提交变更（AC1 的前置条件）。 */
const seedTwoBranches = async (rxdb: RxDB) => {
  const main = await activeBranchOf(rxdb);
  if (main === undefined) throw new Error('没有 active 分支');
  const shared = await save(rxdb, WorktreeConformanceTask, {
    title: '共同',
    done: false,
    priority: 1,
    dueAt: new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 678)),
    meta: { tags: ['a', 'b'] }
  });
  const mainOnly = await save(rxdb, WorktreeConformanceTask, {
    title: '只在主线',
    priority: null,
    dueAt: null,
    meta: null
  });
  const secret = await save(rxdb, WorktreeConformanceSecret, { title: '密文', note: '主线的秘密' });
  const sharedLabel = await save(rxdb, WorktreeConformanceLabel, { name: '共同标签' });
  shared.labels$.add(sharedLabel);
  await shared.save();
  await commitAll(rxdb, 'base');

  await rxdb.versionManager.createBranch(FEATURE);
  await rxdb.versionManager.switchBranch(FEATURE);
  shared.title = '特性改名';
  shared.done = true;
  shared.labels$.remove(sharedLabel);
  await shared.save();
  await mainOnly.remove();
  const featureOnly = await save(rxdb, WorktreeConformanceTask, {
    title: '只在特性',
    priority: 5,
    meta: { nested: { x: 1 } }
  });
  const featureLabel = await save(rxdb, WorktreeConformanceLabel, { name: '特性标签' });
  featureOnly.labels$.add(featureLabel, sharedLabel);
  await featureOnly.save();
  secret.note = '特性的秘密';
  await secret.save();
  const featureCommitId = await commitAll(rxdb, 'feature work');
  // 特性分支上的未提交变更
  featureOnly.priority = 7;
  await featureOnly.save();

  await rxdb.versionManager.switchBranch(main);
  // 主线上的未提交变更
  shared.priority = 2;
  await shared.save();
  return { main, shared, mainOnly, featureOnly, secret, sharedLabel, featureCommitId };
};

/**
 * 套件实体的全部表在库里的原值：按 id 排序的整行。
 *
 * @remarks
 * 不经实体缓存：写被拒之后，内存里那个实体仍带着没落库的改动，按实体读会把它当成库里的数据。
 */
const storedTablesOf = async (rxdb: RxDB, view?: WorktreeView): Promise<Record<string, unknown[][]>> => {
  const adapter = await localAdapterOf(rxdb);
  return adapter.transaction(async executor => {
    const tables: Record<string, unknown[][]> = {};
    for (const EntityClass of [...WORKTREE_CONFORMANCE_ENTITIES, labelsJunction()]) {
      const target = view ? view.entityOf(EntityClass) : EntityClass;
      const { rows } = await executor.query(`SELECT * FROM ${executor.tableRef(target)} ORDER BY "id"`);
      tables[getEntityMetadata(EntityClass).name] = rows;
    }
    return tables;
  }, false);
};

/** 主实例此刻的可见状态：active 分支、工作树、业务表。 */
const mainStateOf = async (rxdb: RxDB) => ({
  branch: await activeBranchOf(rxdb),
  status: await rxdb.workingTree.status(),
  tables: await tablesOf(rxdb)
});

/** 只读实例上的一行任务，供写入用例拿来改。 */
const firstTaskOf = async (view: WorktreeView): Promise<WorktreeConformanceTask> => {
  const ViewTask = view.entityOf(WorktreeConformanceTask);
  const tasks = await firstValueFrom(
    view.rxdb.entityManager.getRepository(ViewTask).findAll({ where: { combinator: 'and', rules: [] } })
  );
  const task = tasks[0];
  if (!task) throw new Error('只读实例上一行任务都没有');
  return task;
};

/** 一条插入动作：变更日志存储形态，补丁里只放明文列。 */
const insertTaskActions = (id: string): SwitchVersionActions => {
  const { namespace, name } = getEntityMetadata(WorktreeConformanceTask);
  return {
    deletes: new Map(),
    updates: new Map(),
    inserts: new Map([[`${namespace}:${name}:${id}`, { patch: { id, title: '越权', done: 0 }, inversePatch: null }]])
  };
};

/** 一张表某一列在库里的原值（加密列即信封）。 */
const storedColumnOf = async (rxdb: RxDB, EntityClass: EntityType, column: string): Promise<unknown[]> => {
  const adapter = await localAdapterOf(rxdb);
  return adapter.transaction(async executor => {
    const { rows } = await executor.query(`SELECT "${column}" FROM ${executor.tableRef(EntityClass)}`);
    return rows.map(row => row[0]);
  }, false);
};

/** 主库里出现过的全部信封：业务表现值，加变更日志里每条补丁的值。 */
const mainEnvelopesOf = async (rxdb: RxDB, column: string): Promise<Set<unknown>> => {
  const envelopes = new Set(await storedColumnOf(rxdb, WorktreeConformanceSecret, column));
  const adapter = await localAdapterOf(rxdb);
  const changes = await adapter.transaction(
    executor => executor.getRepository(RxDBChange).find({ where: { combinator: 'and', rules: [] } }),
    false
  );
  for (const change of changes) {
    for (const patch of [change.patch, change.inversePatch]) {
      const value = patch?.[column];
      if (value !== undefined && value !== null) envelopes.add(value);
    }
  }
  return envelopes;
};

/**
 * 只读检出位一致性套件
 *
 * @param context - 后端接入点；调用点的义务见文件头
 * @returns 无；直接向当前 `describe` 作用域注册用例
 */
export const worktreeConformanceSuite = (context: WorkingTreeConformanceSuiteContext): void => {
  describe(`[${context.name}] 只读检出位一致性`, () => {
    let database: RxDB;
    const views: WorktreeView[] = [];

    beforeEach(async () => {
      database = await context.createDatabase();
      await (await encryptionOf(database)).unlock({ keyBytes: WORKTREE_CONFORMANCE_KEY, idleTimeoutMs: 0 });
    });

    afterEach(async () => {
      for (const view of views.splice(0)) await view.close();
    });

    const open = async (target: string | WorktreeTarget): Promise<WorktreeView> => {
      const view = await database.workingTree.checkouts.open(
        typeof target === 'string' ? { branchId: target } : target
      );
      views.push(view);
      return view;
    };

    describe('分支视图（AC1）', () => {
      it('每张业务表与「切过去读到的数据」逐行一致；active 分支、工作树、业务表都不变', async () => {
        const { main } = await seedTwoBranches(database);
        const before = await mainStateOf(database);

        const view = await open(FEATURE);
        const viewed = await tablesOf(view.rxdb, view);
        // 特性分支上两条关联、主线上一条：比对不是在两张空表之间做的
        expect(viewed['labels']).toHaveLength(2);
        expect(before.tables['labels']).toHaveLength(1);

        expect(await mainStateOf(database)).toEqual(before);
        expect(before.branch).toBe(main);

        await database.versionManager.switchBranch(FEATURE);
        expect(viewed).toEqual(await tablesOf(database));
      });

      it('打开 active 分支自己：与主实例此刻读到的一致', async () => {
        const { main } = await seedTwoBranches(database);
        const view = await open(main);
        expect(await tablesOf(view.rxdb, view)).toEqual(await tablesOf(database));
      });

      it('登记表里有这条检出位；关闭后撤销', async () => {
        await seedTwoBranches(database);
        const view = await open(FEATURE);
        const records = await database.workingTree.checkouts.list();
        expect(records.map(record => [record.id, record.branchId, record.state])).toEqual([
          [view.id, FEATURE, 'ready']
        ]);

        await view.close();
        views.splice(views.indexOf(view), 1);
        expect(await database.workingTree.checkouts.list()).toEqual([]);
      });

      it('分支不存在：WorktreeUnavailableError(branch_not_found)，不留登记', async () => {
        const error = await database.workingTree.checkouts.open({ branchId: 'no-such-branch' }).catch(e => e);
        expect(error).toBeInstanceOf(WorktreeUnavailableError);
        expect((error as WorktreeUnavailableError).reason).toBe('branch_not_found');
        expect(await database.workingTree.checkouts.list()).toEqual([]);
      });
    });

    describe('只读（AC2）', () => {
      it('公开写入口抛 RxDBReadOnlyError；快照库与主库都不变', async () => {
        await seedTwoBranches(database);
        const before = await mainStateOf(database);
        const view = await open(FEATURE);
        const stored = await storedTablesOf(view.rxdb, view);
        const ViewTask = view.entityOf(WorktreeConformanceTask);
        const repository = view.rxdb.entityManager.getRepository(ViewTask);
        const task = await firstTaskOf(view);

        await expect(repository.update(task, { title: '越权' })).rejects.toBeInstanceOf(RxDBReadOnlyError);
        await expect(repository.remove(task)).rejects.toBeInstanceOf(RxDBReadOnlyError);
        const created = view.rxdb.entityManager.instantiate(ViewTask);
        created.title = '越权';
        await expect(repository.create(created)).rejects.toBeInstanceOf(RxDBReadOnlyError);
        task.title = '越权';
        await expect(task.save()).rejects.toBeInstanceOf(RxDBReadOnlyError);

        expect(await storedTablesOf(view.rxdb, view)).toEqual(stored);
        expect(await mainStateOf(database)).toEqual(before);
      });

      it('适配器层的批量写、raw 写与执行器写都被拒；快照库不变', async () => {
        await seedTwoBranches(database);
        const view = await open(FEATURE);
        const stored = await storedTablesOf(view.rxdb, view);
        const ViewTask = view.entityOf(WorktreeConformanceTask);
        const adapter = await localAdapterOf(view.rxdb);
        const { name } = getEntityMetadata(ViewTask);

        await expect(adapter.mergeChanges(insertTaskActions(uuid()))).rejects.toBeInstanceOf(RxDBReadOnlyError);
        await expect(
          (async () => firstValueFrom(adapter.upsertMany(name, [{ id: uuid(), title: '越权' }])))()
        ).rejects.toBeInstanceOf(RxDBReadOnlyError);
        await expect((async () => firstValueFrom(adapter.deleteByIds(name, [uuid()])))()).rejects.toBeInstanceOf(
          RxDBReadOnlyError
        );

        expect(adapter.rawQuery, '后端没有 rawQuery').toBeDefined();
        const table = await adapter.transaction(async executor => executor.tableRef(ViewTask), false);
        await expect(adapter.rawQuery!(`DELETE FROM ${table}`)).rejects.toBeInstanceOf(RxDBReadOnlyError);
        // 执行器写不经核心写入口，也不经挂载点：只剩引擎封印
        const intruder = view.rxdb.entityManager.instantiate(ViewTask);
        intruder.title = '越权';
        await expect(adapter.transaction(executor => executor.saveMany([intruder]), false)).rejects.toThrow(
          /read-only|readonly/i
        );

        expect(await storedTablesOf(view.rxdb, view)).toEqual(stored);
      });
    });

    describe('不污染主实例（AC3）', () => {
      it('只读实例的实体不进主实例的实体缓存', async () => {
        const { shared, mainOnly, featureOnly } = await seedTwoBranches(database);
        const ids = [shared.id, mainOnly.id, featureOnly.id];
        const cachedOf = () => ids.map(id => database.entityManager.getEntityRef(WorktreeConformanceTask, id));
        const cachedBefore = cachedOf();

        const view = await open(FEATURE);
        const ViewTask = view.entityOf(WorktreeConformanceTask);
        const viewTasks = await firstValueFrom(
          view.rxdb.entityManager.getRepository(ViewTask).findAll({ where: { combinator: 'and', rules: [] } })
        );

        // 主实例缓存里的条目一个都没变：没有新增，也没有被换成只读实例的对象
        cachedOf().forEach((cached, index) => expect(cached).toBe(cachedBefore[index]));
        for (const task of viewTasks) {
          expect(task).toBeInstanceOf(ViewTask);
          expect(database.entityManager.getEntityRef(WorktreeConformanceTask, task.id)).not.toBe(task);
        }
        expect(viewTasks.find(task => task.id === shared.id)?.title).toBe('特性改名');
        expect(shared.title).toBe('共同');
      });
    });

    describe('加密（AC4）', () => {
      it('快照里每个密文都是主库已有信封的逐字节拷贝；密钥环上锁照样建得出来', async () => {
        const { secret } = await seedTwoBranches(database);
        const envelopes = await mainEnvelopesOf(database, 'note');
        const encryption = await encryptionOf(database);

        encryption.lock();
        const view = await open(FEATURE);
        const copied = await storedColumnOf(view.rxdb, view.entityOf(WorktreeConformanceSecret), 'note');
        expect(copied.length).toBeGreaterThan(0);
        for (const value of copied) expect(envelopes.has(value), `密文 ${String(value)} 不是主库已有的信封`).toBe(true);

        await encryption.unlock({ keyBytes: WORKTREE_CONFORMANCE_KEY, idleTimeoutMs: 0 });
        const [viewSecret] = await rowsOf(view.rxdb, view.entityOf(WorktreeConformanceSecret));
        expect(viewSecret).toMatchObject({ id: secret.id, note: '特性的秘密' });
      });
    });

    describe('提交视图（AC6、AC7）', () => {
      it('当前分支上一个可达提交：已跟踪实体与那次 commit() 刚完成时读到的逐行一致', async () => {
        const { shared, mainOnly, secret, sharedLabel } = await seedTwoBranches(database);
        const target = await commitAll(database, '目标提交');
        const atTarget = await tablesOf(database);

        // 目标之后：一次提交改名、新建、改密文、删关联、删行，再留一批未提交变更
        shared.title = '目标之后改名';
        shared.labels$.remove(sharedLabel);
        await shared.save();
        const later = await save(database, WorktreeConformanceTask, { title: '目标之后新建', priority: 3 });
        secret.note = '目标之后的秘密';
        await secret.save();
        await mainOnly.remove();
        await commitAll(database, '目标之后');
        later.priority = 9;
        await later.save();
        shared.done = true;
        await shared.save();
        const before = await mainStateOf(database);

        const view = await open({ commitId: target });

        expect(await tablesOf(view.rxdb, view)).toEqual(atTarget);
        expect(await mainStateOf(database)).toEqual(before);
        expect((await database.workingTree.checkouts.list()).map(record => [record.kind, record.commitId])).toEqual([
          ['commit', target]
        ]);
      });

      it('不在当前分支 HEAD 可达父链上的提交：unreachable_target，与 restore 同口径', async () => {
        const { featureCommitId } = await seedTwoBranches(database);

        const error = await database.workingTree.checkouts.open({ commitId: featureCommitId }).catch(e => e);
        expect(error).toBeInstanceOf(WorktreeUnavailableError);
        expect((error as WorktreeUnavailableError).reason).toBe('unreachable_target');
        const restored = await database.workingTree.restore(
          { commitId: featureCommitId },
          await credentialsOf(database)
        );
        expect(restored).toMatchObject({ ok: false });
        expect(await database.workingTree.checkouts.list()).toEqual([]);
      });

      it('有进行中的恢复：restoring_working_tree', async () => {
        await seedTwoBranches(database);
        const first = await commitAll(database, '第一');
        const latest = await save(database, WorktreeConformanceTask, { title: '第二' });
        expect(latest.id).toBeDefined();
        await commitAll(database, '第二');
        const restored = await database.workingTree.restore({ commitId: first }, await credentialsOf(database));
        expect(restored).toMatchObject({ ok: true });

        const error = await database.workingTree.checkouts.open({ commitId: first }).catch(e => e);
        expect((error as WorktreeUnavailableError).reason).toBe('restoring_working_tree');
      });
    });

    describe('生命周期与回收（AC8～AC10）', () => {
      it('close()：断开之后删快照库、撤销登记', async () => {
        await seedTwoBranches(database);
        const view = await open(FEATURE);
        const adapter = await localAdapterOf(view.rxdb);
        const drop = vi.spyOn(adapter, 'dropStorage');

        await view.close();
        views.splice(views.indexOf(view), 1);

        expect(drop).toHaveBeenCalledTimes(1);
        expect(await database.workingTree.checkouts.list()).toEqual([]);
        const error = await database.workingTree.checkouts.attach(view.id).catch(e => e);
        expect((error as WorktreeUnavailableError).reason).toBe('not_found');
      });

      it('会话归属的检出位所在处已不在：prune() 回收它，还开着的不受影响', async () => {
        await seedTwoBranches(database);
        const held = await open(FEATURE);
        const viewed = await tablesOf(held.rxdb, held);
        const gone = await open(FEATURE);
        // 放开 = 本处的只读实例与锁都没了，与标签页关掉或崩掉同一个形状
        await gone.release();
        views.splice(views.indexOf(gone), 1);

        expect(await database.workingTree.checkouts.prune()).toEqual([gone.id]);
        expect((await database.workingTree.checkouts.list()).map(record => record.id)).toEqual([held.id]);
        expect(await tablesOf(held.rxdb, held)).toEqual(viewed);
      });

      it('持久归属的检出位：放开之后还在登记里，attach() 原样打开；prune() 不碰它', async () => {
        await seedTwoBranches(database);
        const view = await database.workingTree.checkouts.open({ branchId: FEATURE }, { owner: 'persistent' });
        const viewed = await tablesOf(view.rxdb, view);
        await view.release();
        expect(await database.workingTree.checkouts.prune()).toEqual([]);

        const attached = await database.workingTree.checkouts.attach(view.id);
        views.push(attached);

        expect(attached).toMatchObject({ id: view.id, owner: 'persistent', target: { branchId: FEATURE } });
        expect(await tablesOf(attached.rxdb, attached)).toEqual(viewed);
        const again = await database.workingTree.checkouts.attach(view.id).catch(e => e);
        expect((again as WorktreeUnavailableError).reason).toBe('in_use');
      });
    });

    describe('建立时刻的数据与 refresh()（AC5）', () => {
      it('目标分支随后又写入：视图仍是建立时刻的数据；refresh() 后与新状态一致', async () => {
        const { main, featureOnly } = await seedTwoBranches(database);
        const view = await open(FEATURE);
        const viewed = await tablesOf(view.rxdb, view);

        await database.versionManager.switchBranch(FEATURE);
        featureOnly.title = '建立之后又改';
        await featureOnly.save();
        await database.versionManager.switchBranch(main);

        expect(await tablesOf(view.rxdb, view)).toEqual(viewed);

        const refreshed = await view.refresh();
        views.splice(views.indexOf(view), 1, refreshed);
        const latest = await tablesOf(refreshed.rxdb, refreshed);
        await database.versionManager.switchBranch(FEATURE);
        expect(latest).toEqual(await tablesOf(database));
        expect(await database.workingTree.checkouts.list()).toHaveLength(1);
      });
    });
  });
};
