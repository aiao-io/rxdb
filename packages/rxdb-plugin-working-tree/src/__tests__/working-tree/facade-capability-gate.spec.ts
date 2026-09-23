/**
 * @fileoverview T032 红测试：`RxDB.workingTree` 入口恒存在，未启用时每个成员以
 * `commit_capability_disabled` 拒绝（契约见 `contracts/core-api.md` §1）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/working-tree-facade.ts`。真实 SQL 与跨重启语义由
 * `workingTreeCommitConformanceSuite`（T042/T043）在六个后端上验证，这里只守形状与门禁。
 *
 * 为什么这几组断言值得写：
 *
 * 1. **「未启用」最容易被写成「入口不存在」**。`readonly workingTree?: WorkingTreeManager`
 *    是最省事的实现，代价是全部调用点长出 `?.`，而 `database.workingTree?.commit(msg)`
 *    在未启用的库上**静默求值为 `undefined`**——用户点了提交、什么也没发生、也没有错误。
 *    契约 §1 要的恰恰是相反的东西：入口恒在，调用即拒。
 * 2. **门禁最容易被写成「返回空结果」**。未启用时让 `status()` 返回 `entryCount: 0`
 *    看起来很像 FR-046 的「零行为差异」，其实是把「这个库没开这功能」伪装成
 *    「这个库没有未提交变更」。零行为差异说的是**不调用它就什么都没发生**，不是
 *    调用了要假装成功。
 * 3. **门禁会被逐个成员手抄**。抄到第四个成员时漏掉一个不会有任何编译错误，
 *    于是那一个成员在未启用的库上裸奔。所以这里不点名断言，而是**枚举原型上除
 *    `isEnabled` / `enable` 外的全部成员**：T078/T079/T080/T106 往门面上加的成员
 *    自动纳管，漏接门禁当场变红。
 * 4. **门禁的位置会排在参数校验之后**。枚举时一律**零参**调用：门禁必须先于
 *    参数校验发生，否则未启用的库会先告诉用户「message 不能为空」——一个在这个库上
 *    根本无从谈起的问题。
 * 5. **能力行缺失会被当成「未启用」**。两者的处置完全相反：未启用是用户还没
 *    `enable()`，能力行缺失是 `0004` 迁移建了表却没写入那一行（或它被删了）。
 *    后者按「未启用」继续，等于让一个损坏的库看起来只是没开功能。
 */

import type { TransactionExecutor } from '@aiao/rxdb';
import { RxDB, RXDB_CHANGE_CODEC_VERSION, RxDBBranch, RxDBChange, SyncType } from '@aiao/rxdb';
import { firstValueFrom, isObservable } from 'rxjs';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import {
  COMMIT_CAPABILITY_STATE_ID,
  COMMIT_GRAPH_SCHEMA_VERSION,
  COMMIT_PROTOCOL_VERSION,
  CommitCapabilityState
} from '../../commit/commit-capability-state.entity.js';
import type { CommitCapabilityInfo } from '../../commit/commit-capability.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { Commit } from '../../commit/commit.entity.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import {
  WorkingTreeCapabilityDisabledError,
  WorkingTreeManager,
  type WorkingTreeEnableIfEmptyResult
} from '../../working-tree/working-tree-facade.js';
import { createCommitGraphProbe } from '../commit/fixtures/commit-graph-probe.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

/** 门面上**不**受门禁管辖的三个成员，出处是 contracts/core-api.md §1 那一句。 */
const UNGATED_MEMBERS = ['isEnabled', 'enable', 'enableIfEmpty'] as const;

/**
 * 借门面自己的门禁跑一个探针命令。
 *
 * @remarks
 * 探针存在的理由是 T032 落地时门面上还**一个受管成员都没有**——`status()` 在 T078、
 * `diff()` 在 T079、`commit()` 在 T080、`restore()` 在 T106。没有探针的话，下面那条
 * 「全部成员都被拒」在今天是空转的，而空转的守卫等于没有守卫。
 *
 * 它走的是与后续阶段**完全相同**的那条路：`runEnabled()`。
 */
class ProbeWorkingTreeManager extends WorkingTreeManager {
  /** 门禁放行时返回执行器 id，用于证明命令体确实拿到了一个事务执行器。 */
  probe(): Promise<string> {
    return this.runEnabled(async (executor: TransactionExecutor) => executor.id);
  }
}

interface Scene {
  readonly database: RxDB;
  readonly adapter: MockLocalAdapter;
  readonly manager: ProbeWorkingTreeManager;
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
}

/**
 * 造一个「`0004` 建表迁移已经跑完」的场景。
 *
 * @param capability - `null` 表示 `0004` 迁移没写入能力行；否则按给定启用态建行
 *
 * @remarks
 * 除能力行外还塞了一条激活的本地分支与它的空 ref：`enable()` 在翻完能力位之后要在同一个
 * 事务里跑一次性启用迁移（`runEnableMigration`），而那一步以「库里有激活分支」为起点。
 * 只塞能力行的话，本文件全部用例都会先撞上「这个库没有激活分支」——一个与门禁无关的成因。
 *
 * 分支只塞**一条**：本文件测的是门禁，多分支下「为每个分支补根」的那些判据归
 * `enable-migration.spec.ts`，两处各测一遍只会让同一条实现有两个互不同步的判据。
 */
function createScene(capability: { enabled: boolean } | null): Scene {
  const database = new RxDB({
    dbName: `rxdb-working-tree-facade-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  const adapter = createMockAdapter(database);
  database.adapter('local', () => adapter);
  // `use()` 必须排在 `init()` 之前：带系统贡献的插件晚于 `init()` 注册会被核心当场拒掉
  // （贡献赶不上建表）。挂 `database.workingTree` 这件事本身发生在插件**构造器**里，
  // 于是这一行同时给下面「多次读取是同一个实例」那条用例备好了入口。
  database.use(rxDBPluginWorkingTree);
  database.init();

  // rowsAffected=1：`enable()` 这一支要能走到「CAS 命中」，否则 T031 会因为
  // 「命中 0 行但仍未启用」抛错，测的就不是门面了。
  const probe = createCommitGraphProbe({ rowsAffected: 1 });
  if (capability) {
    const row = database.entityManager.instantiate(CommitCapabilityState);
    row.id = COMMIT_CAPABILITY_STATE_ID;
    row.enabled = capability.enabled;
    row.protocolVersion = COMMIT_PROTOCOL_VERSION;
    row.schemaVersion = COMMIT_GRAPH_SCHEMA_VERSION;
    row.codecVersion = RXDB_CHANGE_CODEC_VERSION;
    row.enabledAt = capability.enabled ? new Date('2026-01-01T00:00:00.000Z') : null;
    probe.seed(CommitCapabilityState, [row]);
  }

  const branch = database.entityManager.instantiate(RxDBBranch);
  branch.id = 'main';
  branch.activated = true;
  branch.local = true;
  branch.remote = false;
  branch.parentId = null;
  branch.fromChangeId = null;
  probe.seed(RxDBBranch, [branch]);

  const ref = database.entityManager.instantiate(CommitBranchRef);
  ref.id = branch.id;
  ref.branchId = branch.id;
  ref.generation = 1;
  ref.headCommitId = null;
  ref.headRevision = 0;
  ref.status = 'ok';
  ref.corruptedAt = null;
  probe.seed(CommitBranchRef, [ref]);

  // 这个替身上没有捕获钩子（种子直接进探针，没走过 `connect()`）。已启用 + 无钩子
  // 在生产里只意味着漏掉了能力启用广播，于是 `runEnabled()` 提交后会自愈补装，而补装经
  // `define()` **覆写实例成员**——下面这个 spy 在第一次受管调用之后就不再是
  // `adapter.transaction` 本身了。要数开事务次数就得先取引用，包装会转发回它。
  adapter.transaction.mockImplementation(async fun => fun(probe.executor));

  return { database, adapter, manager: new ProbeWorkingTreeManager(database), probe };
}

/** 把「Promise 还是 Observable」这件事抹平，只留下「拒绝时带的是什么」。 */
async function rejectionOf(value: unknown): Promise<unknown> {
  const settled = isObservable(value) ? firstValueFrom(value) : Promise.resolve(value);
  return settled.then(
    resolved => {
      throw new Error(`expected rejection, resolved with ${JSON.stringify(resolved) ?? String(resolved)}`);
    },
    (caught: unknown) => caught
  );
}

describe('workingTree 入口恒存在（contracts/core-api.md §1）', () => {
  it('use() 之后、init() 之前就已经在，且不是 undefined', () => {
    const database = new RxDB({
      dbName: `rxdb-working-tree-entry-${Math.random().toString(36).slice(2)}`,
      entities: [],
      sync: { local: { adapter: 'local' }, type: SyncType.None }
    });
    // 抽包之后这条断言的起点从「构造之后」变成「`use()` 之后」，而契约没变：入口的存在与否
    // 仍是**构建期**属性（装没装本包、有没有 `use()` 这一行），不是连接纪元的函数。
    // 所以挂载留在插件**构造器**里——`use()` 同步求值插件工厂，入口当场就在；
    // 挪进 `install()` 就会变成「`init()` 之后才有」，那才是真的把它降级成纪元属性。
    database.use(rxDBPluginWorkingTree);

    // `readonly workingTree?: WorkingTreeManager` 的代价不是 `?.` 难看：
    // `database.workingTree?.commit(msg)` 在未启用的库上静默求值为 undefined，
    // 用户点了提交、什么也没发生、也没有错误。
    expect(database.workingTree).toBeInstanceOf(WorkingTreeManager);
  });

  it('多次读取是同一个实例——status$() 的订阅依赖稳定身份', () => {
    const { database } = createScene({ enabled: false });
    // getter 每次新建一个的话，两次 status$() 拿到的是两条互不相干的流，
    // 退订其中一条不会影响另一条，而面板正是靠这个身份做去重。
    expect(database.workingTree).toBe(database.workingTree);
  });
});

describe('未启用的库：isEnabled / enable 照常，其余一律拒绝', () => {
  it('isEnabled() 返回 false，不抛', async () => {
    const { manager } = createScene({ enabled: false });
    await expect(manager.isEnabled()).resolves.toBe(false);
  });

  it('enable() 在未启用的库上照常启用', async () => {
    const { manager } = createScene({ enabled: false });

    const info: CommitCapabilityInfo = await manager.enable();

    expect({ enabled: info.enabled, protocolVersion: info.protocolVersion }).toEqual({
      enabled: true,
      protocolVersion: COMMIT_PROTOCOL_VERSION
    });
  });

  it('受管成员被拒，而不是静默返回空结果', async () => {
    const { manager } = createScene({ enabled: false });

    const error = await rejectionOf(manager.probe());

    expect(error).toBeInstanceOf(WorkingTreeCapabilityDisabledError);
    expect(error).toBeInstanceOf(Error);
  });

  it('拒绝对象带 name 与 code 两个判别位', async () => {
    const { manager } = createScene({ enabled: false });

    const error = await rejectionOf(manager.probe());

    // code 跨 realm 判别（日志、上报、三框架绑定），name 在本进程内判别；
    // 只给一个的话，另一端的 catch 分支要么拿不到码，要么只能匹配错误文案。
    expect({
      name: (error as Error).name,
      code: (error as { code?: unknown }).code
    }).toEqual({
      name: 'WorkingTreeCapabilityDisabledError',
      code: CommitErrorCode.commit_capability_disabled
    });
  });

  it('启用之后同一个成员放行，并且拿到的是事务执行器', async () => {
    const { manager, adapter, probe } = createScene({ enabled: true });
    const openTransaction = adapter.transaction;

    await expect(manager.probe()).resolves.toBe(probe.executor.id);
    // 受管命令必须跑在写事务里：门禁读到的启用态与命令的写入必须同进同出，
    // 否则「读到已启用」和「写入」之间隔着一个别人可以 disable 的窗口。
    expect(openTransaction).toHaveBeenCalledTimes(1);
  });

  it('能力行缺失时抛的是迁移缺失，不是「未启用」', async () => {
    const { manager } = createScene(null);

    const error = await rejectionOf(manager.probe());

    // 「表建了但没有那一行」是损坏，不是关闭状态。按关闭处理等于让用户以为
    // 点一下 enable() 就好了，而 enable() 的 CAS 会打在一张空表上、命中 0 行。
    expect(error).not.toBeInstanceOf(WorkingTreeCapabilityDisabledError);
    expect((error as Error).message).toMatch(/0004-working-tree-commits/);
  });
});

describe('enableIfEmpty：空库自动启用，有内容的库一行不写', () => {
  // 结果形状钉成三种结局：调用方（demo 的启动装配）按 kind 决定是否要显示手动启用。
  // 多一种「半启用」的结局就多一条必须处理的状态路径。
  it('结果联合恰好三种结局', () => {
    expectTypeOf<WorkingTreeEnableIfEmptyResult>().toEqualTypeOf<
      | { readonly kind: 'enabled'; readonly capability: CommitCapabilityInfo }
      | { readonly kind: 'already_enabled'; readonly capability: CommitCapabilityInfo }
      | { readonly kind: 'not_empty' }
    >();
  });

  // 判据是 `rxdb_change` 有没有行：本地每一次实体写入都会追加一条变更（undo/redo 的数据源），
  // sync pull 走 disableTriggers 不产生行。行数为零 ⟺ 这个库从来没有过用户内容，
  // 此时启用把「当前库状态」折成 baseline 是免费的；有行时折 baseline 是一次
  // 语义决定（全部既有数据并成一个初始提交），必须留给用户显式点。
  it('空库 → enabled：翻能力位、写 baseline、装捕获', async () => {
    const { manager, adapter, probe } = createScene({ enabled: false });
    const installSpy = vi.spyOn(adapter, 'setWorkingTreeCaptureHook');

    const result = await manager.enableIfEmpty();

    expect(result.kind).toBe('enabled');
    expect(result.kind === 'enabled' ? result.capability.enabled : null).toBe(true);
    // 判空查的是 `rxdb_change` 全表行数，不是按实体收窄的某个子集——
    // 收窄之后「这个库只有 Todo」和「这个库没有内容」会混成同一个答案。
    expect(probe.finds).toContainEqual({ entity: 'RxDBChange', where: { combinator: 'and', rules: [] } });
    // 与 enable() 同一条启用迁移：给激活分支补上根节点，后续 commit 才有父可挂。
    expect(probe.rowsOf(Commit)).toHaveLength(1);
    expect(installSpy).toHaveBeenCalledTimes(1);
  });

  it('非空 → not_empty：能力位不动、一行不写、不装捕获', async () => {
    const { database, manager, adapter, probe } = createScene({ enabled: false });
    const change = database.entityManager.instantiate(RxDBChange);
    change.id = 1;
    change.namespace = 'app';
    change.entity = 'Todo';
    change.entityId = 'todo-1';
    change.type = 'INSERT';
    probe.seed(RxDBChange, [change]);
    const installSpy = vi.spyOn(adapter, 'setWorkingTreeCaptureHook');

    const result = await manager.enableIfEmpty();

    expect(result).toEqual({ kind: 'not_empty' });
    // 能力位仍是关的：自动启用跳过时，手动 enable() 面对的还是同一个起点。
    expect((probe.rowsOf(CommitCapabilityState)[0] as { enabled: boolean }).enabled).toBe(false);
    // 一条语句都不发：CAS 的 UPDATE 会记进 statements，baseline 的 INSERT 会记进 saved。
    expect(probe.statements).toEqual([]);
    expect(probe.saved).toEqual([]);
    expect(installSpy).not.toHaveBeenCalled();
  });

  it('已启用 → already_enabled：原样报告，不补迁移，照常补装捕获', async () => {
    const { manager, adapter, probe } = createScene({ enabled: true });
    const installSpy = vi.spyOn(adapter, 'setWorkingTreeCaptureHook');

    const result = await manager.enableIfEmpty();

    expect(result.kind).toBe('already_enabled');
    expect(result.kind === 'already_enabled' ? result.capability.enabled : null).toBe(true);
    // 「把库收敛到已启用该有的形状」是 enable() 的语义；自动启用只回答
    // 「要不要启用」，已启用的库原样报告、不动提交图。
    expect(probe.statements).toEqual([]);
    expect(probe.saved).toEqual([]);
    // 与 enable() 重复调用的行为一致：本进程的捕获运行时照常补装（幂等）。
    expect(installSpy).toHaveBeenCalledTimes(1);
  });
});

describe('门禁覆盖门面上的全部成员（后续阶段自动纳管）', () => {
  /** 原型上除构造器与两个豁免成员之外的全部方法名。 */
  const gatedMemberNames = (): string[] =>
    Object.getOwnPropertyNames(WorkingTreeManager.prototype).filter(
      name => name !== 'constructor' && !(UNGATED_MEMBERS as readonly string[]).includes(name)
    );

  it('豁免名单恰好是 isEnabled、enable 与 enableIfEmpty', () => {
    const own = new Set(Object.getOwnPropertyNames(WorkingTreeManager.prototype));
    // 名单长胖一格，就有一个成员永久绕过门禁。
    for (const name of UNGATED_MEMBERS) expect(own.has(name)).toBe(true);
    expect(UNGATED_MEMBERS).toHaveLength(3);
  });

  it('原型上没有非方法的自有属性——getter 绕不过门禁', () => {
    const nonMethods = Object.getOwnPropertyNames(WorkingTreeManager.prototype).filter(name => {
      const descriptor = Object.getOwnPropertyDescriptor(WorkingTreeManager.prototype, name);
      return typeof descriptor?.value !== 'function';
    });
    // `get status()` 这样的写法在调用点看不出区别，却压根没有可以插门禁的调用时机。
    expect(nonMethods).toEqual([]);
  });

  it('每个受管成员在未启用的库上都以 commit_capability_disabled 拒绝（零参调用）', async () => {
    const names = gatedMemberNames();
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const { manager } = createScene({ enabled: false });
      const method = Reflect.get(manager, name) as (this: unknown) => unknown;

      const error = await rejectionOf(method.call(manager));

      // 零参调用：门禁必须先于参数校验。否则未启用的库会先回答
      // 「message 不能为空」——一个在这个库上根本无从谈起的问题。
      expect((error as { code?: unknown }).code, `成员 ${name} 未接门禁`).toBe(
        CommitErrorCode.commit_capability_disabled
      );
    }
  });
});
