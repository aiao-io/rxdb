/**
 * @fileoverview 回归：两个真实适配器实例共享同一个持久库时，一端 `enable()` 能接通另一端的捕获
 *（顺延 1 / D-1，FR-037）。
 *
 * @remarks
 * 缺陷的形状是**沉默**：B 连接期读到「能力未启用」，于是一个钩子都不装（这正是 FR-046
 * 「零行为差异」要的形状）；随后 A 启用了能力，而 B 手里那份判断再也不会被重新问一次。
 * B 之后的每一次写都照常成功、照常落库，只是不产生任何工作树单元——直到用户在**任一端**
 * 调 `status()` / `commit()`，才发现那一批编辑根本不在待提交集里。没有异常、没有告警，
 * 两端的库还都是「正常」的。
 *
 * **为什么这条用例必须用两个真实适配器实例、且共享同一个持久库。** 另外两处断言分别在
 * `@aiao/rxdb` 的 `__tests__/gateway/capability-propagation.spec.ts`（网关把消息发出去、
 * 收进来、不回声）与 `@aiao/rxdb-plugin-working-tree` 的
 * `__tests__/system/capability-enabled-listener.spec.ts`（收到之后同步装钩子），两边都用替身。
 * 它们证得了通道的两端各自成立，证不了**接起来之后真的能捕获**：从「钩子对象挂上了」到
 * 「B 的下一次 INSERT 在共享库里留下一条单元」之间还隔着能力位、分支身份、系统表与
 * 工作树状态行——而这些全部住在库里，两个实例必须看的是**同一个**库，替身给不出这个条件。
 *
 * 后端选 wa-sqlite 的 `IDBBatchAtomicVFS` 不是偏好：v1 的六个后端里只有它支持**多个真实连接
 * 同时打开同一个持久库**（Web Locks + write_hint + BEGIN IMMEDIATE，见
 * `sqlite-client-multi-connection.spec.ts`）。PGlite 与 OPFS-AHP 都是单写者，第二个句柄开不出来，
 * 拿它们写这条用例只能退化成「两个各自独立的库」，而那恰好把本用例唯一要证的共享条件消掉。
 *
 * **还剩一道没关的窗口，不要从这份文件里读出它已经关了。** `BroadcastChannel` 的投递排在
 * 后续任务里，所以 A 的 `enable()` 返回、到 B 真正装上钩子之间必然有一段时间差；落在那段时间里
 * 的 B 侧写入仍然不留痕迹。彻底关掉它需要的是评审给的另一半方案——「拒绝旧连接继续写」，
 * 即每次写都同步复核能力位，而那与 FR-046 的零行为差异直接冲突。v1 取的是这一半，
 * 残留窗口记在 `specs/001-working-tree-commits/threat-model.md` §6。下面那句
 * {@link awaitCaptureInstalled} 就是这段时间差，**它是被测语义的一部分，不是测试的脚手架**：
 * 删掉它这两条用例仍然能绿一阵子，然后在别人的机器上开始闪——而那时它们看起来会像
 * 「捕获偶尔丢单元」，不像「通知还在路上」。
 */

import { RxDB, SyncType, uuid, type TransactionExecutor } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { ConformanceNote, WORKING_TREE_CONFORMANCE_USER_ID } from '@aiao/rxdb-plugin-working-tree/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterWaSqlite } from '../RxDBAdapterSqlite.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const opened: RxDB[] = [];

afterEach(async () => {
  const pending = opened.splice(0);
  // 逐个断开而不是 Promise.all：两个实例握的是同一个持久库，并发关闭会让后一个在前一个
  // 释放 Web Lock 的过程中开始等锁，把清理失败读成用例超时。
  for (const database of pending) await database.disconnectAll();
});

/**
 * 开一条连到 `dbName` 的真实连接。
 *
 * @param dbName - 两条连接共享的库名；同时也是网关频道名的来源
 * @param options - 只认 `multiInstance: false`，用来造一条**收不到广播**的连接
 * @returns 已 `connect()` 完成的实例
 *
 * @remarks
 * 刻意不复用 `wa-sqlite-factory.ts`：那个工厂每次调用都自己造一个随机 `dbName`，
 * 而本文件唯一的前提就是两条连接落在同一个名字上。
 */
const openConnection = async (dbName: string, options: { multiInstance?: false } = {}): Promise<RxDB> => {
  const database = new RxDB({
    dbName,
    // 审计主体必须非空：适配器拿它覆写 createdBy / updatedBy，而这两列是 tracked 的。
    context: { userId: WORKING_TREE_CONFORMANCE_USER_ID },
    entities: [ConformanceNote],
    ...options,
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
  database.adapter(
    'wa-sqlite',
    async db =>
      new RxDBAdapterWaSqlite(db, {
        // 六个 v1 后端里唯一能让两个连接同时开着同一个持久库的 VFS，见本文件 fileoverview。
        vfs: 'IDBBatchAtomicVFS',
        async: true,
        worker: false,
        wasmPath: asyncWasmPath,
        batchTimeout: 1
      })
  );
  // 两个都必须排在 `connect()` 之前：贡献系统能力的插件晚于 `init()` 注册会被核心当场拒绝。
  database.use(rxDBPluginWorkingTree);
  database.use(rxDBPluginHistory);
  opened.push(database);
  await database.connect('wa-sqlite');
  return database;
};

/**
 * 等能力启用通知跨连接送达 —— 即等到这条连接**真的**装上了捕获钩子。
 *
 * @param database - 接收端
 * @param label - 超时信息里的连接名
 * @throws Error 超过时限仍未装上
 *
 * @remarks
 * 等的是条件而不是一段时长。`BroadcastChannel` 在 Chromium 里即使同 realm 也要绕一趟浏览器
 * 进程，让出一个宏任务并不足够（实测：`setTimeout(0)` 之后 B 仍未装上，而先跑一次真实写入
 * 的那条用例却是绿的——固定时长的等待在这里只会把**时序**伪装成**行为**）。
 *
 * 轮询的是 `workingTreeCaptureHook` 这个实现细节，不是 `status()`：钩子在不在是**接收端本地**
 * 的事实，而 `status()` 读的是共享库——它会被发起端 `enable()` 写下的行满足，于是无论接收端
 * 接没接通都为真，等于没等。
 *
 * 超时就抛，不静默放行：放行的话「通知从没送到」会以下游断言失败的形态出现，而那条信息
 * 指向的是捕获，不是投递。
 */
const awaitCaptureInstalled = async (database: RxDB, label: string): Promise<void> => {
  const adapter = await database.getAdapter('wa-sqlite');
  const deadline = Date.now() + 5_000;
  while (adapter.workingTreeCaptureHook === undefined) {
    if (Date.now() > deadline) throw new Error(`${label} 在 5s 内没有收到能力启用通知，捕获始终没装上`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

/**
 * 在某条连接上写一条 note。
 *
 * @remarks
 * 建行走 `database.entityManager.createEntityRef()` 而不是 `new ConformanceNote()`：裸构造器要从
 * **全局**注册表把实体类解析回它的 EntityManager，而同一个 realm 里挂着两个实例时那张表有两项，
 * 解析当场抛（`Entity 'ConformanceNote' is registered with multiple RxDB instances`）。
 * 这是本用例的形状带来的——真实的两个 tab 是两个 realm，各有各的注册表，碰不到它。
 * 这里直接点名**哪个实例**的管理器，于是那次全局解析根本不发生。
 *
 * 不经 `executor.getRepository(...)` 拿这个引用：执行器交出来的是 `IRepository`——
 * 只承诺 CRUD 五个方法，水合助手 `createEntityRef` 在 `RepositoryBase` 上而不在这份契约里。
 * 水合路径不过构造器，所以 `id` 得自己给——`EntityBase` 那个默认值是构造器发的，
 * `Object.create()` + `Object.assign()` 这条路上没人发它。取值用 `uuid()` 而不是自描述字面量：
 * `id` 声明成 `PropertyType.uuid`，别的后端会把它建成真 uuid 列并在插入时校验格式。
 *
 * 写走 `transaction` 是因为业务写的公开入口在执行器上。
 */
const writeNote = async (database: RxDB, title: string): Promise<void> => {
  const adapter = await database.getAdapter('wa-sqlite');
  await adapter.transaction(async (executor: TransactionExecutor) => {
    const entity = database.entityManager.createEntityRef(ConformanceNote, { id: uuid(), title, body: null });
    await executor.getRepository(ConformanceNote).create(entity);
  });
};

describe('能力启用跨连接接通捕获（顺延 1 / FR-037，两个真实实例共享持久库）', () => {
  const freshDbName = (): string => `wt-cross-conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it('B 先连上、A 后启用——通知送达后 B 的写入照样进工作树', async () => {
    const dbName = freshDbName();
    const a = await openConnection(dbName);
    const b = await openConnection(dbName);

    // 前置：两端此刻都还没启用，B 身上一个捕获钩子都没有。断言它，是因为这条用例的全部
    // 价值都建立在「B 的判断是连接期读的那一次」上——如果 B 因为别的原因早就装上了钩子，
    // 下面的绿就与被测通道无关。
    const bAdapter = await b.getAdapter('wa-sqlite');
    expect(bAdapter.workingTreeCaptureHook, 'B 在启用之前就已经装了捕获').toBeUndefined();

    await a.workingTree.enable();
    await awaitCaptureInstalled(b, 'B');

    await writeNote(b, '通知送达之后 B 写的');

    // 从**两端**各读一次。只读 B 的话，「共享的是同一个库」这个前提本身没有被断言到：
    // 两个各自独立的库也能让 B 自己看见自己写的单元。
    const fromB = await b.workingTree.status();
    const fromA = await a.workingTree.status();
    expect(fromB.entryCount, 'B 的写入没有留下工作树单元').toBe(1);
    expect(fromA.entryCount, 'A 看不见 B 的单元——两条连接并没有共享同一个库').toBe(1);
    expect(fromA.branchId, '两端的 active 分支对不上').toBe(fromB.branchId);
  });

  it('发起启用的那一端自己不受影响——它在 enable() 里已经同步装好了', async () => {
    const dbName = freshDbName();
    const a = await openConnection(dbName);
    const b = await openConnection(dbName);

    await a.workingTree.enable();
    await awaitCaptureInstalled(b, 'B');

    await writeNote(a, 'A 写的');
    await writeNote(b, 'B 写的');

    // 两条都要在，而且要来自**两个不同的单元**。只断言总数为 2 不够：A 的钩子来自 `enable()`
    // 自己那一句，B 的来自跨连接通知；两条来源各漏一条都凑不出两个互不相同的 unitId。
    const { entries } = await b.workingTree.diff();
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map(entry => entry.unitId)).size, '两次写入被折进了同一个单元').toBe(2);
    const status = await a.workingTree.status();
    expect(status.entryCount).toBe(2);
    expect(status.clean).toBe(false);
  });
  it('收不到广播的连接（multiInstance: false）靠一次工作树调用自愈', async () => {
    const dbName = freshDbName();
    const a = await openConnection(dbName);
    // `multiInstance: false` ⇒ 这条连接根本不建网关，那条 `capability_enabled` 消息对它不存在。
    // 它代表的是广播够不着的那一类 realm——跨进程的 Electron 主/渲染、Tauri、Node 多进程，
    // 在浏览器里只有这一种办法造得出来。
    const b = await openConnection(dbName, { multiInstance: false });
    const bAdapter = await b.getAdapter('wa-sqlite');

    await a.workingTree.enable();

    // 先证「通知确实没到」，否则下面的绿可能来自广播而不是自愈。这里没有可等的条件，
    // 只能给一段足以让广播跑完的时间——上面那条用例实测 10ms 一档就够，取 300ms 是宽的一侧。
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(bAdapter.workingTreeCaptureHook, 'multiInstance:false 的连接居然收到了广播').toBeUndefined();

    // 一次只读调用就足以自愈：`status()` 与写操作走的是同一道 `runEnabled()` 门禁。
    await b.workingTree.status();
    expect(bAdapter.workingTreeCaptureHook, '过了能力门禁却仍然没有捕获').toBeDefined();

    await writeNote(b, '自愈之后 B 写的');
    expect((await a.workingTree.status()).entryCount, '自愈之后 B 的写入仍然没留下单元').toBe(1);
  });
});
