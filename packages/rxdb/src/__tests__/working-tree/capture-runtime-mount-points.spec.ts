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

import { EMPTY, type Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ACTIVE_BRANCH_KEY } from '../../commit/active-branch-guard.js';
import { EntityBase } from '../../entity/entity-base.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType } from '../../entity/property-types.interface.js';
import type { SyncOptions } from '../../entity/sync-options.interface.js';
import { SyncType } from '../../entity/sync-options.interface.js';
import type { SwitchBranchOptions, TransactionFun } from '../../rxdb-adapter.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import type { SwitchVersionActions, SwitchVersionChange } from '../../version/VersionManager.interface.js';
import { createWorkingTreeCaptureRuntime, WorkingTreeCaptureRuntime } from '../../working-tree/capture-hook.js';
import type {
  MergeChangesNext,
  RawWritePrimitives,
  WorkingTreeCaptureMountTarget,
  WorkingTreeWriteHost
} from '../../working-tree/capture-interceptor.js';
import { TrustedWriteIntent } from '../../working-tree/trusted-write-intent.js';
import { declareTrustedWrite } from '../../working-tree/trusted-write-scope.js';
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
 */
const DOMAIN = buildVersionedDomain([
  { entityName: 'Post', namespace: 'public', tableName: 'post', syncType: SyncType.Full },
  { entityName: 'ProductCache', namespace: 'public', tableName: 'productcache', syncType: SyncType.QueryCache }
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
      systemEntityNames: new Set(['RxDBChange', 'RxDBBranch']),
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

/** 登记表 #7：事务内的远端拉取；入口 `remote_entity_apply`，来源 `remote_sync`。 */
const PULL_BATCH = {
  file: 'pull-batch.ts',
  symbol: 'pullBatchOnce',
  intent: TrustedWriteIntent.remote_sync
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
});

describe('挂载点 3：switchBranch —— 拒绝在 next() 之前', () => {
  const options = (): SwitchBranchOptions => ({
    branchId: BRANCH_ID,
    actions: actionsOf({ updates: [['app:Post:p1', titleChange()]] })
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

describe('createWorkingTreeCaptureRuntime —— 按实体登记造域', () => {
  const databaseSync: SyncOptions = { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } };

  it('实体自身的 sync 优先于库级：QueryCache 实体被判成 untracked，其余继承库级', () => {
    const runtime = createWorkingTreeCaptureRuntime(
      entityManager,
      [CaptureRuntimePost, CaptureRuntimeCache],
      databaseSync
    );

    // 「实体优先、否则继承库级」这条规则只有一份实现（`getEntitySync`）。在这里重写一遍
    // 就等于给「是不是 QueryCache」开第二个入口，而版本化域里唯一按 syncType 分叉的判断正是它。
    expect(runtime.domain.classifyEntity('CaptureRuntimePost')).not.toBe('untracked');
    expect(runtime.domain.classifyEntity('CaptureRuntimeCache')).toBe('untracked');
  });

  it('解析不出生效的同步配置时抛，不按「不是 QueryCache」继续', () => {
    // 正常构造下走不到：`RxDBConfig.sync` 是必填的。真走到了说明配置形状已经不是这里以为的样子，
    // 此时静默按 Full 继续，只会把一张缓存表悄悄纳入版本化。
    expect(() =>
      createWorkingTreeCaptureRuntime(entityManager, [CaptureRuntimePost], undefined as unknown as SyncOptions)
    ).toThrow(RxDBError);
  });
});
