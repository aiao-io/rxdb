/**
 * @fileoverview RWS-009：真实 Entity + 真实 IndexedDB + 真实 BroadcastChannel 的集成门禁
 *
 * 本包原有的两个 spec 把 `./workspace-store.js`、`idb-keyval` 与整个 RxDB/EntityManager
 * 全部 mock 掉，`newEventData()` 每次现造一个 patch 对象 —— 于是这几件事在测试里
 * **根本表达不出来**：实体 Proxy 的写穿透、`patch` 与缓存的对象身份、IndexedDB 的
 * 结构化克隆与 versionchange、BroadcastChannel 的真实跨 tab 克隆，以及
 * `RxDB.init()` 自己建的内建实体会不会被当成用户草稿。
 *
 * 这里用真实 `RxDB` + 真实 `@Entity` + 真浏览器 IndexedDB 建立集成层。
 * 只跑在 `nx test-browser rxdb-plugin-workspace`（`VITEST_BROWSER=true`）里。
 *
 * 实体定义**故意写在 spec 内**：`package.json` 的 `files` 会发布 `src`，
 * 只排除 `*.spec.*`，独立的夹具文件会被打进发布产物。
 */

import { Entity, EntityBase, PropertyType, RxDB, SyncType, type EntityType, type UUID } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RxDBPluginWorkspace,
  rxDBPluginWorkspace,
  WorkspaceFlushError,
  type WorkspaceCacheEntry,
  type WorkspaceCacheId
} from '../RxDBPluginWorkspace.js';

interface DraftMeta {
  labels: string[];
  nested: { value: string };
}

interface DraftLike {
  id: UUID;
  title: string;
  meta?: DraftMeta | null;
  dueAt?: Date | null;
}

/**
 * 每套夹具一个**全新的实体类**。
 *
 * 核心把 `EntityManager` 挂在实体原型上，同一个类注册进第二个 `RxDB` 之后再 `new`
 * 会直接抛 `Entity 'Draft' is registered with multiple RxDB instances` ——
 * 「刷新」「跨 tab」这类需要两套 RxDB 的用例只能各用各的类。
 * 元数据里的 `namespace:name` 保持一致，恢复路径的 `getEntityType()` 才认得出来。
 */
const defineDraft = () => {
  @Entity({
    namespace: 'ws_it',
    name: 'Draft',
    tableName: 'ws_it_draft',
    log: false,
    properties: [
      { name: 'title', type: PropertyType.string, required: true },
      { name: 'meta', type: PropertyType.json, nullable: true },
      { name: 'dueAt', type: PropertyType.date, nullable: true }
    ]
  })
  class Draft extends EntityBase {
    title!: string;
    meta?: DraftMeta | null;
    dueAt?: Date | null;
  }
  return Draft as unknown as (new (init?: Partial<DraftLike>) => DraftLike) & EntityType;
};

/**
 * 每个用例一套全新的 dbName。
 *
 * 长度必须掐死：真正送进 `open_v2()` 的是 `${rxdb.config.dbName}.sqlite`，上限 **56 字符**
 * （SQLite 的 `nPathname + 8 > mxPathname` 检查，wa-sqlite 的 `mxPathname = 64`）。
 * 而 `config.dbName` 会被核心追加 `@<schema 版本>` 后缀，所以调用方能用的预算是
 * `49 - 后缀长度`。超出只抛不带任何信息的 `Error: sqlite3_open_v2`（见 TRIAGE「新增发现」）。
 */
const nextDbName = (): string => `ws_it_${crypto.randomUUID().slice(0, 8)}`;

interface Harness {
  Draft: ReturnType<typeof defineDraft>;
  adapter: RxDBAdapterWaSqlite;
  /** 真正的 IndexedDB 库名 —— 带核心追加的版本后缀，不等于传进去的 dbName。 */
  idbName: string;
  rxdb: RxDB;
  workspace: RxDBPluginWorkspace;
}

/** 建一套真实 RxDB：wa-sqlite 走纯内存 VFS，workspace 走真实 IndexedDB。 */
const createHarness = async (dbName: string, options?: { autoSave?: boolean }): Promise<Harness> => {
  const Draft = defineDraft();
  const rxdb = new RxDB({
    dbName,
    entities: [Draft],
    sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
  });

  rxdb.use(rxDBPluginWorkspace, { autoSave: options?.autoSave ?? true });
  rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS' }));

  const adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;
  rxdb.init();

  return { Draft, adapter, idbName: rxdb.config.dbName, rxdb, workspace: rxdb.workspace };
};

/** 直接读真实 IndexedDB，绕开插件自身的内存缓存 —— 断言「到底落盘了什么」。 */
const readStore = (idbName: string): Promise<Map<string, Record<string, unknown>>> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(idbName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('workspace')) {
        db.close();
        resolve(new Map());
        return;
      }
      const tx = db.transaction('workspace', 'readonly');
      const store = tx.objectStore('workspace');
      const keys = store.getAllKeys();
      const values = store.getAll();
      tx.oncomplete = () => {
        const result = new Map<string, Record<string, unknown>>();
        keys.result.forEach((key, index) => result.set(String(key), values.result[index]));
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });

/** 绕过插件直接写一条 IndexedDB 记录 —— 用来伪造坏数据 / 旧版本残留。 */
const writeRaw = (idbName: string, key: IDBValidKey, value: unknown): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(idbName);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('workspace')) {
        request.result.createObjectStore('workspace');
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });

const deleteDb = (idbName: string): Promise<void> =>
  new Promise(resolve => {
    const request = indexedDB.deleteDatabase(idbName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

/** NEW 事件是在 `nextMicroTask` 里派发的，autoSave 的 `debounceTime(0)` 也要让出一轮。 */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** BroadcastChannel 的投递跨 agent，比 microtask 慢一档。 */
const nextTick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 20));

/** 只看本用例自己的实体 —— `RxDB.init()` 会往同一个缓存里塞内建的 `rxdb:RxDBBranch:main`。 */
const drafts = (workspace: RxDBPluginWorkspace): WorkspaceCacheEntry[] =>
  workspace.list().filter(entry => entry.namespace === 'ws_it');

const cacheIdOf = (draft: DraftLike): WorkspaceCacheId => `ws_it:Draft:${draft.id}`;

describe('RWS-009 真实 Entity / IndexedDB / BroadcastChannel 集成', () => {
  const opened: Harness[] = [];
  const createdDbs = new Set<string>();

  const open = async (dbName: string, options?: { autoSave?: boolean }): Promise<Harness> => {
    const harness = await createHarness(dbName, options);
    opened.push(harness);
    createdDbs.add(harness.idbName);
    return harness;
  };

  /**
   * 关掉一套夹具（模拟「关标签页」），但保留 IndexedDB 里的数据。
   *
   * 走宿主的 `disconnectAll()` 而不是插件的 `destroy()`：纪元资源现在由连接作用域驱动，
   * 拆卸路径必须和真实断连完全一致。
   */
  const closeHarness = async (harness: Harness): Promise<void> => {
    await harness.rxdb.disconnectAll();
    const index = opened.indexOf(harness);
    if (index >= 0) opened.splice(index, 1);
  };

  afterEach(async () => {
    for (const harness of opened.splice(0)) {
      await harness.rxdb.disconnectAll();
      harness.adapter.cleanAllCache();
    }
    for (const idbName of createdDbs) await deleteDb(idbName);
    createdDbs.clear();
  });

  // ---------------------------------------------------------------- 基线

  describe('NEW → 缓存 → 真实 IndexedDB', () => {
    it('落盘的是结构化克隆后的真实草稿，Date 与嵌套对象都能往返', async () => {
      const { Draft, idbName, workspace } = await open(nextDbName());
      await workspace.ready;

      const dueAt = new Date('2026-08-06T00:00:00.000Z');
      const draft = new Draft({ title: '真实草稿', meta: { labels: ['a'], nested: { value: 'v1' } }, dueAt });
      await settle();

      expect(drafts(workspace)).toHaveLength(1);
      await workspace.flush();

      const value = (await readStore(idbName)).get(cacheIdOf(draft));
      expect(value).toMatchObject({ id: draft.id, title: '真实草稿' });
      // 结构化克隆保真：Date 仍是 Date（JSON 序列化会退化成字符串）
      expect(value?.['dueAt']).toBeInstanceOf(Date);
      expect((value?.['dueAt'] as Date).toISOString()).toBe(dueAt.toISOString());
      expect(value?.['meta']).toEqual({ labels: ['a'], nested: { value: 'v1' } });
    });

    it('discard 会把草稿从内存与真实 IndexedDB 一起删掉', async () => {
      const { Draft, idbName, workspace } = await open(nextDbName());
      await workspace.ready;

      const draft = new Draft({ title: '待丢弃' });
      await settle();
      await workspace.flush();
      expect((await readStore(idbName)).has(cacheIdOf(draft))).toBe(true);

      expect(workspace.discard(cacheIdOf(draft))).toBe(true);
      await workspace.flush();

      expect(drafts(workspace)).toHaveLength(0);
      expect((await readStore(idbName)).has(cacheIdOf(draft))).toBe(false);
    });

    it('忽略内建实体，并清理旧版留下的内建草稿记录', async () => {
      const dbName = nextDbName();
      const first = await open(dbName);
      await first.workspace.ready;
      await settle();
      await first.workspace.flush();

      expect(first.workspace.list().map(e => e.cacheId)).not.toContain('rxdb:RxDBBranch:main');
      expect((await readStore(first.idbName)).has('rxdb:RxDBBranch:main')).toBe(false);
      await closeHarness(first);

      // 模拟旧版已经落盘的污染记录：新版不能只防新写入，还必须迁移存量。
      await writeRaw(first.idbName, 'rxdb:RxDBBranch:main', { id: 'main', activated: true });
      const second = await open(dbName);
      await second.workspace.ready;
      expect(second.workspace.corruptedEntries).toEqual([]);
      expect((await readStore(second.idbName)).has('rxdb:RxDBBranch:main')).toBe(false);
    });
  });

  // ------------------------------------------------------- RWS-001 探针

  describe('RWS-001：首次刷盘之后的编辑', () => {
    it('首次落盘后继续编辑会把最新快照写入 IndexedDB', async () => {
      const { Draft, idbName, workspace } = await open(nextDbName());
      await workspace.ready;

      const draft = new Draft({ title: 'v1' });
      await settle();
      await workspace.flush();
      expect((await readStore(idbName)).get(cacheIdOf(draft))?.['title']).toBe('v1');

      draft.title = 'v2';
      await settle();
      await workspace.flush();

      expect(drafts(workspace)[0].data['title']).toBe('v2');
      expect((await readStore(idbName)).get(cacheIdOf(draft))?.['title']).toBe('v2');
    });

    it('autoSave:false 下显式 flush() 会保存第二次编辑', async () => {
      const { Draft, idbName, workspace } = await open(nextDbName(), { autoSave: false });
      await workspace.ready;

      const draft = new Draft({ title: 'v1' });
      await settle();
      await workspace.flush();

      draft.title = 'v2';
      await settle();
      await workspace.flush();

      expect((await readStore(idbName)).get(cacheIdOf(draft))?.['title']).toBe('v2');
    });

    it('恢复出来的草稿继续编辑后会更新列表与持久化快照', async () => {
      const dbName = nextDbName();
      const first = await open(dbName);
      await first.workspace.ready;

      const draft = new first.Draft({ title: 'v1' });
      const cacheId = cacheIdOf(draft);
      const draftId = draft.id;
      await settle();
      await first.workspace.flush();
      await closeHarness(first);

      // 模拟刷新：同一个 dbName 重新起一套
      const second = await open(dbName);
      await second.workspace.ready;
      expect(drafts(second.workspace)).toHaveLength(1);

      const restored = second.rxdb.entityManager.getEntityRef(second.Draft, draftId) as DraftLike | undefined;
      expect(restored).toBeTruthy();

      restored!.title = 'v2';
      await settle();

      expect(drafts(second.workspace)[0].data['title']).toBe('v2');
      await second.workspace.flush();
      expect((await readStore(second.idbName)).get(cacheId)?.['title']).toBe('v2');
    });
  });

  // ------------------------------------------------------- RWS-002 探针

  describe('RWS-002：list() 的浅拷贝', () => {
    it('嵌套对象 / 数组与内部缓存共引用，外部改动会无声落盘', async () => {
      // autoSave:false：不让首次落盘抢在外部改动之前，否则观察到的是 RWS-001 而不是 RWS-002。
      const { Draft, idbName, workspace } = await open(nextDbName(), { autoSave: false });
      await workspace.ready;

      const draft = new Draft({ title: '共引用', meta: { labels: ['a'], nested: { value: 'v1' } } });
      await settle();

      const a = drafts(workspace)[0];
      const b = drafts(workspace)[0];
      expect(a.data).not.toBe(b.data);
      expect(a.data['meta']).not.toBe(b.data['meta']);

      let changed = false;
      const sub = workspace.changes$.subscribe(() => (changed = true));
      (a.data['meta'] as DraftMeta).nested.value = '被外部改了';
      (a.data['meta'] as DraftMeta).labels.push('b');
      sub.unsubscribe();

      expect(changed).toBe(false);
      expect((drafts(workspace)[0].data['meta'] as DraftMeta).nested.value).toBe('v1');
      expect(draft.meta?.nested.value).toBe('v1');

      await workspace.flush();
      expect((await readStore(idbName)).get(cacheIdOf(draft))?.['meta']).toEqual({
        labels: ['a'],
        nested: { value: 'v1' }
      });
    });

    it('首次落盘之后，外部改动只污染内存缓存，永远同步不到磁盘', async () => {
      const { Draft, idbName, workspace } = await open(nextDbName());
      await workspace.ready;

      const draft = new Draft({ title: '先落盘', meta: { labels: ['a'], nested: { value: 'v1' } } });
      await settle();
      await workspace.flush();

      (drafts(workspace)[0].data['meta'] as DraftMeta).nested.value = '只在内存里';
      await settle();
      await workspace.flush();

      expect((drafts(workspace)[0].data['meta'] as DraftMeta).nested.value).toBe('v1');
      expect((await readStore(idbName)).get(cacheIdOf(draft))?.['meta']).toEqual({
        labels: ['a'],
        nested: { value: 'v1' }
      });
    });
  });

  // ------------------------------------------------------------ 恢复路径

  describe('恢复（刷新）', () => {
    it('重开同名库会恢复草稿，Date 保持为 Date', async () => {
      const dbName = nextDbName();
      const dueAt = new Date('2026-08-06T12:34:56.000Z');

      const first = await open(dbName);
      await first.workspace.ready;
      const draft = new first.Draft({ title: '刷新前', dueAt });
      const cacheId = cacheIdOf(draft);
      await settle();
      await first.workspace.flush();
      await closeHarness(first);

      const second = await open(dbName);
      await second.workspace.ready;

      const restored = drafts(second.workspace);
      expect(restored).toHaveLength(1);
      expect(restored[0].cacheId).toBe(cacheId);
      expect(restored[0].namespace).toBe('ws_it');
      expect(restored[0].entity).toBe('Draft');
      expect(restored[0].data['title']).toBe('刷新前');
      expect(restored[0].data['dueAt']).toBeInstanceOf(Date);
      expect((restored[0].data['dueAt'] as Date).toISOString()).toBe(dueAt.toISOString());
      // 恢复不只是内存：实体引用也重建了，应用刷新后能直接拿到草稿
      expect(second.rxdb.entityManager.getEntityRef(second.Draft, draft.id)).toBeTruthy();
    });

    it('坏记录只登记不删除，同库的合法草稿照常恢复', async () => {
      const dbName = nextDbName();
      const goodId = crypto.randomUUID();

      // autoSave:false 且不 flush → 这套夹具只负责把库和 object store 建出来，
      // 不会往里写任何东西（含内建的 rxdb:RxDBBranch:main）。
      const scaffold = await open(dbName, { autoSave: false });
      await scaffold.workspace.ready;
      const idbName = scaffold.idbName;
      await closeHarness(scaffold);

      await writeRaw(idbName, `ws_it:Draft:${goodId}`, { id: goodId, title: '好记录' });
      await writeRaw(idbName, 'not-a-cache-id', { title: '坏 key' });
      await writeRaw(idbName, `ws_it:Draft:${crypto.randomUUID()}`, { id: goodId, title: 'id 对不上' });
      await writeRaw(idbName, `ws_it:Draft:${crypto.randomUUID()}`, 'not-an-object');

      const { workspace } = await open(dbName, { autoSave: false });
      await workspace.ready;

      expect(drafts(workspace)).toHaveLength(1);
      expect(drafts(workspace)[0].data['title']).toBe('好记录');
      expect(workspace.corruptedEntries).toHaveLength(3);
      expect(workspace.corruptedEntries.map(e => e.key)).toContain('not-a-cache-id');
      // 不主动删除无法理解的数据
      expect((await readStore(idbName)).size).toBe(4);
    });

    it('恢复窗口内断连，不会往已释放的纪元回填缓存', async () => {
      const dbName = nextDbName();

      const first = await open(dbName);
      await first.workspace.ready;
      new first.Draft({ title: '会被恢复窗口撞上' });
      await settle();
      await first.workspace.flush();
      await closeHarness(first);

      const second = await open(dbName);
      // 故意不 await ready：断连落在 entries() 的 await 中间
      await closeHarness(second);
      await second.workspace.ready;

      expect(second.workspace.list()).toEqual([]);
    });
  });

  // ------------------------------------------------- 真实 BroadcastChannel

  describe('跨 tab（真实 BroadcastChannel）', () => {
    it('合法 add / remove 会同步进缓存并落盘，非法消息一律丢弃', async () => {
      const dbName = nextDbName();
      const { Draft, idbName, rxdb, workspace } = await open(dbName);
      await workspace.ready;

      const channel = new BroadcastChannel(`${idbName}_workspace_sync`);
      const remoteId = crypto.randomUUID();
      const cacheId = `ws_it:Draft:${remoteId}`;
      const echoed: unknown[] = [];
      channel.addEventListener('message', event => echoed.push(event.data));

      channel.postMessage({
        type: 'add',
        clientId: 'other-tab',
        cacheId,
        data: { id: remoteId, title: '另一个 tab 的草稿', meta: { labels: [], nested: { value: 'x' } } }
      });
      await nextTick();

      expect(drafts(workspace)).toHaveLength(1);
      expect(echoed).toEqual([]);

      channel.postMessage({
        type: 'add',
        clientId: 'other-tab',
        cacheId,
        data: { id: remoteId, title: '另一个 tab 的第二次编辑', meta: { labels: [], nested: { value: 'y' } } }
      });
      await nextTick();

      expect(drafts(workspace)[0].data['title']).toBe('另一个 tab 的第二次编辑');
      expect(echoed).toEqual([]);
      await workspace.flush();
      expect((await readStore(idbName)).get(cacheId)?.['title']).toBe('另一个 tab 的第二次编辑');
      // 跨 tab 的 add 也建了实体引用
      expect(rxdb.entityManager.getEntityRef(Draft, remoteId as UUID)).toBeTruthy();

      // 形状非法：null / 缺 clientId / cacheId 段数不对 / 假 UUID / data.id 与 cacheId 不一致
      const bogusId = crypto.randomUUID();
      for (const message of [
        null,
        { type: 'add', cacheId, data: { id: remoteId } },
        { type: 'add', clientId: 'other-tab', cacheId: 'ws_it:Draft', data: {} },
        { type: 'add', clientId: 'other-tab', cacheId: 'ws_it:Draft:not-a-uuid', data: {} },
        { type: 'add', clientId: 'other-tab', cacheId: `ws_it:Draft:${bogusId}`, data: { id: remoteId } },
        { type: 'unknown', clientId: 'other-tab', cacheId: `ws_it:Draft:${bogusId}` }
      ]) {
        channel.postMessage(message);
      }
      await nextTick();

      expect(drafts(workspace)).toHaveLength(1);
      expect([...(await readStore(idbName)).keys()].filter(key => key.startsWith('ws_it:'))).toEqual([cacheId]);

      channel.postMessage({ type: 'remove', clientId: 'other-tab', cacheId });
      await nextTick();
      await workspace.flush();

      expect(drafts(workspace)).toHaveLength(0);
      expect((await readStore(idbName)).has(cacheId)).toBe(false);
      channel.close();
    });

    it('本 tab 新建会广播，且不会被自己回灌', async () => {
      const { Draft, idbName, workspace } = await open(nextDbName());
      await workspace.ready;
      await settle();

      const received: Array<{ cacheId?: string }> = [];
      const spy = new BroadcastChannel(`${idbName}_workspace_sync`);
      spy.addEventListener('message', event => received.push(event.data as { cacheId?: string }));

      const draft = new Draft({ title: '本 tab 新建' });
      await settle();
      await nextTick();

      expect(received.filter(m => m.cacheId === cacheIdOf(draft))).toHaveLength(1);
      expect(drafts(workspace)).toHaveLength(1);
      spy.close();
    });
  });

  // ------------------------------------------------- versionchange / 写失败

  describe('versionchange 与写入失败', () => {
    it('外部升级数据库时插件让路，升级不会被 blocked，之后仍可继续刷盘', async () => {
      const { Draft, idbName, workspace } = await open(nextDbName());
      await workspace.ready;

      new Draft({ title: '升级前' });
      await settle();
      await workspace.flush();

      // 外部升级：若插件不响应 versionchange，这里会 fire blocked 并永久挂起
      const upgraded = await new Promise<'upgraded' | 'blocked'>(resolve => {
        const request = indexedDB.open(idbName, 99);
        request.onupgradeneeded = () => request.result.createObjectStore('other_store');
        request.onblocked = () => resolve('blocked');
        request.onsuccess = () => {
          request.result.close();
          resolve('upgraded');
        };
      });
      expect(upgraded).toBe('upgraded');

      // 连接被关掉之后，插件必须能重开并继续写
      const draft2 = new Draft({ title: '升级后' });
      await settle();
      await workspace.flush();
      expect((await readStore(idbName)).get(cacheIdOf(draft2))?.['title']).toBe('升级后');
    });

    it('不可克隆的草稿被单独隔离：同批其他草稿照常落盘，错误点名是哪一条', async () => {
      const { Draft, idbName, workspace } = await open(nextDbName(), { autoSave: false });
      await workspace.ready;

      const ok = new Draft({ title: '可克隆' });
      const bad = new Draft({ title: '不可克隆' });
      await settle();
      // 函数无法结构化克隆。旧实现把它送进事务，让 put() 同步抛 DataCloneError；
      // 而 setMany 的整批 put 在同一个事务里，异常穿出回调后事务并不 abort ——
      // 「整批失败」只是错觉，磁盘上留的是半批数据。
      bad.meta = { boom: () => undefined } as unknown as DraftMeta;

      const reason = await workspace.flush().then(
        () => undefined,
        (error: unknown) => error
      );

      // 克隆预检在事务之外，坏 key 进不了事务 —— 剩下的那批是真正原子的
      expect([...(await readStore(idbName)).keys()].filter(key => key.startsWith('ws_it:'))).toEqual([cacheIdOf(ok)]);

      // 调用方唯一的补救手段是 discard(cacheId)，所以错误必须带上是哪一条
      expect(reason).toBeInstanceOf(Error);
      expect((reason as Error).name).toBe('WorkspaceFlushError');
      expect((reason as Error).message).toBeTruthy();
      expect((reason as WorkspaceFlushError).cacheIds).toEqual([cacheIdOf(bad)]);
      // 已落盘的那条不会被回填进队列，重试不会重复写
      expect((reason as WorkspaceFlushError).cacheIds).not.toContain(cacheIdOf(ok));
    });

    it('把不可克隆的字段改好之后，同一条草稿能重新落盘（队列不再被毒死）', async () => {
      const { Draft, idbName, workspace } = await open(nextDbName(), { autoSave: false });
      await workspace.ready;

      const bad = new Draft({ title: '不可克隆' });
      await settle();
      bad.meta = { boom: () => undefined } as unknown as DraftMeta;
      await expect(workspace.flush()).rejects.toThrow(/could not be cloned/);

      // 回队列的是**活引用**而不是浅拷贝快照：把实体上的坏字段改好，重试就该成功。
      // 旧实现回填的快照仍指向那个带函数的旧对象，这条草稿此后永远落不了盘，
      // 而且 #hasQueuedChanges() 恒真 —— 同一个工作区里其他所有草稿也跟着存不下去。
      bad.meta = { labels: ['fixed'], nested: { value: 'ok' } };
      await expect(workspace.flush()).resolves.toBeUndefined();
      expect((await readStore(idbName)).get(cacheIdOf(bad))?.['meta']).toEqual({
        labels: ['fixed'],
        nested: { value: 'ok' }
      });
    });

    it('毒草稿卡在队列里时，之后新建的草稿依然能落盘', async () => {
      const { Draft, idbName, workspace } = await open(nextDbName(), { autoSave: false });
      await workspace.ready;

      const bad = new Draft({ title: '不可克隆' });
      await settle();
      bad.meta = { boom: () => undefined } as unknown as DraftMeta;
      await expect(workspace.flush()).rejects.toThrow(/could not be cloned/);

      const later = new Draft({ title: '后来的' });
      await settle();
      await expect(workspace.flush()).rejects.toThrow(/could not be cloned/);
      expect((await readStore(idbName)).get(cacheIdOf(later))?.['title']).toBe('后来的');

      // 丢弃毒草稿之后，flush() 恢复正常
      expect(workspace.discard(cacheIdOf(bad))).toBe(true);
      await expect(workspace.flush()).resolves.toBeUndefined();
      expect((await readStore(idbName)).has(cacheIdOf(bad))).toBe(false);
    });

    it('NEW 派发前赋上不可克隆字段时隔离广播失败', async () => {
      const { Draft, rxdb, workspace } = await open(nextDbName(), { autoSave: false });
      await workspace.ready;

      // `entity-manager.ts` 的 `nextMicroTask(...)` 返回值被丢弃，回调抛出 = 无人接管的
      // promise rejection。测试里必须自己吞掉，否则 vitest 会判整个文件失败。
      const swallowed: unknown[] = [];
      const onUnhandled = (event: PromiseRejectionEvent) => {
        swallowed.push(event.reason);
        event.preventDefault();
      };
      globalThis.addEventListener('unhandledrejection', onUnhandled);

      // workspace 的监听器先注册，探针排在它后面 —— 用来观察派发链是否被截断。
      const probed: unknown[] = [];
      rxdb.addEventListener('ENTITY_LOCAL_NEW', event => probed.push(event));

      // 时序是关键：构造函数里 `EntityStatus` 会 `structuredClone({...target})` 建基线，
      // 所以「构造时就带函数」是同步 fail-fast，反而安全。而 proxy 的 set 拦截**不克隆**，
      // NEW 又是 `nextMicroTask` 才派发、`patch` 就是实体本体 ——
      // 于是「构造后、微任务前」这一同步窗口里赋的值会原样进广播。
      const bad = new Draft({ title: '先构造' });
      bad.meta = { boom: () => undefined } as unknown as DraftMeta;
      await settle();
      await nextTick();

      expect(swallowed).toEqual([]);
      expect(probed).toHaveLength(1);
      expect(workspace.cacheCount).toBe(1);
      expect(workspace.corruptedEntries).toEqual([
        { key: cacheIdOf(bad), reason: expect.stringContaining('无法跨 tab 同步') }
      ]);
      await expect(workspace.flush()).rejects.toBeInstanceOf(WorkspaceFlushError);

      globalThis.removeEventListener('unhandledrejection', onUnhandled);
    });

    it('断连之后再调 flush() 直接拒绝，不会静默 resolve', async () => {
      const harness = await open(nextDbName(), { autoSave: false });
      const { Draft, workspace } = harness;
      await workspace.ready;

      new Draft({ title: '来不及落盘' });
      await settle();
      await closeHarness(harness);

      await expect(workspace.flush()).rejects.toThrow(/not installed in the current connection epoch/);
    });

    it('断连丢弃未落盘变更时，已挂起的 flush() 必须 reject', async () => {
      const harness = await open(nextDbName(), { autoSave: false });
      const { Draft, workspace } = harness;
      await workspace.ready;

      new Draft({ title: '来不及落盘' });
      await settle();

      // flush() 内部先 `await this.ready` 才登记 waiter；这里让出一轮宏任务，
      // 确保断连撞上的是「waiter 已登记、写盘任务还没跑」的那个窗口。
      const pending = workspace.flush();
      await settle();
      await closeHarness(harness);

      await expect(pending).rejects.toThrow(/released with unflushed changes/);
    });
  });
});
