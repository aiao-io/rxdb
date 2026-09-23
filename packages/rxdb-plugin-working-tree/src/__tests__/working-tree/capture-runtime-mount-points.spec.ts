/**
 * @fileoverview T058–T061 的运行时侧用例：四个挂载点**拦到之后算什么**（adapter-contract.md §1）。
 *
 * @remarks
 * 这个特性在核心包里分三层，各有各的用例：`capture-mount-points.spec.ts` 钉「哪些写原语必须被挂」，
 * `raw-write-gate-wiring.spec.ts` 钉「挂得住吗」，本文件钉第三件——**拦到之后算什么**。
 * 入口从哪来、捕获的数据取自哪个源、拒绝发生在业务写之前还是之后，答案全在
 * {@link WorkingTreeCaptureRuntime} 里，而它此前在本包**一条分支都没有被执行过**：唯一真跑它的
 * 是适配器一致性套件，跑在六个适配器包里。于是改坏这里的任何一条分支，`nx test rxdb` 照样全绿，
 * 红要等六个下游包各自跑起来才出现，而六份红指向的是同一行。
 *
 * 为什么这几组断言值得写：
 *
 * 1. **水位线的位置决定捕获到谁。** 读在 `fun` 之前、增量读在 `fun` 之后，中间那一段才是本次事务的
 *    产物。读晚一步（`fun` 之后才取水位线）会让本次写一条都捕获不到；读成「全表」则会把先前
 *    留下的历史变更一并记成这次的改动。两种错法都不抛错、不报警，只是 `status()` 从此不准。
 *    所以用例在调用前先埋一条旧变更，断言它**没有**进工作树。
 * 2. **挂载点 1 无声明时是 `crud`，挂载点 2 / 3 无声明时是拒绝。** 这条不对称是有意的：
 *    `transaction()` 是所有业务写的正常通道，对它 fail-closed 等于把整个库变成只读；而
 *    `mergeChanges` / `switchBranch` 是批量重写业务投影，放行未登记的调用就等于给绕过捕获留门。
 *    把两者统一成任何一边，都会有一半的行为悄悄反转。
 * 3. **挂载点 2 / 3 的捕获源是 `actions`，不是变更日志。** 这两个原语带 `disableTriggers`，为真时
 *    压根不写 `rxdb_change`，而 FR-046 要求此时**仍然**产生 `origin='remote_sync'` 的单元。
 *    照抄挂载点 1 的「读增量」实现能编译、能跑、在 `disableTriggers` 为假的用例里还全绿——
 *    只有显式传 `true` 的用例能把它分辨出来。
 * 4. **拒绝必须在 `next()` 之前。** 挂载点 3 未登记时一行业务数据都不许改，挂载点 4 则要在
 *    Observable 存在之前同步抛（adapter-contract.md §1.1）。两处都断言 `next` 的调用次数为 0——
 *    只断言「抛了正确的错误」的话，一个「先写再抛」的实现完全能通过。
 * 5. **整批共享一个 `unitId`。** 一次写原语是一个原子边界；每行各发一个 id 会让提交之后的历史
 *    把一次业务操作拆成 N 条，而这在单实体的用例里永远看不出来。
 * 6. **不捕获就不递增 revision。** `workingTreeRevision` 是提交的 CAS 依据：系统表写入、
 *    缓存表写入、物化重写各自都要让它纹丝不动，否则另一个 Tab 手上的 revision 会因为别人刷了一次
 *    缓存而凭空作废。
 *
 * 真实 SQL 与真实事务的原子性由 `workingTreeCommitConformanceSuite` 在六个后端上验证；
 * 这里的 executor 是替身，钉死的是**顺序、来源与副作用范围**——判定自己的责任边界。
 */

import type {
  EntityManager,
  EntityMetadata,
  EntityType,
  IRxDBChange,
  MergeChangesNext,
  RawWritePrimitives,
  SwitchBranchOptions,
  SwitchVersionActions,
  SwitchVersionChange,
  SyncOptions,
  TransactionFun,
  WorkingTreeCaptureMountTarget,
  WorkingTreeWriteHost
} from '@aiao/rxdb';
import {
  ACTIVE_BRANCH_KEY,
  declareTrustedWrite,
  Entity,
  EntityBase,
  getEntityMetadata,
  getRxDBChangeKey,
  PropertyType,
  RxDB,
  RxDBBranch,
  RxDBChange,
  RxDBError,
  SKIP_BRANCH_SWITCH_PREPARE,
  SyncType,
  TrustedWriteIntent
} from '@aiao/rxdb';
import { EMPTY, type Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { createWorkingTreeCaptureRuntime, WorkingTreeCaptureRuntime } from '../../working-tree/capture-hook.js';
import { buildVersionedDomain } from '../../working-tree/versioned-domain.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { WorkingTreeWriteRejectedError } from '../../working-tree/write-entry-matrix.js';
import { createCommitGraphProbe, type CommitGraphProbe } from '../commit/fixtures/commit-graph-probe.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

const BRANCH_ID = 'branch-main';

/** 只为拿一个真的 {@link EntityManager}——单元行要靠它 `instantiate()` 出来。 */
function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-capture-runtime-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  // 十张系统表由插件贡献，必须赶在 `init()` 之前 `use()`：晚了核心会当场拒绝，
  // 而这些实体进不了 `config.entities` 时 `instantiate()` 抛的是「need init rxdb」。
  database.use(rxDBPluginWorkingTree);
  database.init();
  return database.entityManager;
}

const entityManager = createEntityManager();

/**
 * 本次布景认的版本化域
 *
 * @remarks
 * `Post` 是普通版本化实体，`ProductCache` 是 QueryCache——两者一起才能分辨
 * `targetClassOf` 真的问了域，还是把「不是系统表就是版本化表」写死了。
 *
 * 命名空间与 {@link CaptureScene.appendChange} 播的变更行一致（都是 `app`）。真机上
 * `rxdb_change.namespace` 就是从实体元数据写下去的，而域也是从同一份元数据建的——两边
 * 对不上的布景等于在测一个生产里不存在的形态，还会把命名空间限定的判定测成永远不命中。
 */
const DOMAIN = buildVersionedDomain([
  { entityName: 'Post', namespace: 'app', physicalTableNames: ['post'], syncType: SyncType.Full },
  { entityName: 'ProductCache', namespace: 'app', physicalTableNames: ['productcache'], syncType: SyncType.QueryCache }
]);

/** 一条 `rxdb_change` 行的可变部分；其余列捕获用不上。 */
interface ChangeSeed {
  readonly id: number;
  readonly type?: 'INSERT' | 'UPDATE' | 'DELETE';
  readonly namespace?: string;
  readonly entity?: string;
  readonly entityId?: string;
  readonly patch?: Record<string, unknown> | null;
  readonly inversePatch?: Record<string, unknown> | null;
}

/** 一套布景：探针、运行时、宿主，以及往变更日志里追加行的手。 */
interface CaptureScene {
  readonly probe: CommitGraphProbe;
  readonly runtime: WorkingTreeCaptureRuntime;
  /** 适配器级宿主；`runInTransaction` 交出的就是探针那一个 executor */
  readonly host: WorkingTreeWriteHost;
  /** 事务 executor 的门面；挂载点 2 的 `next` 必须收到**它**而不是适配器 */
  readonly facade: WorkingTreeWriteHost;
  /** 可当作 `declareTrustedWrite` 作用域键、同时充当未拦截五原语的安装宿主替身 */
  readonly target: WorkingTreeCaptureMountTarget & RawWritePrimitives;
  /** 模拟触发器：往 `rxdb_change` 追加一行 */
  appendChange(seed: ChangeSeed): void;
  entries(): WorkingTreeEntry[];
  workingTreeRevision(): number;
}

/**
 * 一个五原语齐全的安装宿主替身
 *
 * @remarks
 * 它在用例里只承担两件事：`declareTrustedWrite` 的 WeakMap 键，以及 `bindMountTarget` 的
 * 第二个入参（未拦截的五原语）。原语体一律空转——运行时**不该**经它们发写，真发了的话
 * 断言里那些「一行都没改」会因为别处的副作用而红，而不是这里悄悄替它补上。
 */
function createMountTarget(host: WorkingTreeWriteHost): WorkingTreeCaptureMountTarget & RawWritePrimitives {
  return {
    runInTransaction: host.runInTransaction,
    transaction: async () => undefined,
    mergeChanges: async () => undefined,
    switchBranch: async () => undefined,
    upsertMany: () => EMPTY,
    deleteByIds: () => EMPTY
  } as unknown as WorkingTreeCaptureMountTarget & RawWritePrimitives;
}

/**
 * 造一套布景
 *
 * @param newUnitId - 单元 id 生成器；默认发同一个值，便于断言「整批共享」
 */
function scene(newUnitId: () => string = () => 'unit-fixed'): CaptureScene {
  const probe = createCommitGraphProbe();
  probe.seed(RxDBBranch, [
    { id: BRANCH_ID, local: true, remote: false, activated: true, activeKey: ACTIVE_BRANCH_KEY }
  ]);
  probe.seed(WorkingTreeActivationState, [
    { id: WORKING_TREE_ACTIVATION_STATE_ID, activationRevision: 3, branchGenerationSeq: 1 }
  ]);
  probe.seed(WorkingTreeState, [
    {
      id: BRANCH_ID,
      branchId: BRANCH_ID,
      baseHeadCommitId: null,
      workingTreeRevision: 0,
      entryCount: 0,
      updatedAt: new Date()
    }
  ]);

  const host: WorkingTreeWriteHost = {
    runInTransaction: (async (fun: TransactionFun) => fun(probe.executor)) as WorkingTreeWriteHost['runInTransaction']
  };
  // `executorHostOf()` 结构化地问 executor 要 `adapter`；给它一个**可辨识的**对象，
  // 这样「业务写发到了本事务的门面上」才有断言形态，而不是只能看它没挂起。
  const facade: WorkingTreeWriteHost = { runInTransaction: host.runInTransaction };
  Object.assign(probe.executor, { adapter: facade });

  return {
    probe,
    host,
    facade,
    target: createMountTarget(host),
    runtime: new WorkingTreeCaptureRuntime({
      entityManager,
      domain: DOMAIN,
      systemEntityNames: new Set(['RxDBChange', 'RxDBBranch', 'RxDBSync']),
      systemEntityIdentities: new Set(['rxdb:RxDBChange', 'rxdb:RxDBBranch', 'rxdb:RxDBSync']),
      newUnitId
    }),
    appendChange(seed) {
      probe.seed(RxDBChange, [
        {
          type: 'UPDATE',
          namespace: 'app',
          entity: 'Post',
          entityId: 'p1',
          patch: { title: '改过' },
          inversePatch: { title: '原值' },
          transactionId: 'tx-1',
          ...seed
        }
      ]);
    },
    entries() {
      return probe.rowsOf(WorkingTreeEntry) as WorkingTreeEntry[];
    },
    workingTreeRevision() {
      return (probe.rowsOf(WorkingTreeState)[0] as WorkingTreeState).workingTreeRevision;
    }
  };
}

/** 把探针 executor 原样交给 `fun`——挂载点 1 的 `next` 只需要做这一件事。 */
const transactionNext = (
  probe: CommitGraphProbe,
  seen: { transactionLog?: boolean }
): RawWritePrimitives['transaction'] =>
  (async (fun: TransactionFun, transactionLog?: boolean) => {
    seen.transactionLog = transactionLog;
    return fun(probe.executor);
  }) as RawWritePrimitives['transaction'];

/**
 * 挂载点 2 / 3 自己开事务时，宿主与写原语各自看到的那个事务体
 *
 * @remarks
 * 默认布景的 `host.runInTransaction` 把探针 executor 直接交给回调，于是「捕获自己开的事务会不会
 * 再落回挂载点 1」这条命题在替身上根本不会发生。真链路有两跳：`RxDBAdapter.runInTransaction()`
 * 转调 `this.transaction()`，而安装层把 `transaction` 改写在**实例**上——第二跳就是挂载点 1。
 * 少了这个替身，双重捕获在本包一条用例都碰不到，红要等六个适配器的一致性套件才出现。
 */
interface CapturingHost {
  /** 像真适配器那样把 `runInTransaction` 转调被拦截的 `transaction` */
  readonly host: WorkingTreeWriteHost;

  /** 运行时交给 `runInTransaction()` 的事务体 */
  readonly submitted: TransactionFun[];

  /** 最终到达写原语的事务体；被挂载点 1 接管过就不是同一个函数 */
  readonly delivered: TransactionFun[];
}

function capturingHostOf(stage: CaptureScene): CapturingHost {
  const submitted: TransactionFun[] = [];
  const delivered: TransactionFun[] = [];
  const next: RawWritePrimitives['transaction'] = (async (fun: TransactionFun) => {
    delivered.push(fun);
    return fun(stage.probe.executor);
  }) as RawWritePrimitives['transaction'];
  const host: WorkingTreeWriteHost = {
    runInTransaction: (async (fun: TransactionFun, transactionLog?: boolean) => {
      submitted.push(fun);
      return stage.runtime.interceptTransaction(host, next, fun, transactionLog);
    }) as WorkingTreeWriteHost['runInTransaction']
  };
  return { host, submitted, delivered };
}

const actionsOf = (
  init: Partial<Record<'inserts' | 'updates' | 'deletes', readonly (readonly [string, SwitchVersionChange])[]>> = {}
): SwitchVersionActions =>
  ({
    inserts: new Map(init.inserts ?? []),
    updates: new Map(init.updates ?? []),
    deletes: new Map(init.deletes ?? [])
  }) as unknown as SwitchVersionActions;

/** 一条「把 Post#p1 的标题改掉」的 action。 */
const titleChange = (): SwitchVersionChange =>
  ({ patch: { title: '远端的标题' }, inversePatch: { title: '原值' } }) as unknown as SwitchVersionChange;

/**
 * 生产形态的 action 键
 *
 * @remarks
 * 本文件别处的键是 `'app:Post:p1'` 这种手写裸 id，读起来直观，但它在**这一条**命题上是个陷阱：
 * 真键的第三段是 `getRxDBChangeKey()` 拼的 `rxid1:<hex>` 身份键，自带冒号。按冒号切第三片的
 * 实现对裸 id 恰好答对，对真键则永远交出字面量 `'rxid1'`。所以要证「拆键拆对了」只能用它。
 */
const productionKeyOf = (namespace: string, entity: string, entityId: string): string =>
  getRxDBChangeKey({ namespace, entity, entityId } as IRxDBChange);

/** 登记表 #7：事务内的远端拉取；入口 `remote_entity_apply`，来源 `remote_sync`。 */
const PULL_BATCH = {
  file: 'pull-batch.ts',
  symbol: 'pullBatchOnce',
  intent: TrustedWriteIntent.remote_sync
} as const;

/** 登记表 #6：`merge_branch` 的 normal 策略；外层事务里逐条调 `executor.mergeChanges`。 */
const MERGE_PER_CHANGE = {
  file: 'merge-branch.ts',
  symbol: 'merge_branch',
  intent: TrustedWriteIntent.merge_per_change
} as const;

describe('挂载点 1：transaction —— 事务增量即捕获源', () => {
  it('捕获的只有水位线之后的变更，先前留下的历史不算这次的改动', async () => {
    const stage = scene();
    // 上一次会话留下的一条；它**不能**被这次事务认领。水位线读晚一步或读成全表，这里就红。
    stage.appendChange({ id: 1, entityId: 'p0' });
    const seen: { transactionLog?: boolean } = {};

    await stage.runtime.interceptTransaction(stage.host, transactionNext(stage.probe, seen), async () => {
      stage.appendChange({ id: 2, entityId: 'p1' });
    });

    expect(stage.entries().map(entry => entry.entityId)).toEqual(['p1']);
  });

  it('事务体的返回值与 transactionLog 原样透传', async () => {
    const stage = scene();
    const seen: { transactionLog?: boolean } = {};

    const value = await stage.runtime.interceptTransaction(
      stage.host,
      transactionNext(stage.probe, seen),
      async () => 'business-result',
      false
    );

    expect(value).toBe('business-result');
    expect(seen.transactionLog).toBe(false);
  });

  it('没有受信声明时入口按 crud 处理，单元落成 origin=local 并推一次 revision', async () => {
    const stage = scene();
    const seen: { transactionLog?: boolean } = {};

    await stage.runtime.interceptTransaction(stage.host, transactionNext(stage.probe, seen), async () => {
      stage.appendChange({ id: 1 });
    });

    const [entry] = stage.entries();
    expect(entry.origin).toBe('local');
    expect(entry.operation).toBe('update');
    expect(stage.workingTreeRevision()).toBe(1);
  });

  it('事务体内声明了受信意图时按声明的入口判定，origin 跟着变', async () => {
    const stage = scene();
    const seen: { transactionLog?: boolean } = {};

    await stage.runtime.interceptTransaction(stage.host, transactionNext(stage.probe, seen), async executor => {
      // 声明挂在 executor 上，因为这是一次**事务内**的写。
      declareTrustedWrite(executor, PULL_BATCH);
      stage.appendChange({ id: 1 });
    });

    expect(stage.entries()[0]?.origin).toBe('remote_sync');
  });

  it('整个事务的多条写共享同一个 unitId', async () => {
    let serial = 0;
    const stage = scene(() => `unit-${(serial += 1)}`);
    const seen: { transactionLog?: boolean } = {};

    await stage.runtime.interceptTransaction(stage.host, transactionNext(stage.probe, seen), async () => {
      stage.appendChange({ id: 1, entityId: 'p1' });
      stage.appendChange({ id: 2, entityId: 'p2' });
    });

    expect(stage.entries().map(entry => entry.unitId)).toEqual(['unit-1', 'unit-1']);
  });

  it('系统表与缓存表的写既不落单元也不推 revision', async () => {
    const stage = scene();
    const seen: { transactionLog?: boolean } = {};

    await stage.runtime.interceptTransaction(stage.host, transactionNext(stage.probe, seen), async () => {
      stage.appendChange({ id: 1, namespace: 'rxdb', entity: 'RxDBSync', entityId: 's1' });
      stage.appendChange({ id: 2, entity: 'ProductCache', entityId: 'c1' });
    });

    expect(stage.entries()).toHaveLength(0);
    // 递增了的话，另一个 Tab 手上的 CAS 依据会因为库自己刷了一次缓存而作废。
    expect(stage.workingTreeRevision()).toBe(0);
  });

  it('INSERT 的整行写照样是净变化，patch 缺失时按 whole_row 判', async () => {
    const stage = scene();
    const seen: { transactionLog?: boolean } = {};

    await stage.runtime.interceptTransaction(stage.host, transactionNext(stage.probe, seen), async () => {
      stage.appendChange({ id: 1, type: 'INSERT', patch: null, inversePatch: null });
    });

    expect(stage.entries()[0]?.operation).toBe('insert');
  });

  it('只改 untracked 簿记字段的 UPDATE 不构成净变化', async () => {
    const stage = scene();
    const seen: { transactionLog?: boolean } = {};

    await stage.runtime.interceptTransaction(stage.host, transactionNext(stage.probe, seen), async () => {
      stage.appendChange({ id: 1, patch: { remoteId: 9 }, inversePatch: { remoteId: null } });
    });

    expect(stage.entries()).toHaveLength(0);
    expect(stage.workingTreeRevision()).toBe(0);
  });
});

describe('挂载点 2：本地 mergeChanges —— 捕获源是 actions', () => {
  it('未声明受信意图时拒绝，且业务写一次都没发生', async () => {
    const stage = scene();
    let calls = 0;
    const next: MergeChangesNext = async () => {
      calls += 1;
      return undefined;
    };

    await expect(
      stage.runtime.interceptMergeChanges(stage.host, next, actionsOf({ updates: [['app:Post:p1', titleChange()]] }))
    ).rejects.toBeInstanceOf(WorkingTreeWriteRejectedError);
    expect(calls).toBe(0);
  });

  it('disableTriggers 为真、变更日志一行都没写，单元照样产生', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    declareTrustedWrite(stage.target, PULL_BATCH);

    const result = await stage.runtime.interceptMergeChanges(
      stage.host,
      async () => 1,
      actionsOf({ updates: [['app:Post:p1', titleChange()]] }),
      undefined,
      true
    );

    expect(result).toBe(1);
    // 变更日志全程是空的：照抄挂载点 1 的「读增量」实现在这里拿到 0 条。
    expect(stage.probe.rowsOf(RxDBChange)).toHaveLength(0);
    expect(stage.entries().map(entry => entry.origin)).toEqual(['remote_sync']);
  });

  it('业务写被发到本事务 executor 的门面上，不是适配器自己', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    declareTrustedWrite(stage.target, PULL_BATCH);
    const seenHosts: WorkingTreeWriteHost[] = [];

    await stage.runtime.interceptMergeChanges(
      stage.host,
      async host => {
        seenHosts.push(host);
        return undefined;
      },
      actionsOf({ inserts: [['app:Post:p9', titleChange()]] })
    );

    // 绑到真实适配器的话，事务内的 mergeChanges 会去排队等自己正占着的槽位——永久挂起而不是报错。
    expect(seenHosts).toEqual([stage.facade]);
  });

  it('executor 交不出 adapter 门面时直接抛，不退回真实适配器', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    declareTrustedWrite(stage.target, PULL_BATCH);
    Object.assign(stage.probe.executor, { adapter: undefined });

    await expect(stage.runtime.interceptMergeChanges(stage.host, async () => undefined, actionsOf())).rejects.toThrow(
      /没有暴露 adapter 门面/
    );
  });

  it('三张 action 表按 insert / update / delete 全部展开', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    declareTrustedWrite(stage.target, PULL_BATCH);

    await stage.runtime.interceptMergeChanges(
      stage.host,
      async () => undefined,
      actionsOf({
        inserts: [['app:Post:p1', titleChange()]],
        updates: [['app:Post:p2', titleChange()]],
        deletes: [['app:Post:p3', { patch: null, inversePatch: { title: '原值' } } as unknown as SwitchVersionChange]]
      })
    );

    expect(stage.entries().map(entry => [entry.entityId, entry.operation])).toEqual([
      ['p1', 'insert'],
      ['p2', 'update'],
      ['p3', 'delete']
    ]);
  });

  it('身份键形态的 action 键拆出实体自己的 id，而不是身份键的类型前缀', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    declareTrustedWrite(stage.target, PULL_BATCH);

    await stage.runtime.interceptMergeChanges(
      stage.host,
      async () => undefined,
      actionsOf({ updates: [[productionKeyOf('app', 'Post', 'p1'), titleChange()]] })
    );

    // 拆错的症状不是报错：所有单元的 `entityId` 会一起塌成 `'rxid1'`，于是折叠的唯一约束
    // `(branch, namespace, entity, entityId)` 把整批远端写折成一条，discard 与冷重放跟着一起错位。
    expect(stage.entries().map(entry => entry.entityId)).toEqual(['p1']);
  });

  it('自己开的那个事务不落回挂载点 1：同一批远端写只被捕获一次', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    declareTrustedWrite(stage.target, PULL_BATCH);

    await stage.runtime.interceptMergeChanges(
      capturingHostOf(stage).host,
      async () => {
        // `disableTriggers` 为假，触发器照常把这批写记进变更日志——挂载点 1 的增量读看得见它。
        stage.appendChange({ id: 1, entityId: 'p1' });
        return undefined;
      },
      actionsOf({ updates: [['app:Post:p1', titleChange()]] })
    );

    // 捕获两遍既不报错也不多出一行：第二遍按 `crud` 判，折叠到同一条上。症状是一次远端同步
    // 被改写成用户的本地编辑（`origin` 翻成 `local`，discard 会把它当自己的编辑退掉），
    // 外加 revision 凭空多推一格——而它是 commit 的 CAS 依据，另一个 Tab 手里的那个当场作废。
    expect(stage.entries().map(entry => entry.origin)).toEqual(['remote_sync']);
    expect(stage.workingTreeRevision()).toBe(1);
  });

  it('外层事务里发起的 mergeChanges：外层的增量读不再把同一批写算第二遍', async () => {
    // `merge_branch` 的 normal 策略正是这个形状：`adapter.transaction()` 包住整个循环
    // （挂载点 1），循环体里逐条调 `executor.mergeChanges`（挂载点 2）。上一条用例覆盖的是
    // 挂载点 2 **自己开**事务的形态，靠事务体上的标躲开挂载点 1；而这里挂载点 1 先到，
    // 标躲不掉——它的增量读在 `fun` 之后发生，看见的正是 `mergeChanges` 刚写下的那些变更行。
    let units = 0;
    const stage = scene(() => `unit-${(units += 1)}`);
    stage.runtime.bindMountTarget(stage.target);

    const seen: { transactionLog?: boolean } = {};
    await stage.runtime.interceptTransaction(stage.host, transactionNext(stage.probe, seen), async executor => {
      declareTrustedWrite(executor, MERGE_PER_CHANGE);
      await stage.runtime.interceptMergeChanges(
        stage.facade,
        async () => {
          // `disableTriggers` 为假：触发器照常记一行，这行落在外层水位线之后。
          stage.appendChange({ id: 1, entityId: 'p1' });
          return undefined;
        },
        actionsOf({ updates: [['app:Post:p1', titleChange()]] })
      );
    });

    // 捕获两遍不报错也不多出一行：唯一约束把它折到同一条上，只是单元 id 被改写成外层那次的。
    // 症状有两个，都不在合并当场发作：一次合并的 N 条变更被拆进 N+1 个单元（历史里一次业务
    // 操作从此对不上号），以及 `workingTreeRevision` 一条变更推两格——而它是提交的 CAS 依据，
    // 另一个 Tab 手里的那个当场作废。
    expect(stage.entries().map(entry => entry.unitId)).toEqual(['unit-1']);
    expect(stage.workingTreeRevision()).toBe(1);
  });

  it('排除的是被认领过的那几行，不是整段水位线——合并之前的业务写照旧进工作树', async () => {
    // 这一条钉的是修法本身。把「已认领」实现成抬高外层水位线同样能让上一条用例转绿，代价是
    // 同一个外层事务里**早于**合并的业务写 id 更小，会被一并抹掉——用户刚改的那一笔悄悄不进
    // 工作树，既不报错也没有日志，要等 discard 或提交时才发现少了东西。
    let units = 0;
    const stage = scene(() => `unit-${(units += 1)}`);
    stage.runtime.bindMountTarget(stage.target);

    const seen: { transactionLog?: boolean } = {};
    await stage.runtime.interceptTransaction(stage.host, transactionNext(stage.probe, seen), async executor => {
      stage.appendChange({ id: 1, entityId: 'p0' });
      declareTrustedWrite(executor, MERGE_PER_CHANGE);
      await stage.runtime.interceptMergeChanges(
        stage.facade,
        async () => {
          stage.appendChange({ id: 2, entityId: 'p1' });
          return undefined;
        },
        actionsOf({ updates: [['app:Post:p1', titleChange()]] })
      );
    });

    expect(stage.entries().map(entry => [entry.entityId, entry.unitId])).toEqual([
      ['p1', 'unit-1'],
      ['p0', 'unit-2']
    ]);
  });
});

describe('挂载点 3：switchBranch —— 拒绝在 next() 之前', () => {
  const options = (): SwitchBranchOptions => ({
    branchId: BRANCH_ID,
    actions: actionsOf({ updates: [['app:Post:p1', titleChange()]] }),
    // 本组测的是捕获运行时的拒绝顺序，`next()` 都是替身、根本不解析分支，
    // 更不会走到前置校验；豁免在这里是「确实没有」，不是漏传。
    prepare: SKIP_BRANCH_SWITCH_PREPARE
  });

  it('从未 bindMountTarget 时没有作用域可查，一律拒绝', async () => {
    const stage = scene();
    let calls = 0;

    await expect(
      stage.runtime.interceptSwitchBranch(
        stage.host,
        async () => {
          calls += 1;
        },
        options()
      )
    ).rejects.toBeInstanceOf(WorkingTreeWriteRejectedError);
    expect(calls).toBe(0);
  });

  it('绑了宿主但没声明意图时同样拒绝，业务分支一行都没切', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    let calls = 0;

    await expect(
      stage.runtime.interceptSwitchBranch(
        stage.host,
        async () => {
          calls += 1;
        },
        options()
      )
    ).rejects.toBeInstanceOf(WorkingTreeWriteRejectedError);
    expect(calls).toBe(0);
  });

  it('undo/redo 声明 ⇒ 切完之后在后继事务里落成 origin=local 的单元', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    // 登记表 #4：`undo-redo-apply.ts·applyUndoRedoHistories·undo_redo` → `domain_recompute`。
    declareTrustedWrite(stage.target, {
      file: 'undo-redo-apply.ts',
      symbol: 'applyUndoRedoHistories',
      intent: TrustedWriteIntent.undo_redo
    });
    const order: string[] = [];

    await stage.runtime.interceptSwitchBranch(
      stage.host,
      async () => {
        order.push('switch');
      },
      options()
    );

    expect(order).toEqual(['switch']);
    expect(stage.entries().map(entry => entry.origin)).toEqual(['local']);
  });

  it('分支物化声明 ⇒ 照常切，但不产生任何单元、不推 revision', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    // 登记表 #1：`VersionManager.ts·switchBranch·branch_materialization` → `projection_rewrite`。
    // 判成 reject 的话，切分支这件事本身会失败。
    declareTrustedWrite(stage.target, {
      file: 'VersionManager.ts',
      symbol: 'switchBranch',
      intent: TrustedWriteIntent.branch_materialization
    });

    await stage.runtime.interceptSwitchBranch(stage.host, async () => undefined, options());

    expect(stage.entries()).toHaveLength(0);
    expect(stage.workingTreeRevision()).toBe(0);
  });

  it('声明取用即清除：同一份声明不会被下一次未声明的调用继承', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    declareTrustedWrite(stage.target, {
      file: 'VersionManager.ts',
      symbol: 'switchBranch',
      intent: TrustedWriteIntent.branch_materialization
    });

    await stage.runtime.interceptSwitchBranch(stage.host, async () => undefined, options());

    await expect(
      stage.runtime.interceptSwitchBranch(stage.host, async () => undefined, options())
    ).rejects.toBeInstanceOf(WorkingTreeWriteRejectedError);
  });

  it('后继的捕获事务同样不落回挂载点 1：事务体原样交给写原语', async () => {
    const stage = scene();
    stage.runtime.bindMountTarget(stage.target);
    declareTrustedWrite(stage.target, {
      file: 'undo-redo-apply.ts',
      symbol: 'applyUndoRedoHistories',
      intent: TrustedWriteIntent.undo_redo
    });
    const capturing = capturingHostOf(stage);

    await stage.runtime.interceptSwitchBranch(capturing.host, async () => undefined, options());

    // 这个挂载点的重复捕获在探针上没有产物：捕获自己写的是系统表，而矩阵把 `system` 目标直接
    // 短路成 no-capture。可观测的只有「事务体有没有被再包一层」——那正是命题本身，挂载点 1
    // 判到标就 `next(fun, transactionLog)` 原样放行，一次水位线都不读。
    expect(capturing.submitted).toHaveLength(1);
    expect(capturing.delivered[0]).toBe(capturing.submitted[0]);
  });
});

describe('挂载点 4：upsertMany / deleteByIds 的门禁', () => {
  const passthrough = (): Observable<void> => EMPTY;

  it('写版本化业务实体时同步抛，调用方手里没有 Observable 可订阅', () => {
    const stage = scene();
    let calls = 0;
    const next = (): Observable<void> => {
      calls += 1;
      return passthrough();
    };

    expect(() => stage.runtime.interceptBulkWrite(stage.host, next, 'Post', 'upsert_many')).toThrow(
      WorkingTreeWriteRejectedError
    );
    expect(calls).toBe(0);
  });

  it('deleteByIds 走同一条判定，拒绝信息点的是它自己的方法名', () => {
    const stage = scene();

    expect(() => stage.runtime.interceptBulkWrite(stage.host, passthrough, 'Post', 'delete_by_ids')).toThrow(
      /deleteByIds\(\)/
    );
  });

  it('QueryCache 实体放行，返回的就是写原语那一个 Observable 实例', () => {
    const stage = scene();
    const sentinel = passthrough();

    expect(stage.runtime.interceptBulkWrite(stage.host, () => sentinel, 'ProductCache', 'upsert_many')).toBe(sentinel);
  });

  it('系统实体名放行——只有实体名的场合回落到系统实体名集合', () => {
    const stage = scene();
    const sentinel = passthrough();

    expect(stage.runtime.interceptBulkWrite(stage.host, () => sentinel, 'RxDBChange', 'delete_by_ids')).toBe(sentinel);
  });
});

@Entity({
  name: 'CaptureRuntimePost',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class CaptureRuntimePost extends EntityBase {
  title!: string;
}

@Entity({
  name: 'CaptureRuntimeCache',
  sync: { type: SyncType.QueryCache, local: { adapter: 'local' }, remote: { adapter: 'remote' } },
  properties: [{ name: 'payload', type: PropertyType.string }]
})
class CaptureRuntimeCache extends EntityBase {
  payload!: string;
}

/**
 * 建域时的物理表名出处，形状与真适配器上的那个成员逐字相同。
 *
 * @remarks
 * 不折叠命名空间的后端（PGlite）交的就是这一份——逻辑名本身。
 */
const logicalOnlyAdapter = {
  physicalTableNames: (metadata: EntityMetadata): readonly string[] => [metadata.tableName]
};

/** 折叠命名空间的后端（SQLite 家族）交出来的形状：逻辑名 + `public$post`。 */
const namespaceFoldingAdapter = {
  physicalTableNames: (metadata: EntityMetadata): readonly string[] => [
    metadata.tableName,
    `${metadata.namespace}$${metadata.tableName}`
  ]
};

describe('createWorkingTreeCaptureRuntime —— 按实体登记造域', () => {
  const databaseSync: SyncOptions = { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } };

  it('实体自身的 sync 优先于库级：QueryCache 实体被判成 untracked，其余继承库级', () => {
    const runtime = createWorkingTreeCaptureRuntime(
      logicalOnlyAdapter,
      entityManager,
      [CaptureRuntimePost, CaptureRuntimeCache],
      databaseSync
    );

    // 「实体优先、否则继承库级」这条规则只有一份实现（`getEntitySync`）。在这里重写一遍
    // 就等于给「是不是 QueryCache」开第二个入口，而版本化域里唯一按 syncType 分叉的判断正是它。
    expect(runtime.domain.classifyEntity('CaptureRuntimePost')).not.toBe('untracked');
    expect(runtime.domain.classifyEntity('CaptureRuntimeCache')).toBe('untracked');
  });

  it('版本化表名来自适配器，不是 `metadata.tableName`', async () => {
    // SQLite 家族真正建出来的表叫 `public$captureruntimepost`，那也是它们**唯一**能用的表名。
    // 域自己按 `'$'` 重拼一份的话，拼法一改它不会报错，只会开始认不出这张表，
    // 于是 raw 门禁对一条绕过捕获的写静默放行。
    const folded = createWorkingTreeCaptureRuntime(
      namespaceFoldingAdapter,
      entityManager,
      [CaptureRuntimePost],
      databaseSync
    );
    const logical = createWorkingTreeCaptureRuntime(
      logicalOnlyAdapter,
      entityManager,
      [CaptureRuntimePost],
      databaseSync
    );
    const physical = `public$${getEntityMetadata(CaptureRuntimePost).tableName}`.toLowerCase();

    expect(folded.domain.versionedTables.has(physical)).toBe(true);
    // 对照组：不折叠的后端上，同一个名字**不该**在域里——多认一个名字在这里不是保守，
    // 而是让「某个后端到底叫什么」这件事重新变成域的猜测。
    expect(logical.domain.versionedTables.has(physical)).toBe(false);

    await expect(folded.gateRawWrite(`UPDATE "${physical}" SET title = 'x'`, () => 'executed')).rejects.toThrow();
  });

  it('解析不出生效的同步配置时抛，不按「不是 QueryCache」继续', () => {
    // 正常构造下走不到：`RxDBConfig.sync` 是必填的。真走到了说明配置形状已经不是这里以为的样子，
    // 此时静默按 Full 继续，只会把一张缓存表悄悄纳入版本化。
    expect(() =>
      createWorkingTreeCaptureRuntime(
        logicalOnlyAdapter,
        entityManager,
        [CaptureRuntimePost],
        undefined as unknown as SyncOptions
      )
    ).toThrow(RxDBError);
  });
});

/**
 * 一个**业务**实体，名字正好撞上 epic-006 的系统表 `rxdb:Commit`。
 *
 * @remarks
 * `Commit` / `WorkingTreeState` 这类名字在接入方的领域模型里完全合法——系统表把它们占住的是
 * `rxdb` 这个命名空间，不是这个词。按裸名判定的话，接入方一建 `public:Commit`，它的写就整批
 * 被判成 `system` 而**静默绕过捕获**：改动不进工作树、不进提交，且没有任何报错形态。
 */
@Entity({
  name: 'Commit',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class BusinessCommit extends EntityBase {
  title!: string;
}

describe('系统实体的判定域 —— 按身份而不是裸名，且不进版本化域', () => {
  const databaseSync: SyncOptions = { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } };

  it('业务实体撞上系统表名仍然是 versioned —— 带不带命名空间都一样', () => {
    const runtime = createWorkingTreeCaptureRuntime(logicalOnlyAdapter, entityManager, [BusinessCommit], databaseSync);

    expect(runtime.targetClassOf('Commit', 'public')).toBe('versioned');
    // 挂载点 4（`upsertMany` / `deleteByIds`）手上只有实体名。裸名这条路也必须先问域：
    // 域认得 `Commit` 就说明它是这个库登记过的业务实体，系统表名单根本轮不到。
    expect(runtime.targetClassOf('Commit')).toBe('versioned');
  });

  /** 实体类 → 域里那份归一化过的表名。 */
  const tableNameOf = (EntityType: EntityType): string => getEntityMetadata(EntityType).tableName.toLowerCase();

  it('系统实体被挡在版本化域外 —— 建域的实体数组里本来就有它们', () => {
    // `SchemaManager.init()` 已经把系统表塞进 `config.entities`，而运行时是从那个数组建域的。
    // 不摘出去的话，`rxdb_working_tree_entry` 这类表会落进 `versionedTables`，
    // 于是 raw 四步门禁把库自己的簿记写拦成第 3 步——与其余 4 个挂载点的判定正相反。
    const runtime = createWorkingTreeCaptureRuntime(
      logicalOnlyAdapter,
      entityManager,
      [CaptureRuntimePost, WorkingTreeEntry, WorkingTreeState],
      databaseSync
    );

    // 域把表名统一归一化成小写，所以问的时候也得按同一口径归一。
    expect(runtime.domain.versionedTables.has(tableNameOf(CaptureRuntimePost))).toBe(true);
    expect(runtime.domain.versionedTables.has(tableNameOf(WorkingTreeEntry))).toBe(false);
    expect(runtime.domain.versionedTables.has(tableNameOf(WorkingTreeState))).toBe(false);
  });

  it('raw 写系统表在第 4 步放行，不被第 3 步拦下', async () => {
    const runtime = createWorkingTreeCaptureRuntime(
      logicalOnlyAdapter,
      entityManager,
      [CaptureRuntimePost, WorkingTreeEntry],
      databaseSync
    );
    let calls = 0;

    await expect(
      runtime.gateRawWrite(`UPDATE ${getEntityMetadata(WorkingTreeEntry).tableName} SET "branchId" = 'b2'`, () => {
        calls += 1;
        return 'executed';
      })
    ).resolves.toBe('executed');
    expect(calls).toBe(1);
  });

  it('域不认得的名字才回落到系统身份，系统表照旧放行', () => {
    const runtime = createWorkingTreeCaptureRuntime(
      logicalOnlyAdapter,
      entityManager,
      [CaptureRuntimePost],
      databaseSync
    );

    expect(runtime.targetClassOf('WorkingTreeEntry')).toBe('system');
    expect(runtime.targetClassOf('WorkingTreeEntry', 'rxdb')).toBe('system');
    // 对照组：既不在域里、也不是系统表的名字默认 versioned（「没有第四类 untracked」）。
    expect(runtime.targetClassOf('NeverRegisteredEntity')).toBe('versioned');
  });
});
