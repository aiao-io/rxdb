/**
 * @fileoverview 两个真实实例共享同一个持久库，一个挂主检出位、一个挂可写检出位：各自的活查询只收自己那套表上的变更
 *（US-314 B2.3，事件按表集路由）。
 *
 * @remarks
 * 跨实例的实体事件经网关原样转发，事件上的 `tableSetSuffix` 说它写在哪套表上；收方的查询管理器只合自己挂着那套表
 * 读得到的。没有这一层，同 id 的行在两套表里各有一份时，一边的改动会被合进另一边的活查询与实体缓存——
 * 而那一边自己的库里根本没有这次写。
 *
 * 能在这里撞出问题的只有「增量合并」那条路：建行事件让活查询整查（读的是收方自己那套表，串不过来）；
 * 改行事件的负载比收方缓存旧时被当成陈旧事件、同样整查。切分支派出的改行事件带的是目标版本当初的 `updatedAt`，
 * 而切换把表里的行改成当下的时间，所以收方缓存多半更新、碰巧挡住了——只有目标版本比收方缓存新时才会错合，
 * 第三条用例专门造这个条件。
 *
 * 为什么要两个真实实例、共享同一个持久库、选 `IDBBatchAtomicVFS`：见 `working-tree-cross-connection.spec.ts` 的
 * fileoverview。这里另外要的是检出位的影子表——B 打开的那套表与 A 的主表在同一个库文件里。
 *
 * 同一组用例再按 SharedWorker 共用连接跑一遍（B2.3b）：两个实例连的是 worker 里同一个客户端、同一条连接，
 * 变更事件不只经网关转发，还由共用连接的 update hook 直接派给两边——收方在本地按变更行派出带别的表集后缀的事件，
 * 路由同样要挡住它。
 *
 * 断言「没串过来」靠同步点而不是等一段时长：先等收方**收到**那条转发来的事件（监听到 id），再让收方自己写一条、
 * 等它出现在自己的活查询里——查询管理器按派发顺序处理事件，自己那条都合进来了，先到的那条该合早就合了。
 * 断言看推送历史而不只看最新一次：错合进来的值随后可能被一次整查冲掉。
 */

import {
  ENTITY_LOCAL_UPDATE_EVENT,
  RxDB,
  SyncType,
  getEntityMetadata,
  uuid,
  type TransactionExecutor
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { ConformanceNote, WORKING_TREE_CONFORMANCE_USER_ID } from '@aiao/rxdb-plugin-working-tree/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterWaSqlite } from '../RxDBAdapterSqlite.js';
import type { WaSqliteOptions } from '../sqlite.interface.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const FEATURE = 'feature';
const SIDE = 'side';
const ALL = { where: { combinator: 'and' as const, rules: [] } };
const POLL = { timeout: 5_000 };

/** 两个实例共享同一个库的两种连法：各开一条连接连同一个 IndexedDB 库，或连同一个 SharedWorker 里的那一条连接 */
type Transport = 'idb' | 'shared-worker';

const opened: RxDB[] = [];
const cleanups: Array<() => void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  // 逐个断开：两个实例握的是同一个持久库，并发关闭会让后一个在前一个释放 Web Lock 的过程中开始等锁
  for (const database of opened.splice(0)) await database.disconnectAll();
});

const freshName = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * 一条连接的适配器配置。
 *
 * @param transport - 连法
 * @param workerName - SharedWorker 的名字：同名的连的是同一个 worker、同一个客户端
 * @returns 适配器配置；`new SharedWorker(new URL(…, import.meta.url), …)` 必须内联写，Vite 只认这个字面形状为 worker 入口
 */
const adapterOptions = (transport: Transport, workerName: string): WaSqliteOptions =>
  transport === 'idb' ?
    { vfs: 'IDBBatchAtomicVFS', async: true, worker: false, wasmPath: asyncWasmPath, batchTimeout: 1 }
  : {
      vfs: 'MemoryAsyncVFS',
      async: true,
      wasmPath: asyncWasmPath,
      batchTimeout: 1,
      sharedWorker: true,
      sharedWorkerInstance: new SharedWorker(new URL('./wa-sqlite-shared-client.worker', import.meta.url), {
        type: 'module',
        name: workerName
      })
    };

/** 开一条连到 `dbName` 的真实连接，形状与 `working-tree-cross-connection.spec.ts` 相同 */
const openConnection = async (dbName: string, options: WaSqliteOptions): Promise<RxDB> => {
  const database = new RxDB({
    dbName,
    context: { userId: WORKING_TREE_CONFORMANCE_USER_ID },
    entities: [ConformanceNote],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
  database.adapter('wa-sqlite', async db => new RxDBAdapterWaSqlite(db, options));
  database.use(rxDBPluginWorkingTree);
  database.use(rxDBPluginHistory);
  opened.push(database);
  await database.connect('wa-sqlite');
  return database;
};

/**
 * A、B 两条连接共享同一个库，工作树已在两端启用；A 的主线上有一条 note，并从主线建好 FEATURE 与 SIDE。
 *
 * @param transport - 两条连接怎么共享这个库
 * @returns 两条连接与那条 note 的 id；检出位由用例自己开
 */
const openPair = async (transport: Transport): Promise<{ a: RxDB; b: RxDB; shared: string }> => {
  const dbName = freshName('wt-cross-checkout');
  const workerName = freshName('wt-cross-shared');
  const a = await openConnection(dbName, adapterOptions(transport, workerName));
  const b = await openConnection(dbName, adapterOptions(transport, workerName));
  await a.workingTree.enable();
  // 等能力启用通知跨连接送达（理由见 `working-tree-cross-connection.spec.ts` 的 awaitCaptureInstalled）
  const bAdapter = await b.getAdapter('wa-sqlite');
  await expect.poll(() => bAdapter.workingTreeCaptureHook !== undefined, POLL).toBe(true);
  const shared = await createNote(a, '主线上的');
  await a.versionManager.createBranch(FEATURE);
  await a.versionManager.createBranch(SIDE);
  return { a, b, shared };
};

/** 让 `database` 挂上 `branchId` 的可写检出位 */
const mountCheckout = async (database: RxDB, branchId: string): Promise<void> => {
  const checkout = await database.workingTree.checkouts.add(branchId);
  await database.workingTree.checkouts.mount(checkout.id);
};

/**
 * 在某条连接上建一条 note，返回它的 id。
 *
 * @remarks
 * 建行走 `database.entityManager.createEntityRef()`：同一个 realm 里挂着两个实例时，裸构造器的全局解析会抛
 *（见 `working-tree-cross-connection.spec.ts` 的 `writeNote`）。
 */
async function createNote(database: RxDB, title: string): Promise<string> {
  const adapter = await database.getAdapter('wa-sqlite');
  const id = uuid();
  await adapter.transaction(async (executor: TransactionExecutor) => {
    const entity = database.entityManager.createEntityRef(ConformanceNote, { id, title, body: null });
    await executor.getRepository(ConformanceNote).create(entity);
  });
  return id;
}

/** 在某条连接上改一条 note 的标题 */
const renameNote = async (database: RxDB, id: string, title: string): Promise<void> => {
  const adapter = await database.getAdapter('wa-sqlite');
  await adapter.transaction(async (executor: TransactionExecutor) => {
    const repository = executor.getRepository(ConformanceNote);
    const [note] = await repository.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] }
    });
    await repository.update(note, { title });
  });
};

/** 一条连接上 note 活查询的推送：最新一次的标题，与订阅以来推送过的全部标题 */
interface TitleWatch {
  readonly latest: () => string[];
  readonly everSeen: () => ReadonlySet<string>;
}

/** 订阅一条连接上 note 的活查询，记下每一次推送 */
const watchTitles = (database: RxDB): TitleWatch => {
  let latest: string[] = [];
  const everSeen = new Set<string>();
  const subscription = database.entityManager
    .getRepository(ConformanceNote)
    .findAll(ALL)
    .subscribe(notes => {
      latest = notes.map(note => note.title);
      for (const title of latest) everSeen.add(title);
    });
  cleanups.push(() => subscription.unsubscribe());
  return { latest: () => latest, everSeen: () => everSeen };
};

/** 记下一条连接收到的 note 改行事件（含别的连接经网关转发来的），返回「收到过这个 id 没有」 */
const recordNoteUpdates = (database: RxDB): ((id: string) => boolean) => {
  const ids = new Set<unknown>();
  const { name } = getEntityMetadata(ConformanceNote);
  const listener = (event: { entities: { entity: string; id: unknown }[] }) => {
    for (const entity of event.entities) if (entity.entity === name) ids.add(entity.id);
  };
  database.addEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener as never);
  cleanups.push(() => database.removeEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener as never));
  return id => ids.has(id);
};

/** 同步点：自己写一条、等它出现在自己的活查询里，此前派发给这条连接的事件就都处理过了 */
const settle = async (database: RxDB, watch: TitleWatch): Promise<void> => {
  const marker = `同步点 ${uuid()}`;
  await createNote(database, marker);
  await expect.poll(watch.latest, POLL).toContain(marker);
};

describe.each<Transport>(['idb', 'shared-worker'])(
  '一个挂主检出位、一个挂可写检出位的两个实例（US-314 B2.3，事件按表集路由，%s）',
  transport => {
    it('各自建的行只进自己的活查询', async () => {
      const { a, b } = await openPair(transport);
      await mountCheckout(b, FEATURE);
      const aTitles = watchTitles(a);
      const bTitles = watchTitles(b);

      await createNote(b, 'B 在检出位里写的');
      await createNote(a, 'A 在主检出位写的');
      await expect.poll(bTitles.latest, POLL).toContain('B 在检出位里写的');
      await expect.poll(aTitles.latest, POLL).toContain('A 在主检出位写的');
      await settle(a, aTitles);
      await settle(b, bTitles);

      expect(aTitles.everSeen()).not.toContain('B 在检出位里写的');
      expect(bTitles.everSeen()).not.toContain('A 在主检出位写的');
    });

    it('同一行在两套表里各有一份：一边改它，另一边的活查询仍是自己表上的值', async () => {
      const { a, b, shared } = await openPair(transport);
      await mountCheckout(b, FEATURE);
      const aTitles = watchTitles(a);
      const bTitles = watchTitles(b);
      const aHeard = recordNoteUpdates(a);
      const bHeard = recordNoteUpdates(b);
      await expect.poll(aTitles.latest, POLL).toContain('主线上的');
      await expect.poll(bTitles.latest, POLL).toContain('主线上的');

      await renameNote(b, shared, '检出位里改的');
      await expect.poll(bTitles.latest, POLL).toContain('检出位里改的');
      await expect.poll(() => aHeard(shared), POLL).toBe(true);
      await settle(a, aTitles);
      expect(aTitles.latest()).toContain('主线上的');
      expect(aTitles.everSeen(), 'A 缓存里同 id 的行被改成了影子表上的值').not.toContain('检出位里改的');

      // 反方向：A 在主表上改，事件不带后缀，B 不合
      await renameNote(a, shared, '主线上改的');
      await expect.poll(aTitles.latest, POLL).toContain('主线上改的');
      await expect.poll(() => bHeard(shared), POLL).toBe(true);
      await settle(b, bTitles);
      expect(bTitles.latest()).toContain('检出位里改的');
      expect(bTitles.everSeen(), 'B 缓存里同 id 的行被改成了主表上的值').not.toContain('主线上改的');
    });

    it('B 在检出位里切分支：影子表那一行换成目标版本，A 的活查询不动', async () => {
      const { a, b, shared } = await openPair(transport);
      // 先让 SIDE 上的版本比 A 订阅时读到的那一行新：B 挂上 SIDE 改标题，再切回 FEATURE
      await mountCheckout(b, SIDE);
      await renameNote(b, shared, 'SIDE 上的');
      await b.versionManager.switchBranch(FEATURE);
      const aTitles = watchTitles(a);
      const bTitles = watchTitles(b);
      const aHeard = recordNoteUpdates(a);
      await expect.poll(aTitles.latest, POLL).toContain('主线上的');
      await expect.poll(bTitles.latest, POLL).toContain('主线上的');

      await b.versionManager.switchBranch(SIDE);
      await expect.poll(bTitles.latest, POLL).toContain('SIDE 上的');
      await expect.poll(() => aHeard(shared), POLL).toBe(true);
      await settle(a, aTitles);

      expect(aTitles.latest()).toContain('主线上的');
      expect(aTitles.everSeen(), 'B 在检出位里切分支改到了 A 的活查询').not.toContain('SIDE 上的');
    });
  }
);
