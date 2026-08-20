import type { EntityType, RxDB, RxDBEntityLocalEventData, UUID } from '@aiao/rxdb';
import { ENTITY_LOCAL_CREATE_EVENT, ENTITY_LOCAL_NEW_EVENT, ENTITY_LOCAL_REMOVE_EVENT } from '@aiao/rxdb';
import { LifecycleScope } from '@aiao/utils';
import { delMany, entries, setMany } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rxDBPluginWorkspace as exportedFactory } from '../index.js';
import {
  get_cache_id,
  RxDBPluginWorkspace,
  rxDBPluginWorkspace,
  WorkspaceFlushError,
  type WorkspaceCacheId
} from '../RxDBPluginWorkspace.js';
import { createWorkspaceStore } from '../workspace-store.js';

const idbState = vi.hoisted(() => ({
  store: new Map<IDBValidKey, unknown>(),
  stores: [] as Array<{ close: () => void }>
}));

vi.mock('../workspace-store.js', () => ({
  createWorkspaceStore: vi.fn(() => {
    const store = Object.assign(() => Promise.resolve(undefined), { close: vi.fn() });
    idbState.stores.push(store);
    return store;
  })
}));

vi.mock('idb-keyval', () => ({
  entries: vi.fn(async () => Array.from(idbState.store.entries())),
  setMany: vi.fn(async (items: Array<[IDBValidKey, unknown]>) => {
    items.forEach(([key, value]) => idbState.store.set(key, value));
  }),
  delMany: vi.fn(async (keys: IDBValidKey[]) => {
    keys.forEach(key => idbState.store.delete(key));
  })
}));

const entriesMock = vi.mocked(entries);
const setManyMock = vi.mocked(setMany);
const delManyMock = vi.mocked(delMany);
const createWorkspaceStoreMock = vi.mocked(createWorkspaceStore);

const TODO_ID_1: UUID = '00000000-0000-0000-0000-000000000001';
const TODO_ID_2: UUID = '00000000-0000-0000-0000-000000000002';
const UNKNOWN_ID: UUID = '00000000-0000-0000-0000-000000000003';
const MockEntity = class MockEntity {} as unknown as EntityType;

type TestEntityEventData = {
  type: 'NEW' | 'INSERT' | 'DELETE';
  namespace: string;
  entity: string;
  id: UUID;
  patch: Record<string, unknown> | null;
  inversePatch: Record<string, unknown> | null;
  recordAt: Date;
  origin?: 'cross-tab';
};

type TestEntityEvent = {
  type: string;
  entities: TestEntityEventData[];
};

type TestEventListener = (event: TestEntityEvent) => void;
type TestEntityRef = Record<string, unknown>;

function createMockRxDB() {
  const listeners = new Map<string, Set<TestEventListener>>();
  const getEntityType = vi.fn<(entity: string, namespace?: string) => EntityType | undefined>(() => undefined);
  const createEntityRef = vi.fn((_EntityType: EntityType, data: Record<string, unknown>): TestEntityRef => ({
    ...data
  }));
  const getEntityRef = vi.fn<(_EntityType: EntityType, id: UUID) => TestEntityRef | undefined>(() => undefined);
  const removeEntityCache = vi.fn<(entity: TestEntityRef) => void>();
  const save = vi.fn(async (entity: TestEntityRef) => entity);
  const saveMany = vi.fn(async (entities: TestEntityRef[]) => entities);
  const addEventListener = vi.fn((type: string, listener: TestEventListener) => {
    const typeListeners = listeners.get(type) ?? new Set<TestEventListener>();
    typeListeners.add(listener);
    listeners.set(type, typeListeners);
  });
  const removeEventListener = vi.fn((type: string, listener: TestEventListener) => {
    listeners.get(type)?.delete(listener);
  });

  return {
    config: { dbName: 'test-db' },
    schemaManager: { getEntityType },
    entityManager: {
      createEntityRef,
      getEntityRef,
      removeEntityCache,
      save,
      saveMany
    },
    addEventListener,
    removeEventListener,
    dispatchEvent(event: TestEntityEvent) {
      listeners.get(event.type)?.forEach(listener => listener(event));
    },
    listeners
  };
}

type MockRxDB = ReturnType<typeof createMockRxDB>;

const asRxDB = (rxdb: MockRxDB) => rxdb as unknown as RxDB;
const asLocalEventData = (data: TestEntityEventData) => data as unknown as RxDBEntityLocalEventData;
const cacheId = (entity: string, id: UUID) => `default:${entity}:${id}` as WorkspaceCacheId;

function newEventData(id: UUID, patch: Record<string, unknown> = {}): TestEntityEventData {
  return {
    type: 'NEW',
    namespace: 'default',
    entity: 'Todo',
    id,
    patch: { id, ...patch },
    inversePatch: null,
    recordAt: new Date()
  };
}

function createEventData(id: UUID, patch: Record<string, unknown> = {}): TestEntityEventData {
  return {
    type: 'INSERT',
    namespace: 'default',
    entity: 'Todo',
    id,
    patch: { id, ...patch },
    inversePatch: null,
    recordAt: new Date()
  };
}

function removeEventData(id: UUID): TestEntityEventData {
  return {
    type: 'DELETE',
    namespace: 'default',
    entity: 'Todo',
    id,
    patch: null,
    inversePatch: { id, title: 'removed' },
    recordAt: new Date()
  };
}

function dispatch(rxdb: MockRxDB, type: string, data: TestEntityEventData) {
  rxdb.dispatchEvent({ type, entities: [data] });
}

function resetIdbMocks() {
  idbState.store.clear();
  idbState.stores.length = 0;
  vi.clearAllMocks();
  entriesMock.mockImplementation(async () => Array.from(idbState.store.entries()));
  setManyMock.mockImplementation(async items => {
    items.forEach(([key, value]) => idbState.store.set(key, value));
  });
  delManyMock.mockImplementation(async keys => {
    keys.forEach(key => idbState.store.delete(key));
  });
}

class BroadcastChannelStub {
  #messageListener: ((event: MessageEvent<unknown>) => void) | undefined;
  static instances: BroadcastChannelStub[] = [];
  readonly postMessage = vi.fn<(message: unknown) => void>();
  readonly close = vi.fn(() => undefined);

  constructor(readonly name: string) {
    BroadcastChannelStub.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void) {
    if (type === 'message') this.#messageListener = listener;
  }

  removeEventListener(type: string, listener: (event: MessageEvent<unknown>) => void) {
    if (type === 'message' && this.#messageListener === listener) this.#messageListener = undefined;
  }

  emit(data: unknown) {
    this.#messageListener?.({ data } as MessageEvent<unknown>);
  }
}

/**
 * 建插件并配一条独立的连接纪元作用域。
 *
 * 纪元资源（store、BroadcastChannel、任务泵、实体监听器）都在 `install()` 里登记，
 * 因此断开连接在用例里就是 `await scope.dispose()`；构造函数只发布 `rxdb.workspace`。
 */
function createScoped(rxdb: MockRxDB, options?: { autoSave?: boolean }) {
  const plugin = new RxDBPluginWorkspace(asRxDB(rxdb), options);
  return { plugin, scope: new LifecycleScope('workspace-spec') };
}

/** {@link createScoped} 加一次立即安装，供不关心 `install()` 返回值的用例使用。 */
function installScoped(rxdb: MockRxDB, options?: { autoSave?: boolean }) {
  const scoped = createScoped(rxdb, options);
  return { ...scoped, ready: scoped.plugin.install(scoped.scope) };
}

beforeEach(() => {
  resetIdbMocks();
  BroadcastChannelStub.instances = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RxDBPluginWorkspace', () => {
  let rxdb: MockRxDB;
  let plugin: RxDBPluginWorkspace;
  let scope: LifecycleScope;

  beforeEach(() => {
    rxdb = createMockRxDB();
    ({ plugin, scope } = installScoped(rxdb));
  });

  afterEach(async () => {
    await scope.dispose();
  });

  it('has the workspace name and package entrypoint', () => {
    expect(plugin.name).toBe('workspace');
    expect(plugin.lifecycle).toBe('scoped');
    expect(exportedFactory).toBe(rxDBPluginWorkspace);
  });

  it('registers and removes entity event listeners', async () => {
    expect(rxdb.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_NEW_EVENT, expect.any(Function));
    expect(rxdb.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_REMOVE_EVENT, expect.any(Function));
    expect(rxdb.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_CREATE_EVENT, expect.any(Function));

    await scope.dispose();

    expect(rxdb.removeEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_NEW_EVENT, expect.any(Function));
    expect(rxdb.removeEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_REMOVE_EVENT, expect.any(Function));
    expect(rxdb.removeEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_CREATE_EVENT, expect.any(Function));
  });

  it('构造只发布身份，纪元资源要等到 install()', () => {
    const bare = createMockRxDB();
    const barePlugin = new RxDBPluginWorkspace(asRxDB(bare));

    // 身份属性摘不掉，属于注册期；监听器与 store 属于连接纪元
    expect(Object.getOwnPropertyDescriptor(bare, 'workspace')?.value).toBe(barePlugin);
    expect(bare.addEventListener).not.toHaveBeenCalled();
  });

  it('断开重连后是全新的纪元资源，同一个实例继续可用', async () => {
    dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Epoch 1' }));
    expect(plugin.cacheCount).toBe(1);

    await scope.dispose();
    // 纪元草稿随纪元一起丢弃，changes$ 不会因此完成
    expect(plugin.cacheCount).toBe(0);

    scope = new LifecycleScope('workspace-spec-epoch-2');
    await plugin.install(scope);

    dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_2, { title: 'Epoch 2' }));
    expect(plugin.cacheCount).toBe(1);
    expect(idbState.stores).toHaveLength(2);
  });

  it('attaches itself as a non-writable rxdb property', () => {
    expect(Object.getOwnPropertyDescriptor(rxdb, 'workspace')).toMatchObject({
      value: plugin,
      configurable: false,
      enumerable: false,
      writable: false
    });
  });

  describe('event handling', () => {
    it('caches a new entity', () => {
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Test' }));

      expect(plugin.cacheCount).toBe(1);
      expect(plugin.list()[0]?.data).toMatchObject({ id: TODO_ID_1, title: 'Test' });
    });

    it('ignores malformed entity event data', () => {
      rxdb.dispatchEvent({
        type: ENTITY_LOCAL_NEW_EVENT,
        entities: [{ ...newEventData(TODO_ID_1), entity: '' }]
      });

      expect(plugin.cacheCount).toBe(0);
    });

    it.each(['RxDBBranch', 'RxDBChange', 'RxDBMigration', 'RxDBSync'])('忽略系统实体 %s 的 NEW 事件', entity => {
      rxdb.dispatchEvent({
        type: ENTITY_LOCAL_NEW_EVENT,
        entities: [{ ...newEventData(TODO_ID_1), namespace: 'rxdb', entity }]
      });

      expect(plugin.cacheCount).toBe(0);
    });

    it('不误伤 rxdb namespace 下的自定义实体', () => {
      rxdb.dispatchEvent({
        type: ENTITY_LOCAL_NEW_EVENT,
        entities: [{ ...newEventData(TODO_ID_1), namespace: 'rxdb', entity: 'CustomEntity' }]
      });

      expect(plugin.cacheCount).toBe(1);
    });

    it('stores an empty patch when NEW event patch is not an object', async () => {
      rxdb.dispatchEvent({
        type: ENTITY_LOCAL_NEW_EVENT,
        entities: [{ ...newEventData(TODO_ID_1), patch: null }]
      });

      expect(plugin.list()[0]?.data).toEqual({});
      await plugin.flush();
      expect(idbState.store.get(cacheId('Todo', TODO_ID_1))).toEqual({});
    });

    it('removes a cached entity on remove', () => {
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Test' }));
      dispatch(rxdb, ENTITY_LOCAL_REMOVE_EVENT, removeEventData(TODO_ID_1));

      expect(plugin.cacheCount).toBe(0);
    });

    it('removes a cached entity after database creation', () => {
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Test' }));
      dispatch(rxdb, ENTITY_LOCAL_CREATE_EVENT, createEventData(TODO_ID_1, { title: 'Test' }));

      expect(plugin.cacheCount).toBe(0);
    });

    /**
     * ENTITY_LOCAL_CREATE_EVENT / ENTITY_LOCAL_REMOVE_EVENT 是全局事件：数据库的每一次
     * INSERT/DELETE（含远端同步落库、批量导入、其它 tab 经网关转发的变更）都会派发，
     * 绝大多数与本插件的草稿缓存毫无关系。`#delete()` 不做存在性判断就无条件生效，
     * 会让这些无关事件也污染 `#need_delete_ids` 并触发一次多余的 IndexedDB 删除事务
     * 与一次 `changes$` 发射。
     */
    it('与草稿缓存无关的 CREATE/REMOVE 事件不得触发多余的删除事务或变更通知', async () => {
      const changes = vi.fn();
      const subscription = plugin.changes$.subscribe(changes);

      dispatch(rxdb, ENTITY_LOCAL_CREATE_EVENT, createEventData(UNKNOWN_ID, { title: 'unrelated insert' }));
      dispatch(rxdb, ENTITY_LOCAL_REMOVE_EVENT, removeEventData(UNKNOWN_ID));
      await plugin.flush();

      expect(changes).not.toHaveBeenCalled();
      expect(setManyMock).not.toHaveBeenCalled();
      expect(delManyMock).not.toHaveBeenCalled();

      subscription.unsubscribe();
    });
  });

  describe('public API', () => {
    it('lists cached entities without exposing mutable internal data', () => {
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Test', completed: false }));

      const listed = plugin.list();
      listed[0]!.data.title = 'mutated outside';

      expect(plugin.list()).toEqual([
        {
          cacheId: cacheId('Todo', TODO_ID_1),
          namespace: 'default',
          entity: 'Todo',
          id: TODO_ID_1,
          data: { id: TODO_ID_1, title: 'Test', completed: false }
        }
      ]);
    });

    it('discards a draft and removes its entity cache', () => {
      const entityRef = { id: TODO_ID_1 };
      rxdb.schemaManager.getEntityType.mockReturnValue(MockEntity);
      rxdb.entityManager.getEntityRef.mockReturnValue(entityRef);
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Test' }));

      expect(plugin.discard(cacheId('Todo', TODO_ID_1))).toBe(true);
      expect(plugin.discard(cacheId('Todo', TODO_ID_1))).toBe(false);
      expect(rxdb.entityManager.removeEntityCache).toHaveBeenCalledWith(entityRef);
    });

    it('discards drafts without registered entity types or entity refs', () => {
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'orphan' }));
      expect(plugin.discard(cacheId('Todo', TODO_ID_1))).toBe(true);
      expect(rxdb.entityManager.removeEntityCache).not.toHaveBeenCalled();

      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_2, { title: 'no-ref' }));
      rxdb.schemaManager.getEntityType.mockReturnValue(MockEntity);
      rxdb.entityManager.getEntityRef.mockReturnValue(undefined);
      expect(plugin.discard(cacheId('Todo', TODO_ID_2))).toBe(true);
      expect(rxdb.entityManager.removeEntityCache).not.toHaveBeenCalled();
    });

    it('emits changes when cache state changes', () => {
      const changes = vi.fn();
      const subscription = plugin.changes$.subscribe(changes);

      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1));

      expect(changes).toHaveBeenCalledTimes(1);
      subscription.unsubscribe();
    });
  });

  describe('flush', () => {
    it('returns immediately when no changes are queued', async () => {
      await expect(plugin.flush()).resolves.toBeUndefined();

      expect(setManyMock).not.toHaveBeenCalled();
      expect(delManyMock).not.toHaveBeenCalled();
    });

    it('persists changes added while another flush is pending', async () => {
      let resolveFirstWrite: (() => void) | undefined;
      setManyMock.mockImplementationOnce(async items => {
        await new Promise<void>(resolve => {
          resolveFirstWrite = resolve;
        });
        items.forEach(([key, value]) => idbState.store.set(key, value));
      });

      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Test 1' }));
      await vi.waitFor(() => expect(resolveFirstWrite).toBeTypeOf('function'));
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_2, { title: 'Test 2' }));

      resolveFirstWrite?.();
      await plugin.flush();

      expect(idbState.store.get(cacheId('Todo', TODO_ID_1))).toMatchObject({ title: 'Test 1' });
      expect(idbState.store.get(cacheId('Todo', TODO_ID_2))).toMatchObject({ title: 'Test 2' });
    });

    it('rejects a failed write without spinning and allows an explicit retry', async () => {
      setManyMock.mockRejectedValueOnce(new Error('IndexedDB write failed'));
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Retry me' }));

      await expect(plugin.flush()).rejects.toThrow('IndexedDB write failed');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(setManyMock).toHaveBeenCalledTimes(1);
      expect(plugin.cacheCount).toBe(1);

      await plugin.flush();

      expect(setManyMock).toHaveBeenCalledTimes(2);
      expect(idbState.store.get(cacheId('Todo', TODO_ID_1))).toMatchObject({ title: 'Retry me' });
    });

    it('prefers newer queued save over failed-task restoration', async () => {
      let resolveWrite: (() => void) | undefined;
      setManyMock.mockImplementationOnce(async items => {
        await new Promise<void>(resolve => {
          resolveWrite = resolve;
        });
        items.forEach(([key, value]) => idbState.store.set(key, value));
      });
      setManyMock.mockRejectedValueOnce(new Error('write failed after supersede'));

      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'v1' }));
      await vi.waitFor(() => expect(resolveWrite).toBeTypeOf('function'));

      // 第一次写入进行中时用更新的保存覆盖，再让下一次写入失败。
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'v2' }));
      resolveWrite?.();
      await expect(plugin.flush()).rejects.toThrow('write failed after supersede');

      // 失败后，更新的 v2 仍应可恢复并刷新。
      await plugin.flush();
      expect(idbState.store.get(cacheId('Todo', TODO_ID_1))).toMatchObject({ title: 'v2' });
    });

    // RWS-003：`await` 之后必须复核纪元。写盘任务跨越一次断连重连时，旧任务手里的
    // `#pending`、任务队列、flush waiter 都已经属于新纪元——它结算的只能是自己那一批。
    it('旧纪元迟到的写盘不结算新纪元的 flush()', async () => {
      let landStaleWrite: (() => void) | undefined;
      let landFreshWrite: (() => void) | undefined;
      setManyMock
        .mockImplementationOnce(async items => {
          await new Promise<void>(resolve => {
            landStaleWrite = resolve;
          });
          items.forEach(([key, value]) => idbState.store.set(key, value));
        })
        .mockImplementationOnce(async items => {
          await new Promise<void>(resolve => {
            landFreshWrite = resolve;
          });
          items.forEach(([key, value]) => idbState.store.set(key, value));
        });

      // 第一纪元的写盘卡在 IndexedDB 上
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Epoch 1' }));
      await vi.waitFor(() => expect(landStaleWrite).toBeTypeOf('function'));

      // 断连重连：纪元状态复位，store 换新，旧任务还在飞
      await scope.dispose();
      scope = new LifecycleScope('workspace-spec-epoch-2');
      await plugin.install(scope);

      // 新纪元自己的写盘同样还没落地
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_2, { title: 'Epoch 2' }));
      await vi.waitFor(() => expect(landFreshWrite).toBeTypeOf('function'));

      let flushed = false;
      const flushing = plugin.flush().then(() => void (flushed = true));

      landStaleWrite?.();
      await new Promise(resolve => setTimeout(resolve, 10));

      // flush() 的语义是「队列里的草稿已经进了 IndexedDB」——旧纪元写完不算数
      expect(flushed).toBe(false);
      expect(idbState.store.has(cacheId('Todo', TODO_ID_2))).toBe(false);

      landFreshWrite?.();
      await flushing;

      expect(flushed).toBe(true);
      expect(idbState.store.get(cacheId('Todo', TODO_ID_2))).toMatchObject({ title: 'Epoch 2' });
    });

    // RWS-FRESH-02：草稿存的是「用户正在编辑的实体」，字段类型由业务定义，插件管不着。
    // 一个函数字段就足以让 `structuredClone` 失败 —— 旧实现把它送进事务，让 put() 同步抛
    // DataCloneError，而 setMany 的整批 put 共用一个事务、异常穿出后事务不 abort，
    // 于是「整批失败」只是错觉，磁盘上留的是半批数据。
    it('不可克隆的草稿在进事务前被挑走，同批其他草稿照常落盘', async () => {
      const poisoned = newEventData(TODO_ID_2, { title: '不可克隆' });
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: '可克隆' }));
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, poisoned);
      // 坏字段在 NEW 之后才写进去 —— 与真实时序一致：用户是在草稿创建后继续编辑的。
      // （若在 NEW 之前就带上函数，先炸的是 #entityEventHandler 里的跨 tab 广播，见 RWS-FRESH-03。）
      poisoned.patch!['boom'] = () => undefined;

      const reason = await plugin.flush().then(
        () => undefined,
        (error: unknown) => error
      );

      expect(reason).toBeInstanceOf(WorkspaceFlushError);
      expect((reason as Error).name).toBe('WorkspaceFlushError');
      expect((reason as Error).message).toBeTruthy();
      // 调用方唯一的补救手段是 discard(cacheId)，所以错误必须点名是哪一条
      expect((reason as WorkspaceFlushError).cacheIds).toEqual([cacheId('Todo', TODO_ID_2)]);

      // 送进事务的只有可克隆的那批
      expect(setManyMock).toHaveBeenCalledTimes(1);
      expect(setManyMock.mock.calls[0][0].map(([key]) => key)).toEqual([cacheId('Todo', TODO_ID_1)]);
      expect(idbState.store.get(cacheId('Todo', TODO_ID_1))).toMatchObject({ title: '可克隆' });
      expect(idbState.store.has(cacheId('Todo', TODO_ID_2))).toBe(false);
    });

    it('克隆失败后回队列的是活引用，改好字段重试即可落盘', async () => {
      const event = newEventData(TODO_ID_1, { title: '毒草稿' });
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, event);
      event.patch!['meta'] = { boom: () => undefined };

      await expect(plugin.flush()).rejects.toBeInstanceOf(WorkspaceFlushError);
      expect(idbState.store.has(cacheId('Todo', TODO_ID_1))).toBe(false);

      // 旧实现回填的是 #runTask 里那份浅拷贝快照，它的 meta 仍指向带函数的旧对象 ——
      // 调用方把实体改好也没用，这条草稿此后每次 flush 都以同一个错误失败，
      // 而 #hasQueuedChanges() 恒真，同一个工作区里其他草稿也跟着永远存不下去。
      event.patch!['meta'] = { fixed: true };

      await expect(plugin.flush()).resolves.toBeUndefined();
      expect(idbState.store.get(cacheId('Todo', TODO_ID_1))).toMatchObject({
        title: '毒草稿',
        meta: { fixed: true }
      });
    });

    it('毒草稿卡在队列里时，之后新建的草稿依然能落盘，discard 后 flush 恢复正常', async () => {
      const poisoned = newEventData(TODO_ID_1, { title: '毒草稿' });
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, poisoned);
      poisoned.patch!['boom'] = () => undefined;
      await expect(plugin.flush()).rejects.toBeInstanceOf(WorkspaceFlushError);

      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_2, { title: '后来的' }));
      await expect(plugin.flush()).rejects.toBeInstanceOf(WorkspaceFlushError);
      expect(idbState.store.get(cacheId('Todo', TODO_ID_2))).toMatchObject({ title: '后来的' });

      expect(plugin.discard(cacheId('Todo', TODO_ID_1))).toBe(true);
      await expect(plugin.flush()).resolves.toBeUndefined();
    });

    it('persists deletions from discard and create events', async () => {
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Discard' }));
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_2, { title: 'Create' }));
      await plugin.flush();

      plugin.discard(cacheId('Todo', TODO_ID_1));
      dispatch(rxdb, ENTITY_LOCAL_CREATE_EVENT, createEventData(TODO_ID_2));
      await plugin.flush();

      expect(idbState.store.has(cacheId('Todo', TODO_ID_1))).toBe(false);
      expect(idbState.store.has(cacheId('Todo', TODO_ID_2))).toBe(false);
    });

    it('纪元释放丢弃未落盘的排队变更时应 reject 挂起的 flush()，而非伪装成功', async () => {
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Unflushed' }));

      const flushPromise = plugin.flush();
      await scope.dispose();

      await expect(flushPromise).rejects.toThrow(/released with unflushed changes/);
      expect(setManyMock).not.toHaveBeenCalled();
    });

    it('已弃用的 destroy() 与释放作用域是同一条拆卸路径', async () => {
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Unflushed' }));

      const flushPromise = plugin.flush();
      await plugin.destroy();

      await expect(flushPromise).rejects.toThrow(/released with unflushed changes/);
      expect(rxdb.removeEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_NEW_EVENT, expect.any(Function));
      // 幂等：作用域已释放，再走一次不产生新动作
      await expect(scope.dispose()).resolves.toBeUndefined();
    });

    it('纪元释放期间存在挂起写入时应 reject 已注册的 flush() waiter', async () => {
      let resolveWrite: (() => void) | undefined;
      setManyMock.mockImplementationOnce(async items => {
        await new Promise<void>(resolve => {
          resolveWrite = resolve;
        });
        items.forEach(([key, value]) => idbState.store.set(key, value));
      });

      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'In-flight' }));
      await vi.waitFor(() => expect(resolveWrite).toBeTypeOf('function'));

      const flushPromise = plugin.flush();
      await Promise.resolve();

      // 写入还卡在半路时释放纪元：waiter 不能装作成功
      await scope.dispose();
      await expect(flushPromise).rejects.toThrow(/released with unflushed changes/);

      // 迟到的写入落回已释放的纪元，不得再唤醒任何人
      resolveWrite?.();
    });

    it('纪元释放之后调用 flush() 必须立即 fail-fast，而非永久挂起', async () => {
      await scope.dispose();

      await expect(plugin.flush()).rejects.toThrow(/not installed in the current connection epoch/);
    });
  });
});

describe('installation and lifecycle boundaries', () => {
  it('loads known and unknown entity drafts from IndexedDB', async () => {
    idbState.store.set(cacheId('Todo', TODO_ID_1), { id: TODO_ID_1, title: 'Known' });
    idbState.store.set(cacheId('Unknown', UNKNOWN_ID), { id: UNKNOWN_ID, title: 'Unknown' });
    const rxdb = createMockRxDB();
    rxdb.schemaManager.getEntityType.mockImplementation(entity => (entity === 'Todo' ? MockEntity : undefined));
    const { plugin, scope } = createScoped(rxdb);

    try {
      const installPromise = plugin.install(scope);
      expect(plugin.ready).toBe(installPromise);
      await plugin.ready;

      expect(plugin.cacheCount).toBe(2);
      expect(rxdb.entityManager.createEntityRef).toHaveBeenCalledTimes(1);
    } finally {
      await scope.dispose();
    }
  });

  it('首次 IndexedDB 读取失败后保留 rejected ready，并允许显式重试 install', async () => {
    entriesMock.mockRejectedValueOnce(new Error('indexeddb open failed'));
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb);

    try {
      const failed = plugin.install(scope);
      await expect(failed).rejects.toThrow('indexeddb open failed');
      await expect(plugin.ready).rejects.toThrow('indexeddb open failed');

      idbState.store.set(cacheId('Todo', TODO_ID_1), { id: TODO_ID_1, title: 'Recovered' });
      const retried = plugin.install(scope);
      expect(retried).not.toBe(failed);
      await expect(retried).resolves.toBeUndefined();
      expect(plugin.list()[0]?.data).toMatchObject({ title: 'Recovered' });
    } finally {
      await scope.dispose();
    }
  });

  it('恢复后段水合失败时不发布半份状态，修复后重试读取最新快照', async () => {
    const firstId = cacheId('Todo', TODO_ID_1);
    const secondId = cacheId('Todo', TODO_ID_2);
    idbState.store.set(42 as unknown as IDBValidKey, { title: '损坏记录' });
    idbState.store.set(firstId, { id: TODO_ID_1, title: '旧快照' });
    idbState.store.set(secondId, { id: TODO_ID_2, title: '触发失败' });
    const rxdb = createMockRxDB();
    rxdb.schemaManager.getEntityType.mockReturnValue(MockEntity);
    const firstRef = { id: TODO_ID_1, title: '旧快照' };
    rxdb.entityManager.createEntityRef.mockReturnValueOnce(firstRef).mockImplementationOnce(() => {
      throw new Error('hydrate failed');
    });
    const { plugin, scope } = createScoped(rxdb);

    try {
      await expect(plugin.install(scope)).rejects.toThrow('hydrate failed');

      expect(plugin.cacheCount).toBe(0);
      expect(plugin.corruptedEntries).toEqual([]);
      expect(rxdb.entityManager.removeEntityCache).toHaveBeenCalledWith(firstRef);

      idbState.store.set(firstId, { id: TODO_ID_1, title: '新快照' });
      idbState.store.delete(secondId);
      rxdb.entityManager.createEntityRef.mockImplementation((_EntityType, data) => ({ ...data }));

      await expect(plugin.install(scope)).resolves.toBeUndefined();
      expect(plugin.list()).toEqual([
        expect.objectContaining({ cacheId: firstId, data: expect.objectContaining({ title: '新快照' }) })
      ]);
      expect(plugin.corruptedEntries).toHaveLength(1);
    } finally {
      await scope.dispose();
    }
  });

  it('纪元之外没有 channel，跨 tab 消息无从送达；恢复只认 IndexedDB', async () => {
    vi.stubGlobal('BroadcastChannel', BroadcastChannelStub as unknown as typeof BroadcastChannel);
    const id = cacheId('Todo', TODO_ID_1);
    idbState.store.set(id, { id: TODO_ID_1, title: '旧草稿' });
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb, { autoSave: false });

    // channel 属于纪元：install() 之前它根本不存在，也就没有"漏收"这回事
    expect(BroadcastChannelStub.instances).toHaveLength(0);

    try {
      await plugin.install(scope);

      // 断连期间对端的删除会落在共享的 IndexedDB 上，恢复时自然读不到；
      // 这里 store 里仍有记录，说明没人删过，草稿就该原样回来
      expect(plugin.list()).toEqual([expect.objectContaining({ cacheId: id })]);
    } finally {
      await scope.dispose();
    }
  });

  // RWS-005：restore 把任意 `IDBValidKey` 强转成 `WorkspaceCacheId`，再直接 `(key as string).split(':')`。
  // 数字 key 会抛原生 TypeError，`install()` 失败后 `ready` **永久 rejected**，
  // 此后每一次 flush() 都先在 `await this.ready` 上失败 —— 一条坏记录让整个插件报废。
  it('一条损坏记录不得阻断其余合法草稿', async () => {
    idbState.store.set(42 as unknown as IDBValidKey, { id: TODO_ID_1, title: 'Numeric key' });
    idbState.store.set(cacheId('Todo', TODO_ID_1), { id: TODO_ID_1, title: 'Good' });
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb);

    try {
      await expect(plugin.install(scope)).resolves.toBeUndefined();
      await expect(plugin.ready).resolves.toBeUndefined();

      expect(plugin.cacheCount).toBe(1);
      expect(plugin.list()[0]?.data).toMatchObject({ title: 'Good' });
      expect(plugin.corruptedEntries).toHaveLength(1);
      expect(plugin.corruptedEntries[0]?.key).toBe(42);
      // flush 仍必须可用
      await expect(plugin.flush()).resolves.toBeUndefined();
    } finally {
      await scope.dispose();
    }
  });

  // 身份必须自洽：cacheId 里的 id 与 data.id 不一致时，早先会按 data.id 建实体缓存、
  // 却按 cacheId 的另一个 id 管理 workspace —— 同一条草稿被两个身份分别持有。
  it.each([
    ['缺少身份段', 'default::' + TODO_ID_1, { id: TODO_ID_1 }],
    ['非 UUID 的 id', 'default:Todo:not-a-uuid', { id: 'not-a-uuid' }],
    ['data.id 与 cacheId 不一致', 'default:Todo:' + TODO_ID_1, { id: TODO_ID_2 }],
    ['data 不是普通对象', 'default:Todo:' + TODO_ID_1, ['not', 'a', 'record']]
  ])('拒绝损坏的持久化记录：%s', async (_name, key, data) => {
    idbState.store.set(key as IDBValidKey, data);
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb);

    try {
      await plugin.install(scope);

      expect(plugin.cacheCount).toBe(0);
      expect(plugin.corruptedEntries).toHaveLength(1);
      expect(rxdb.entityManager.createEntityRef).not.toHaveBeenCalled();
    } finally {
      await scope.dispose();
    }
  });

  // RWS-003：`#restoreEntries()` 在 `await entries()` 之后不复核 `#destroyed`。
  // 数据库在读取期间被销毁时，destroy() 已清空缓存并关闭资源，
  // 旧快照随后仍会 createEntityRef 并重填两个 cache 集合 —— 已销毁实例被重新填充。
  it('destroy 期间完成的 restore 不得重新填充已销毁实例', async () => {
    let resolveEntries: ((value: Array<[IDBValidKey, unknown]>) => void) | undefined;
    entriesMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveEntries = resolve;
        })
    );
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb);

    const installPromise = plugin.install(scope);
    await scope.dispose();
    resolveEntries?.([[cacheId('Todo', TODO_ID_1), { id: TODO_ID_1, title: 'Late' }]]);
    await installPromise.catch(() => undefined);

    expect(plugin.cacheCount).toBe(0);
    expect(rxdb.entityManager.createEntityRef).not.toHaveBeenCalled();
  });

  it('does not overwrite a newer live draft with stale restore data', async () => {
    let resolveEntries: ((value: Array<[IDBValidKey, unknown]>) => void) | undefined;
    entriesMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveEntries = resolve;
        })
    );
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb);

    try {
      const installPromise = plugin.install(scope);
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Live draft' }));
      resolveEntries?.([[cacheId('Todo', TODO_ID_1), { id: TODO_ID_1, title: 'Stale draft' }]]);
      await installPromise;

      expect(plugin.list()[0]?.data).toMatchObject({ title: 'Live draft' });
    } finally {
      await scope.dispose();
    }
  });

  it('清理身份自洽的存量系统草稿，但保留伪系统坏记录', async () => {
    idbState.store.set('rxdb:RxDBBranch:main', { id: 'main', activated: true });
    idbState.store.set('rxdb:RxDBSync:public:Todo:main', { id: 'public:Todo:main' });
    idbState.store.set('rxdb:RxDBBranch:other', { id: 'mismatch', activated: false });
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb);

    try {
      await plugin.install(scope);

      expect(idbState.store.has('rxdb:RxDBBranch:main')).toBe(false);
      expect(idbState.store.has('rxdb:RxDBSync:public:Todo:main')).toBe(false);
      expect(idbState.store.has('rxdb:RxDBBranch:other')).toBe(true);
      expect(plugin.corruptedEntries).toEqual([
        { key: 'rxdb:RxDBBranch:other', reason: expect.stringContaining('不是合法 UUID') }
      ]);
    } finally {
      await scope.dispose();
    }
  });

  /**
   * `#restoreEntries` 只用 `#cache_entities.has()` 判「是否已被更新的实时草稿占用」，
   * 没看 `#need_delete_ids`。恢复窗口（IDB 异步读，启动期通常 10–100ms）内用户 discard 掉的草稿，
   * 会被旧快照重新写回内存并 `createEntityRef` —— 草稿「复活」；
   * 但它不在 `#need_save_entities` 里，随后的 flush 又把它从 IndexedDB 删掉。
   * 用户看到的是「删掉的草稿又回来了，重启后再次消失」。
   */
  it('恢复窗口内被 discard 的草稿不得复活', async () => {
    let resolveEntries: ((value: Array<[IDBValidKey, unknown]>) => void) | undefined;
    entriesMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveEntries = resolve;
        })
    );
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb);
    const id = cacheId('Todo', TODO_ID_1);

    try {
      const installPromise = plugin.install(scope);

      // 窗口内：草稿先出现（实时事件），再被用户丢弃
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Draft' }));
      expect(plugin.discard(id)).toBe(true);

      // IDB 旧快照仍含该草稿
      resolveEntries?.([[id, { id: TODO_ID_1, title: 'Draft' }]]);
      await installPromise;

      expect(plugin.list()).toEqual([]);
      expect(plugin.cacheCount).toBe(0);
    } finally {
      await scope.dispose();
    }
  });

  it.each([
    ['CREATE', ENTITY_LOCAL_CREATE_EVENT, createEventData],
    ['REMOVE', ENTITY_LOCAL_REMOVE_EVENT, removeEventData]
  ])('恢复窗口内先收到 %s 时不得复活旧草稿', async (_name, type, eventData) => {
    let resolveEntries: ((value: Array<[IDBValidKey, unknown]>) => void) | undefined;
    entriesMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveEntries = resolve;
        })
    );
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb, { autoSave: false });
    const id = cacheId('Todo', TODO_ID_1);
    const stored = { id: TODO_ID_1, title: '旧草稿' };
    idbState.store.set(id, stored);

    try {
      const installPromise = plugin.install(scope);
      dispatch(rxdb, type, eventData(TODO_ID_1));
      resolveEntries?.([[id, stored]]);
      await installPromise;

      expect(plugin.list()).toEqual([]);
      await plugin.flush();
      expect(idbState.store.has(id)).toBe(false);
    } finally {
      await scope.dispose();
    }
  });

  it('恢复窗口内的跨 tab remove 不得让旧草稿复活', async () => {
    vi.stubGlobal('BroadcastChannel', BroadcastChannelStub as unknown as typeof BroadcastChannel);
    let resolveEntries: ((value: Array<[IDBValidKey, unknown]>) => void) | undefined;
    entriesMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveEntries = resolve;
        })
    );
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb, { autoSave: false });
    const id = cacheId('Todo', TODO_ID_1);
    const stored = { id: TODO_ID_1, title: '旧草稿' };
    idbState.store.set(id, stored);

    try {
      // channel 由 install() 同步建起，restore 还悬着——这是最早能收到消息的时刻
      const installPromise = plugin.install(scope);
      const channel = BroadcastChannelStub.instances[0]!;
      channel.emit({ type: 'remove', clientId: 'peer', cacheId: id });
      resolveEntries?.([[id, stored]]);
      await installPromise;

      expect(plugin.list()).toEqual([]);
      await plugin.flush();
      expect(idbState.store.has(id)).toBe(false);
    } finally {
      await scope.dispose();
    }
  });

  it('BroadcastChannel 构造失败时已登记的那半资源退回，换个作用域即可重试', async () => {
    class ThrowingBroadcastChannel {
      constructor() {
        throw new DOMException('blocked', 'SecurityError');
      }
    }
    vi.stubGlobal('BroadcastChannel', ThrowingBroadcastChannel as unknown as typeof BroadcastChannel);
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb);

    // 身份属于注册期，构造时就发布；纪元资源获取失败不回收它
    expect(Object.getOwnPropertyDescriptor(rxdb, 'workspace')?.value).toBe(plugin);
    expect(() => plugin.install(scope)).toThrow(/blocked/);

    await scope.dispose();
    expect(idbState.stores[0]?.close).toHaveBeenCalledOnce();
    expect([...rxdb.listeners.values()].every(listeners => listeners.size === 0)).toBe(true);

    vi.stubGlobal('BroadcastChannel', BroadcastChannelStub as unknown as typeof BroadcastChannel);
    const retryScope = new LifecycleScope('workspace-spec-retry');
    try {
      await plugin.install(retryScope);
      expect(rxdb.addEventListener).toHaveBeenCalledTimes(3);
    } finally {
      await retryScope.dispose();
    }
  });

  it('clientId 生成失败时不留下一个没人关的 channel', async () => {
    vi.stubGlobal('BroadcastChannel', BroadcastChannelStub as unknown as typeof BroadcastChannel);
    // crypto.randomUUID 只在安全上下文里有，而 BroadcastChannel 在 http:// 页面照常存在——
    // 两者都要的这一条因此可能「channel 建成了、id 取不到」
    const randomUUID = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('crypto.randomUUID is not a function');
    });
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb);

    try {
      expect(() => plugin.install(scope)).toThrow(/randomUUID/);

      // 在 acquire 里取 id 的话，new 出来的 channel 不进清单，dispose() 够不着它
      expect(BroadcastChannelStub.instances).toHaveLength(0);

      await scope.dispose();
      expect(idbState.stores[0]?.close).toHaveBeenCalledOnce();
    } finally {
      // 本 spec 没有全局 restoreMocks，桩留着会毒到后面每一个建 channel 的用例
      randomUUID.mockRestore();
    }
  });

  it('workspace store 创建失败时不留残余，重试后 flush 正常完成', async () => {
    const rxdb = createMockRxDB();
    createWorkspaceStoreMock.mockImplementationOnce(() => {
      throw new Error('store unavailable');
    });
    const { plugin, scope } = createScoped(rxdb);

    expect(() => plugin.install(scope)).toThrow('store unavailable');
    expect(rxdb.addEventListener).not.toHaveBeenCalled();
    await scope.dispose();

    const retryScope = new LifecycleScope('workspace-spec-retry');
    try {
      await plugin.install(retryScope);
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'retry' }));
      await plugin.flush();
      expect(idbState.store.get(cacheId('Todo', TODO_ID_1))).toMatchObject({ title: 'retry' });
    } finally {
      await retryScope.dispose();
    }
  });

  it('BroadcastChannel 监听器注册失败时 channel 本身仍被关闭', async () => {
    class ThrowingListenerBroadcastChannel extends BroadcastChannelStub {
      override addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void) {
        super.addEventListener(type, listener);
        throw new Error('channel listener unavailable');
      }
    }
    vi.stubGlobal('BroadcastChannel', ThrowingListenerBroadcastChannel as unknown as typeof BroadcastChannel);
    const rxdb = createMockRxDB();
    const { plugin, scope } = createScoped(rxdb);

    expect(() => plugin.install(scope)).toThrow('channel listener unavailable');

    // 建 channel 与挂监听是两条登记：挂监听这条没进清单，建 channel 那条进了，
    // 所以 new 出来的 channel 依然有人关——这正是拆成两条的理由
    await scope.dispose();
    expect(BroadcastChannelStub.instances[0]?.close).toHaveBeenCalledOnce();
    expect(idbState.stores[0]?.close).toHaveBeenCalledOnce();
    expect([...rxdb.listeners.values()].every(listeners => listeners.size === 0)).toBe(true);
  });

  it.each([1, 2, 3])('第 %i 个 RxDB 监听器注册失败时完整回滚并允许重试', async failureAt => {
    vi.stubGlobal('BroadcastChannel', BroadcastChannelStub as unknown as typeof BroadcastChannel);
    const rxdb = createMockRxDB();
    const originalAddEventListener = rxdb.addEventListener.getMockImplementation()!;
    let callCount = 0;
    rxdb.addEventListener.mockImplementation((type, listener) => {
      callCount++;
      // 先抛再登记：真实 addEventListener 抛错意味着监听器没挂上去
      if (callCount === failureAt) throw new Error(`listener ${failureAt} unavailable`);
      originalAddEventListener(type, listener);
    });
    const { plugin, scope } = createScoped(rxdb);

    expect(() => plugin.install(scope)).toThrow(`listener ${failureAt} unavailable`);

    await scope.dispose();
    expect([...rxdb.listeners.values()].every(listeners => listeners.size === 0)).toBe(true);
    expect(BroadcastChannelStub.instances[0]?.close).toHaveBeenCalledOnce();
    expect(idbState.stores[0]?.close).toHaveBeenCalledOnce();

    rxdb.addEventListener.mockImplementation(originalAddEventListener);
    const retryScope = new LifecycleScope('workspace-spec-retry');
    try {
      await plugin.install(retryScope);
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'retry' }));
      await plugin.flush();
      expect(idbState.store.get(cacheId('Todo', TODO_ID_1))).toMatchObject({ title: 'retry' });
    } finally {
      await retryScope.dispose();
    }
  });

  it('workspace 属性发布失败时构造期没有任何资源需要回滚', async () => {
    vi.stubGlobal('BroadcastChannel', BroadcastChannelStub as unknown as typeof BroadcastChannel);
    const rxdb = createMockRxDB();
    let rejectWorkspaceDefinition = true;
    const proxiedRxDB = new Proxy(rxdb, {
      defineProperty(target, property, attributes) {
        if (property === 'workspace' && rejectWorkspaceDefinition) {
          rejectWorkspaceDefinition = false;
          return false;
        }
        return Reflect.defineProperty(target, property, attributes);
      }
    });

    expect(() => rxDBPluginWorkspace(asRxDB(proxiedRxDB))).toThrow(TypeError);
    expect(Object.hasOwn(rxdb, 'workspace')).toBe(false);
    // 发布身份是构造期唯一的宿主写入，失败时连 store 都还没建
    expect(idbState.stores).toHaveLength(0);
    expect(BroadcastChannelStub.instances).toHaveLength(0);
    expect([...rxdb.listeners.values()].every(listeners => listeners.size === 0)).toBe(true);

    const plugin = rxDBPluginWorkspace(asRxDB(proxiedRxDB)) as RxDBPluginWorkspace;
    const scope = new LifecycleScope('workspace-spec-retry');
    try {
      await plugin.install(scope);
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'retry' }));
      await plugin.flush();
      expect(idbState.store.get(cacheId('Todo', TODO_ID_1))).toMatchObject({ title: 'retry' });
    } finally {
      await scope.dispose();
    }
  });

  it('returns the installed instance from repeated factory calls without new listeners', async () => {
    const rxdb = createMockRxDB();
    const { plugin, scope, ready } = installScoped(rxdb);

    try {
      await ready;
      // 身份已发布，工厂只会把同一个实例交回来，不会重复获取纪元资源
      expect(rxDBPluginWorkspace(asRxDB(rxdb))).toBe(plugin);
      expect(rxdb.addEventListener).toHaveBeenCalledTimes(3);
    } finally {
      await scope.dispose();
    }
  });

  it('rejects direct duplicate construction before registering listeners', async () => {
    const rxdb = createMockRxDB();
    const { scope, ready } = installScoped(rxdb);

    try {
      await ready;
      expect(() => new RxDBPluginWorkspace(asRxDB(rxdb))).toThrow('workspace plugin is already installed');
      expect(rxdb.addEventListener).toHaveBeenCalledTimes(3);
    } finally {
      await scope.dispose();
    }
  });

  it('rejects an incompatible pre-existing workspace property without listeners', () => {
    const rxdb = createMockRxDB();
    Object.defineProperty(rxdb, 'workspace', { value: Object.freeze({}) });

    expect(() => rxDBPluginWorkspace(asRxDB(rxdb))).toThrow(
      'workspace plugin is already installed with an incompatible instance'
    );
    expect(rxdb.addEventListener).not.toHaveBeenCalled();
  });

  it('honors autoSave false until flush is explicitly requested', async () => {
    const rxdb = createMockRxDB();
    const { plugin, scope, ready } = installScoped(rxdb, { autoSave: false });

    try {
      await ready;
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'Manual flush' }));
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(setManyMock).not.toHaveBeenCalled();
      expect(idbState.store.size).toBe(0);

      await plugin.flush();
      expect(idbState.store.get(cacheId('Todo', TODO_ID_1))).toMatchObject({ title: 'Manual flush' });
    } finally {
      await scope.dispose();
    }
  });
});

describe('cross-tab synchronization', () => {
  beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', BroadcastChannelStub as unknown as typeof BroadcastChannel);
  });

  it('keeps and persists incoming drafts whose entity type is not registered yet', async () => {
    const rxdb = createMockRxDB();
    const { plugin, scope } = installScoped(rxdb);
    const channel = BroadcastChannelStub.instances[0]!;
    const unknownCacheId = cacheId('Unknown', UNKNOWN_ID);

    try {
      channel.emit({
        type: 'add',
        clientId: 'other-tab',
        cacheId: unknownCacheId,
        data: { id: UNKNOWN_ID, title: 'Lazy module draft' }
      });
      await plugin.flush();

      expect(plugin.list()).toEqual([
        expect.objectContaining({
          cacheId: unknownCacheId,
          data: expect.objectContaining({ title: 'Lazy module draft' })
        })
      ]);
      expect(idbState.store.get(unknownCacheId)).toMatchObject({ title: 'Lazy module draft' });
      expect(rxdb.entityManager.createEntityRef).not.toHaveBeenCalled();
    } finally {
      await scope.dispose();
    }
  });

  it('广播同步抛错时保留草稿、记录错误并继续派发后续监听器', async () => {
    const rxdb = createMockRxDB();
    const { plugin, scope } = installScoped(rxdb);
    const channel = BroadcastChannelStub.instances[0]!;
    const downstream = vi.fn();
    rxdb.addEventListener(ENTITY_LOCAL_NEW_EVENT, downstream);
    channel.postMessage.mockImplementation(() => {
      throw new DOMException('cannot clone', 'DataCloneError');
    });
    const event = newEventData(TODO_ID_1, { boom: () => undefined });

    try {
      expect(() => dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, event)).not.toThrow();
      expect(downstream).toHaveBeenCalledOnce();
      expect(plugin.cacheCount).toBe(1);
      expect(plugin.corruptedEntries).toEqual([
        { key: cacheId('Todo', TODO_ID_1), reason: expect.stringContaining('无法跨 tab 同步') }
      ]);
    } finally {
      await scope.dispose();
    }
  });

  /**
   * BroadcastChannel 的 payload 是结构化克隆后的**不可信输入**：灰度期新旧版本 tab 并存、
   * 或任意同源脚本发消息，都会直接落进 `msg.clientId` / `msg.cacheId.split(':')`。
   * 核心的 `RxDBTabsGateway` 对同一场景早有 `isGatewayMessage` / `isRxDBEventLike` 守卫，
   * 本插件却用裸 BroadcastChannel 另起炉灶。
   */
  it.each([
    ['null', null],
    ['空对象', {}],
    ['cacheId 非字符串', { type: 'add', clientId: 'x', cacheId: 123, data: {} }],
    ['cacheId 非三段式', { type: 'add', clientId: 'x', cacheId: 'bad', data: {} }],
    ['缺 clientId', { type: 'add', cacheId: 'public:Todo:id', data: {} }],
    ['add 缺 data', { type: 'add', clientId: 'x', cacheId: 'public:Todo:id' }],
    ['data 非对象', { type: 'add', clientId: 'x', cacheId: 'public:Todo:id', data: 'oops' }],
    ['未知 type', { type: 'evil', clientId: 'x', cacheId: 'public:Todo:id', data: {} }]
  ])('畸形跨 tab 消息（%s）必须被丢弃：不抛错、不写缓存、不持久化', async (_name, payload) => {
    const rxdb = createMockRxDB();
    const { plugin, scope } = installScoped(rxdb);
    const channel = BroadcastChannelStub.instances[0]!;

    try {
      expect(() => channel.emit(payload)).not.toThrow();
      await plugin.flush();

      expect(plugin.list()).toEqual([]);
      expect(idbState.store.size).toBe(0);
    } finally {
      await scope.dispose();
    }
  });

  it('释放纪元时清掉入站草稿并关闭 channel', async () => {
    const rxdb = createMockRxDB();
    const entityRef = { id: TODO_ID_1, title: 'Shared draft' };
    rxdb.schemaManager.getEntityType.mockReturnValue(MockEntity);
    rxdb.entityManager.getEntityRef.mockReturnValue(entityRef);
    const { plugin, scope } = installScoped(rxdb);
    const channel = BroadcastChannelStub.instances[0]!;
    const todoCacheId = cacheId('Todo', TODO_ID_1);

    channel.emit({
      type: 'add',
      clientId: 'other-tab',
      cacheId: todoCacheId,
      data: { id: TODO_ID_1, title: 'Shared draft' }
    });
    channel.emit({ type: 'remove', clientId: 'other-tab', cacheId: todoCacheId });
    await plugin.flush();
    await scope.dispose();

    expect(rxdb.entityManager.createEntityRef).toHaveBeenCalledOnce();
    expect(rxdb.entityManager.removeEntityCache).toHaveBeenCalledWith(entityRef);
    expect(plugin.cacheCount).toBe(0);
    expect(idbState.store.has(todoCacheId)).toBe(false);
    expect(channel.close).toHaveBeenCalledOnce();
  });

  // 不关这条连接，页面存活期间任何 indexedDB.deleteDatabase(dbName) 都会永久 blocked
  // —— DevTools「清理所有数据」误报 + 二次点击死寂的根因。
  it('释放纪元时归还 IndexedDB 连接', async () => {
    const rxdb = createMockRxDB();
    const { scope } = installScoped(rxdb);
    const store = idbState.stores.at(-1);

    expect(createWorkspaceStore).toHaveBeenCalledWith('test-db', 'workspace');

    await scope.dispose();

    expect(store?.close).toHaveBeenCalledOnce();
  });

  it('ignores sync messages from the same client and remove without entity cache', async () => {
    const rxdb = createMockRxDB();
    rxdb.schemaManager.getEntityType.mockReturnValue(MockEntity);
    rxdb.entityManager.getEntityRef.mockReturnValue(undefined);
    const { plugin, scope } = installScoped(rxdb);
    const channel = BroadcastChannelStub.instances[0]!;
    const todoCacheId = cacheId('Todo', TODO_ID_1);

    try {
      // 从出站消息中捕获 clientId。
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, newEventData(TODO_ID_1, { title: 'local' }));
      await vi.waitFor(() => expect(channel.postMessage).toHaveBeenCalled());
      const outbound = channel.postMessage.mock.calls[0]![0] as {
        type: string;
        clientId: string;
        cacheId: WorkspaceCacheId;
        data: Record<string, unknown>;
      };

      channel.emit({
        type: 'add',
        clientId: outbound.clientId,
        cacheId: todoCacheId,
        data: { id: TODO_ID_1, title: 'echo' }
      });
      expect(plugin.list()[0]?.data).toMatchObject({ title: 'local' });

      channel.emit({ type: 'remove', clientId: 'peer', cacheId: todoCacheId });
      expect(plugin.cacheCount).toBe(0);
      expect(rxdb.entityManager.removeEntityCache).not.toHaveBeenCalled();
    } finally {
      await scope.dispose();
    }
  });

  it('does not broadcast cross-tab originated NEW events', async () => {
    const rxdb = createMockRxDB();
    const { plugin, scope } = installScoped(rxdb);
    const channel = BroadcastChannelStub.instances[0]!;

    try {
      dispatch(rxdb, ENTITY_LOCAL_NEW_EVENT, {
        ...newEventData(TODO_ID_1, { title: 'from peer' }),
        origin: 'cross-tab'
      });
      await plugin.flush();
      expect(channel.postMessage).not.toHaveBeenCalled();
      expect(plugin.cacheCount).toBe(1);
    } finally {
      await scope.dispose();
    }
  });
});

describe('get_cache_id', () => {
  it('formats namespace, entity and id', () => {
    expect(get_cache_id(asLocalEventData(newEventData(TODO_ID_1)))).toBe(cacheId('Todo', TODO_ID_1));
  });
});
