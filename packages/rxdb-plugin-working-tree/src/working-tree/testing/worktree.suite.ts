/**
 * @fileoverview `worktreeConformanceSuite` —— 只读检出位一致性套件（US-313）。
 *
 * @remarks
 * 判据只有一条：只读检出位里读到的，与「真的切过去读到的」逐行一致，而主实例一处都没动。
 * 比对去掉 `ENTITY_BOOKKEEPING_FIELDS`：切换写回的行 `updatedAt` 取写入时刻，快照复制的行保留原值。
 *
 * **调用点的义务**（{@link WorktreeConformanceSuiteContext.createDatabase}）：注册
 * {@link WORKTREE_CONFORMANCE_ENTITIES}，装上历史插件与带 `worktrees.adapter` 的工作树插件，
 * `enable()` 之后交回。密钥环由套件自己解锁（{@link WORKTREE_CONFORMANCE_KEY}）。
 * 持久归属的检出位放开之后要能原样再打开（AC10）：这条用例的库来自
 * {@link WorktreeConformanceSuiteContext.createDatabaseWithPersistentSnapshots}，没给就用 `createDatabase`，
 * 那时 `worktrees.adapter` 要造**持久**存储的快照库。快照库开在持久存储上很贵的后端（每个快照库一个 Worker），
 * 平时给内存档、只在这条用例上给持久档。
 *
 * 必填的上下文形状与另外两套相同：六个后端各写三个调用点，形状分叉的话写调用点的人就得逐套件回忆参数。
 *
 * 从提交建分支（US-314 阶段 A）也收在这里：判据同口径——切到新分支读到的，与那次 `commit()` 刚完成时读到的逐行一致。
 * 这套的调用点建得了分支（`SyncType.None`），捕获套件那边建不了。不切换的对比与合并预览（US-312）的真库冒烟同理收在这里。
 *
 * 可写检出位（US-314 B1.5）同理：`checkouts.add()` 开出来、`mount()` 挂上之后，写捕获进持有分支的工作树、提交进它的历史，
 * 主检出位一处不动；播种出来的、在检出位里写过的，都与「删掉检出位再切过去读到的」逐行一致。
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
import {
  ENTITY_BOOKKEEPING_FIELDS,
  ENTITY_LOCAL_NEW_EVENT,
  getEntityMetadata,
  RxDBBranch,
  RxDBChange,
  RxDBReadOnlyError,
  uuid,
  WorktreeBranchHeldError,
  WorktreeTableSet
} from '@aiao/rxdb';
import { WorktreeUnavailableError } from '../../checkout/worktree-errors.js';
import { holdWorktreeLock, worktreeLockName } from '../../checkout/worktree-locks.js';
import type { WorktreeView } from '../../checkout/worktree-manager.js';
import type { WorktreeTarget } from '../../checkout/worktree-target.js';
import { CommitForkPoint } from '../../commit/commit-fork-point.entity.js';
import type { WorktreeConformanceSuiteContext } from './suite-context.js';
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

/** 库里全部分支的 id，排好序。 */
const branchIdsOf = async (rxdb: RxDB): Promise<string[]> => {
  const branches = await firstValueFrom(
    rxdb.entityManager.getRepository(RxDBBranch).findAll({ where: { combinator: 'and', rules: [] } })
  );
  return branches.map(branch => branch.id).sort();
};

/** 当前分支历史里的提交 id，HEAD 在前。 */
const historyOf = async (rxdb: RxDB): Promise<string[]> =>
  (await rxdb.workingTree.listCommits()).entries.map(entry => entry.commitId);

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

/** 变更日志的行数：开、删检出位都不该多出一行。 */
const changeCountOf = async (rxdb: RxDB): Promise<number> => {
  const adapter = await localAdapterOf(rxdb);
  return adapter.transaction(async executor => {
    const { rows } = await executor.query(`SELECT count(*) FROM ${executor.tableRef(RxDBChange)}`);
    return Number(rows[0][0]);
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
export const worktreeConformanceSuite = (context: WorktreeConformanceSuiteContext): void => {
  describe(`[${context.name}] 只读检出位一致性`, () => {
    let database: RxDB;
    const views: WorktreeView[] = [];

    /** 造一个库并解锁密钥环 */
    const prepare = async (create: () => Promise<RxDB>): Promise<RxDB> => {
      const created = await create();
      await (await encryptionOf(created)).unlock({ keyBytes: WORKTREE_CONFORMANCE_KEY, idleTimeoutMs: 0 });
      return created;
    };

    beforeEach(async () => {
      database = await prepare(context.createDatabase);
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
        // 会话设置能把引擎封印解开（SQLite 系的 `query_only`、PGlite 的只读默认值），raw 入口一律拒
        for (const sql of ['PRAGMA query_only = 0', 'SET SESSION default_transaction_read_only = off']) {
          await expect(adapter.rawQuery!(sql)).rejects.toBeInstanceOf(RxDBReadOnlyError);
        }
        // PGlite 能在一条读语句里改会话默认值，raw 门认不出它；改掉之后的事务也得照样只读。
        // SQLite 系没有这个函数，报错即可——结果不论，只看下面的写还拒不拒
        await Promise.allSettled([
          adapter.rawQuery!("SELECT set_config('default_transaction_read_only', 'off', false)")
        ]);
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

      // 核心系统实体两个实例都登记：静态调用（三端查询 hook 走的就是它）要落到主实例，而不是报多实例
      it('检出位开着时，主实例上系统实体的静态查询照常落到主实例', async () => {
        await seedTwoBranches(database);
        await open(FEATURE);
        const all = { where: { combinator: 'and' as const, rules: [] } };

        const viaStatic = await firstValueFrom(RxDBBranch.findAll(all));
        const viaInstance = await firstValueFrom(database.entityManager.getRepository(RxDBBranch).findAll(all));

        expect(viaStatic.map(branch => branch.id).sort()).toEqual(viaInstance.map(branch => branch.id).sort());
        expect(viaStatic.map(branch => branch.id)).toContain(FEATURE);
      });

      // 草稿缓存（`@aiao/rxdb-plugin-workspace`）装在主实例上，只在主实例的 NEW 事件上记新草稿（CREATE / REMOVE 是删草稿），
      // 系统实体与不记日志的实体它不收（US-311）：只读实例上的查询与新建实例不能把业务实体的 NEW 派发到主实例，
      // 否则预览实体会被当成新草稿。只看 NEW：有的后端经变更流派发 CREATE，播种时的那批会晚到，与只读实例无关
      it('只读实例上的查询与实例化不在主实例上派发业务实体的 NEW', async () => {
        await seedTwoBranches(database);
        const business = new Set(
          WORKTREE_CONFORMANCE_ENTITIES.map(EntityClass => {
            const { namespace, name } = getEntityMetadata(EntityClass);
            return `${namespace}:${name}`;
          })
        );
        const seen: string[] = [];
        const record = (event: { readonly entities: readonly { namespace: string; entity: string }[] }) => {
          for (const { namespace, entity } of event.entities) seen.push(`${namespace}:${entity}`);
        };
        const fresh = uuid();
        const seenOnView: string[] = [];
        database.addEventListener(ENTITY_LOCAL_NEW_EVENT, record);
        try {
          const view = await open(FEATURE);
          const ViewTask = view.entityOf(WorktreeConformanceTask);
          view.rxdb.addEventListener(ENTITY_LOCAL_NEW_EVENT, event => {
            for (const { id } of event.entities) seenOnView.push(String(id));
          });
          await firstValueFrom(
            view.rxdb.entityManager.getRepository(ViewTask).findAll({ where: { combinator: 'and', rules: [] } })
          );
          view.rxdb.entityManager.instantiate(ViewTask, { id: fresh });
          // NEW 在构造之后的微任务里才派发：等它派完再看
          await Promise.resolve();
        } finally {
          database.removeEventListener(ENTITY_LOCAL_NEW_EVENT, record);
        }

        // 正对照：新建实例那条 NEW 确实派发了，只是落在只读实例自己身上
        expect(seenOnView).toContain(fresh);
        expect(
          seen.filter(key => business.has(key)),
          `主实例收到的 NEW：${seen.join(', ') || '无'}`
        ).toEqual([]);
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

    describe('对比与合并预览（US-312，真库冒烟）', () => {
      // 两者的区间查询（`id > 起点 AND id <= 终点 AND revertChangeId = null`）在每个后端的规则引擎上各翻译一遍。
      // 判据是「切过去读到的」与「合并真正落的」；只比任务的标题与存在性——补丁不解码，布尔、日期、加密列各后端存法不同
      it('compareBranches 列出的任务与切过去读到的一致；previewMerge 的条目就是随后 mergeBranch 落的', async () => {
        const { main } = await seedTwoBranches(database);
        const taskName = getEntityMetadata(WorktreeConformanceTask).name;
        const titles = async (): Promise<Map<string, unknown>> =>
          new Map((await rowsOf(database, WorktreeConformanceTask)).map(row => [String(row['id']), row['title']]));
        const titleOf = (patch: Record<string, unknown> | null): unknown => patch?.['title'];
        const onMain = await titles();
        await database.versionManager.switchBranch(FEATURE);
        const onFeature = await titles();
        await database.versionManager.switchBranch(main);

        const compared = (await database.versionManager.compareBranches(main, FEATURE)).entries.filter(
          entry => entry.entity === taskName
        );
        const idsOf = (operation: string) =>
          compared
            .filter(entry => entry.operation === operation)
            .map(entry => String(entry.entityId))
            .sort();
        expect(idsOf('INSERT')).toEqual([...onFeature.keys()].filter(id => !onMain.has(id)).sort());
        expect(idsOf('DELETE')).toEqual([...onMain.keys()].filter(id => !onFeature.has(id)).sort());
        const retitled = compared.filter(entry => entry.operation === 'UPDATE' && titleOf(entry.patch) !== undefined);
        expect(retitled.map(entry => String(entry.entityId)).sort()).toEqual(
          [...onFeature]
            .filter(([id, title]) => onMain.has(id) && onMain.get(id) !== title)
            .map(([id]) => id)
            .sort()
        );
        for (const entry of retitled) {
          expect([titleOf(entry.patch), titleOf(entry.inversePatch)]).toEqual([
            onFeature.get(String(entry.entityId)),
            onMain.get(String(entry.entityId))
          ]);
        }

        // 合并的结果进工作树：先把主线的未提交改动提交掉，合并落的就只有源分支那一份
        await commitAll(database, '合并之前');
        const preview = await database.versionManager.previewMerge(FEATURE);
        const merged = await database.versionManager.mergeBranch(FEATURE);
        expect(merged.merged).toBe(preview.merged);
        const afterMerge = await titles();
        const previewed = preview.entries.filter(entry => entry.entity === taskName);
        for (const entry of previewed) {
          const id = String(entry.entityId);
          if (entry.operation === 'DELETE') expect(afterMerge.has(id)).toBe(false);
          else if (titleOf(entry.patch) !== undefined) expect(afterMerge.get(id)).toBe(titleOf(entry.patch));
          else expect(afterMerge.has(id)).toBe(true);
        }
        for (const [id, title] of onMain) {
          if (!previewed.some(entry => String(entry.entityId) === id)) expect(afterMerge.get(id)).toBe(title);
        }
      });
    });

    describe('从提交建分支（US-314 AC1）', () => {
      it('切到新分支逐行等于那次 commit() 刚完成时；HEAD 就是那个提交、工作树干净；原分支一格不动', async () => {
        const { main, shared, mainOnly, secret, sharedLabel } = await seedTwoBranches(database);
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
        const before = await mainStateOf(database);
        const mainHistory = await historyOf(database);

        await expect(database.workingTree.checkBranchFromCommit(target)).resolves.toEqual({ ok: true });
        const created = await database.workingTree.createBranchFromCommit('from-target', target);

        expect(created).toMatchObject({ ok: true, branch: { id: 'from-target', parentId: main, activated: false } });
        expect(await mainStateOf(database)).toEqual(before);

        await database.versionManager.switchBranch('from-target');
        expect(await tablesOf(database)).toEqual(atTarget);
        expect((await database.workingTree.status()).entryCount).toBe(0);
        // 与原分支共享那个提交之前的历史，不是一个从零开始的分支基线
        expect(await historyOf(database)).toEqual(mainHistory.slice(mainHistory.indexOf(target)));

        await database.versionManager.switchBranch(main);
        expect(await tablesOf(database)).toEqual(before.tables);
        expect((await database.workingTree.status()).entryCount).toBe(before.status.entryCount);

        await database.versionManager.switchBranch('from-target');
        expect(await tablesOf(database)).toEqual(atTarget);
      });

      it('从继承段上的提交建：在特性分支上挑主线的提交，新分支挂在主线上', async () => {
        const main = await activeBranchOf(database);
        const task = await save(database, WorktreeConformanceTask, { title: '主线', priority: 1 });
        const base = await commitAll(database, 'base');
        const atBase = await tablesOf(database);
        await database.versionManager.createBranch(FEATURE);
        await database.versionManager.switchBranch(FEATURE);
        task.title = '特性改名';
        await task.save();
        await save(database, WorktreeConformanceTask, { title: '只在特性' });
        await commitAll(database, 'feature work');

        const created = await database.workingTree.createBranchFromCommit('from-base', base);

        expect(created).toMatchObject({ ok: true, branch: { parentId: main } });
        await database.versionManager.switchBranch('from-base');
        expect(await tablesOf(database)).toEqual(atBase);
      });

      it('从启用时写下的基线建：数据是启用那一刻的', async () => {
        const atEnable = await tablesOf(database);
        await save(database, WorktreeConformanceTask, { title: '启用之后' });
        await commitAll(database, '启用之后');
        const baseline = (await database.workingTree.listCommits()).entries.find(entry => entry.kind === 'baseline');
        if (!baseline) throw new Error('当前分支的历史里没有启用基线');

        await expect(
          database.workingTree.createBranchFromCommit('from-baseline', baseline.commitId)
        ).resolves.toMatchObject({ ok: true });
        await database.versionManager.switchBranch('from-baseline');
        expect(await tablesOf(database)).toEqual(atEnable);
      });

      it('提交之后撤销过它里面的变更：history_rewritten，不建分支；撤销提交之后的改动不受影响', async () => {
        const task = await save(database, WorktreeConformanceTask, { title: '第一' });
        const first = await commitAll(database, '第一');
        task.title = '提交之后';
        await task.save();

        // 撤的是提交之后那一笔，不在新分支要继承的那段里
        await database.versionManager.history().undo();
        await expect(database.workingTree.checkBranchFromCommit(first)).resolves.toEqual({ ok: true });

        // 再撤就撤到了那个提交里面
        await database.versionManager.history().undo();
        await expect(database.workingTree.checkBranchFromCommit(first)).resolves.toEqual({
          ok: false,
          reason: 'history_rewritten'
        });
        const branches = await branchIdsOf(database);
        await expect(database.workingTree.createBranchFromCommit('rewritten', first)).resolves.toEqual({
          ok: false,
          reason: 'history_rewritten'
        });
        expect(await branchIdsOf(database)).toEqual(branches);
      });

      it('不可达：unreachable_target；没有分叉点记录：fork_point_unknown；重名与 createBranch 同文案；都不建分支', async () => {
        const { featureCommitId } = await seedTwoBranches(database);
        const target = await commitAll(database, '目标提交');
        const branches = await branchIdsOf(database);

        await expect(database.workingTree.createBranchFromCommit('unreachable', featureCommitId)).resolves.toEqual({
          ok: false,
          reason: 'unreachable_target'
        });
        await expect(database.workingTree.createBranchFromCommit(FEATURE, target)).rejects.toThrow(
          `Branch id (${FEATURE}) already exists`
        );

        // 分叉点表出现之前的提交没有这一行
        const adapter = await localAdapterOf(database);
        await adapter.transaction(async executor => {
          const rows = await executor
            .getRepository(CommitForkPoint)
            .find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: target }] } });
          await executor.removeMany(rows);
        });
        await expect(database.workingTree.checkBranchFromCommit(target)).resolves.toEqual({
          ok: false,
          reason: 'fork_point_unknown'
        });
        await expect(database.workingTree.createBranchFromCommit('old-commit', target)).resolves.toEqual({
          ok: false,
          reason: 'fork_point_unknown'
        });
        expect(await branchIdsOf(database)).toEqual(branches);
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
        const persistent =
          context.createDatabaseWithPersistentSnapshots ?
            await prepare(context.createDatabaseWithPersistentSnapshots)
          : database;
        await seedTwoBranches(persistent);
        const view = await persistent.workingTree.checkouts.open({ branchId: FEATURE }, { owner: 'persistent' });
        const viewed = await tablesOf(view.rxdb, view);
        await view.release();
        expect(await persistent.workingTree.checkouts.prune()).toEqual([]);

        const attached = await persistent.workingTree.checkouts.attach(view.id);
        views.push(attached);

        expect(attached).toMatchObject({ id: view.id, owner: 'persistent', target: { branchId: FEATURE } });
        expect(await tablesOf(attached.rxdb, attached)).toEqual(viewed);
        const again = await persistent.workingTree.checkouts.attach(view.id).catch(e => e);
        expect((again as WorktreeUnavailableError).reason).toBe('in_use');

        // 登记行还在、快照库却被删了：再 attach 连上的是一个新建的空库，要报 not_found，不能交回一张张空表
        const snapshotAdapter = await localAdapterOf(attached.rxdb);
        await attached.release();
        views.splice(views.indexOf(attached), 1);
        await snapshotAdapter.dropStorage!();
        const lost = await persistent.workingTree.checkouts.attach(view.id).catch(e => e);
        expect((lost as WorktreeUnavailableError).reason).toBe('not_found');
        expect(await persistent.workingTree.checkouts.list()).toEqual([]);
      });
    });

    // 持有分支在主检出位写任何东西之前建好：B1.5 的播种还没有，空的影子表正好就是它的内容
    describe('可写检出位（US-314 AC3、AC4）', () => {
      const checkoutsOf = () => database.workingTree.checkouts;

      // 用例中途失败也要还锁、挂回主检出位：认领着的检出位握着锁，库换了也不会自己放
      afterEach(async () => {
        for (const row of await checkoutsOf().list()) {
          if (row.mode === 'writable') await checkoutsOf().release(row.id);
        }
      });

      it('AC3：检出位里写并提交，提交进那条分支的历史；主检出位的分支、工作树与业务表一处不动', async () => {
        const { featureCommitId } = await seedTwoBranches(database);
        const before = await mainStateOf(database);
        const worktree = await checkoutsOf().add(FEATURE);
        expect(worktree).toMatchObject({ mode: 'writable', kind: 'branch', branchId: FEATURE, owner: 'persistent' });

        await checkoutsOf().mount(worktree.id);
        expect(await activeBranchOf(database)).toBe(FEATURE);
        // 特性分支自己的未提交改动（seedTwoBranches 最后那次改优先级）跟着分支走
        expect(await database.workingTree.status()).toMatchObject({ branchId: FEATURE, clean: false });
        await save(database, WorktreeConformanceTask, { title: '检出位里写的', priority: 3, dueAt: null, meta: null });
        const commitId = await commitAll(database, 'in worktree');
        expect((await historyOf(database)).slice(0, 2)).toEqual([commitId, featureCommitId]);
        expect((await database.workingTree.status()).clean).toBe(true);

        await checkoutsOf().mountMain();
        expect(await mainStateOf(database)).toEqual(before);
        await checkoutsOf().remove(worktree.id);
        expect(await mainStateOf(database)).toEqual(before);
        expect(await checkoutsOf().list()).toEqual([]);

        await database.versionManager.switchBranch(FEATURE);
        expect((await historyOf(database))[0]).toBe(commitId);
      });

      it('AC4：再开被占用的分支、开主检出位的当前分支、主检出位切过去，都被拒；删掉之后都放行', async () => {
        const { main } = await seedTwoBranches(database);
        const worktree = await checkoutsOf().add(FEATURE);

        await expect(checkoutsOf().add(FEATURE)).rejects.toBeInstanceOf(WorktreeBranchHeldError);
        await expect(checkoutsOf().add(main)).rejects.toBeInstanceOf(WorktreeBranchHeldError);
        await expect(database.versionManager.switchBranch(FEATURE)).rejects.toThrow(/already used by a worktree/);
        expect((await checkoutsOf().list()).map(row => row.id)).toEqual([worktree.id]);

        await checkoutsOf().remove(worktree.id);
        const again = await checkoutsOf().add(FEATURE);
        await checkoutsOf().remove(again.id);
        await database.versionManager.switchBranch(FEATURE);
        expect(await activeBranchOf(database)).toBe(FEATURE);
      });

      it('播种出来的与切过去读到的逐行一致；检出位里写过之后，删掉检出位再切过去读到的也一致', async () => {
        const { main, featureOnly, sharedLabel } = await seedTwoBranches(database);
        const seededCheckout = await checkoutsOf().add(FEATURE);
        await checkoutsOf().mount(seededCheckout.id);
        const seeded = await tablesOf(database);
        await checkoutsOf().remove(seededCheckout.id);
        await database.versionManager.switchBranch(FEATURE);
        expect(await tablesOf(database)).toEqual(seeded);

        await database.versionManager.switchBranch(main);
        const writtenCheckout = await checkoutsOf().add(FEATURE);
        await checkoutsOf().mount(writtenCheckout.id);
        const [task] = await firstValueFrom(
          database.entityManager
            .getRepository(WorktreeConformanceTask)
            .findAll({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: featureOnly.id }] } })
        );
        task.title = '检出位里改名';
        task.labels$.remove(sharedLabel);
        await task.save();
        await save(database, WorktreeConformanceLabel, { name: '检出位里加的标签' });
        const written = await tablesOf(database);
        await checkoutsOf().remove(writtenCheckout.id);
        await database.versionManager.switchBranch(FEATURE);
        expect(await tablesOf(database)).toEqual(written);
      });

      // 隔离探针：开、删都只动这套影子表、分支表上的持有键与登记行。SQLite 删表时先隐式删行再删表，
      // 中间表的级联删除若被还挂着的触发器记下来，变更日志就会凭空多出一批持有分支上的删除
      it('开、删检出位不改主表的原值、不写变更日志；删表引起的中间表级联也不记', async () => {
        await seedTwoBranches(database);
        const stored = await storedTablesOf(database);
        const changes = await changeCountOf(database);

        const worktree = await checkoutsOf().add(FEATURE);
        expect(await storedTablesOf(database)).toEqual(stored);
        expect(await changeCountOf(database)).toBe(changes);

        await checkoutsOf().remove(worktree.id);
        expect(await storedTablesOf(database)).toEqual(stored);
        expect(await changeCountOf(database)).toBe(changes);
      });

      it('密钥环上锁时也开得了；挂上之后读到的密文是主库已有信封的逐字节拷贝', async () => {
        const { secret } = await seedTwoBranches(database);
        const envelopes = await mainEnvelopesOf(database, 'note');
        const encryption = await encryptionOf(database);

        encryption.lock();
        const worktree = await checkoutsOf().add(FEATURE);
        await encryption.unlock({ keyBytes: WORKTREE_CONFORMANCE_KEY, idleTimeoutMs: 0 });
        await checkoutsOf().mount(worktree.id);

        const copied = await storedColumnOf(database, WorktreeConformanceSecret, 'note');
        expect(copied.length).toBeGreaterThan(0);
        for (const value of copied) expect(envelopes.has(value), `密文 ${String(value)} 不是主库已有的信封`).toBe(true);
        const [worktreeSecret] = await rowsOf(database, WorktreeConformanceSecret);
        expect(worktreeSecret).toMatchObject({ id: secret.id, note: '特性的秘密' });
      });

      it('会话归属：release() 之后 prune() 收走它，分支放开；持久归属的留着，任何一处都能再 mount()', async () => {
        await database.versionManager.createBranch(FEATURE);
        const session = await checkoutsOf().add(FEATURE, { owner: 'session' });
        await checkoutsOf().release(session.id);
        expect(await checkoutsOf().prune()).toEqual([session.id]);
        expect(await checkoutsOf().list()).toEqual([]);

        const persistent = await checkoutsOf().add(FEATURE);
        await checkoutsOf().release(persistent.id);
        expect(await checkoutsOf().prune()).toEqual([]);
        await checkoutsOf().mount(persistent.id);
        expect(await activeBranchOf(database)).toBe(FEATURE);
        await checkoutsOf().remove(persistent.id);
        expect(database.worktreeTableSet.isMain).toBe(true);
        await database.versionManager.switchBranch(FEATURE);
        expect(await activeBranchOf(database)).toBe(FEATURE);
      });

      it('锁在别处时 mount() / remove() 报 in_use；挂在它上面时 remove() 先挂回主检出位', async () => {
        const main = await activeBranchOf(database);
        await database.versionManager.createBranch(FEATURE);
        const worktree = await checkoutsOf().add(FEATURE);
        await checkoutsOf().release(worktree.id);

        const elsewhere = (await holdWorktreeLock(worktreeLockName(database.config.dbName, worktree.id)))!;
        const mounted = await checkoutsOf()
          .mount(worktree.id)
          .catch((error: unknown) => error);
        expect((mounted as WorktreeUnavailableError).reason).toBe('in_use');
        const removed = await checkoutsOf()
          .remove(worktree.id)
          .catch((error: unknown) => error);
        expect((removed as WorktreeUnavailableError).reason).toBe('in_use');
        await elsewhere();

        await checkoutsOf().mount(worktree.id);
        await checkoutsOf().remove(worktree.id);
        expect(database.worktreeTableSet.isMain).toBe(true);
        expect(await activeBranchOf(database)).toBe(main);
      });

      // 漏登记的那张表还是主检出位的表，触发器把变更记在主检出位的分支名下：捕获进持有分支的工作树就是一笔错账。
      // `add()` 的成员总是整个版本化域，造不出这种表集，这里经适配器的槽位手工建
      it('表集漏登记了版本化实体：写落到主检出位的表上，整笔被拒、一行都不落', async () => {
        await database.versionManager.createBranch(FEATURE);
        const before = await storedTablesOf(database);
        const members = [...WORKTREE_CONFORMANCE_ENTITIES, labelsJunction()].filter(
          EntityClass => EntityClass !== WorktreeConformanceSecret
        );
        const tableSet = WorktreeTableSet.of('wt_conform', members);
        const adapter = await localAdapterOf(database);
        await adapter.transaction(async executor => {
          const branches = executor.getRepository(RxDBBranch);
          const [branch] = await branches.find({
            where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: FEATURE }] },
            limit: 1
          });
          if (!branch) throw new Error(`分支 ${FEATURE} 不存在`);
          await branches.update(branch, { activeKey: tableSet.holderKey });
          await adapter.createWorktreeTableSet!(executor, tableSet, {
            branchId: FEATURE,
            actions: { inserts: new Map(), updates: new Map(), deletes: new Map() }
          });
        }, false);
        await database.mountWorktreeTableSet(tableSet);

        await expect(save(database, WorktreeConformanceSecret, { title: '漏登记', note: '不该落库' })).rejects.toThrow(
          /不是本实例的当前分支/
        );
        expect((await database.workingTree.status()).clean).toBe(true);

        await database.mountWorktreeTableSet(WorktreeTableSet.MAIN);
        expect(await storedTablesOf(database)).toEqual(before);
        expect((await database.workingTree.status()).clean).toBe(true);
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
