/**
 * @fileoverview 红测试：跨连接的能力启用通知（顺延 1 / D-1，FR-037）的**插件这一半**。
 *
 * @remarks
 * 网关那一半在 `@aiao/rxdb` 的 `__tests__/gateway/capability-propagation.spec.ts`：它只负责
 * 把「某个能力刚被启用」送到同源的其他连接。送到之后**装钩子**是本包的事——核心读不到
 * `CommitCapabilityState`，也不知道该装什么运行时。
 *
 * 被补的漏洞长这样：A、B 两条连接都连在一个尚未启用的库上，谁都没装捕获（那正是 FR-046
 * 要的「零行为差异」）。A 调 `enable()`，只给**自己那个** adapter 装上了钩子；B 的能力位是
 * 连接期读的那一份，此后 B 的每一次 `save()` 都不产生 `WorkingTreeEntry`——而且
 * **一条错误都不会有**，要等到某次 `status()` / `commit()` 少了一批改动才看得出来。
 *
 * 几条容易写错的地方，各对应下面一条用例：
 *
 * 1. **监听器最容易挂在 `bootstrapExisting()` 里**——那里手边就有 adapter，看着最顺。
 *    但它**只在既有库上调**（见 `RxDBSystemContribution.bootstrapExisting` 的 @remarks）：
 *    建库的那个 tab 一次都不会走到，于是「A 建库、B 连上、B 启用」这条排列下 A 永远收不到。
 *    所以监听器只能挂在 `install()`——每条连接都会走到它。
 * 2. **装钩子最容易写成 `await firstValueFrom(rxdb.localAdapter$)`**。让出一个微任务看着无害，
 *    可那个缝隙里的写入照样不留痕迹，而这条通道存在的全部意义就是「下一次写之前装上」。
 * 3. **能力名最容易不比对**。本库将来不止一个能力贡献方，收到谁的通知都装工作树捕获，
 *    等于把一个别人的启用事件变成本能力的接通。
 * 4. **未连接的实例上最容易抛**。事件什么时候来不由接收方决定，一条在断连期间飘到的通知
 *    不该变成异常——那正是 `RxDB.localAdapterIfConnected` 不抛的理由。
 * 5. **摘监听器最容易漏**。它登记在连接纪元的作用域里，断连即退场；漏摘的话，下一纪元
 *    会有两个监听器，各自指着自己那一代的适配器。
 */

import { CapabilityEnabledEvent, RxDB, RxDBBranch, SyncType, type EntityType } from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKING_TREE_CAPABILITY } from '../../capability-identity.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  await Promise.all(pending.map(database => database.disconnectAll()));
  vi.restoreAllMocks();
});

/** 只替换点名实体的仓库，其余原样走 fixture 的默认桩。 */
const stubRepositories = (adapter: MockLocalAdapter, rows: ReadonlyMap<EntityType, object[]>): void => {
  const defaultGetRepository = adapter.getRepository.getMockImplementation();
  adapter.getRepository.mockImplementation(EntityType => {
    const stubbed = rows.get(EntityType);
    if (!stubbed) return defaultGetRepository?.(EntityType) as never;
    return {
      find: vi.fn(async () => stubbed),
      count: vi.fn(async () => stubbed.length),
      create: vi.fn(async (entity: object) => entity),
      update: vi.fn(async (entity: object) => entity),
      remove: vi.fn(async (entity: object) => entity)
    } as never;
  });
};

interface Scene {
  readonly database: RxDB;
  readonly adapter: MockLocalAdapter;
}

/**
 * 造一条连在**未启用**的既有库上的连接——也就是 B 的处境。
 *
 * @remarks
 * `isTableExisted` 为真走既有库路径，能力行用 fixture 默认那一行（`enabled: false`），
 * 于是 `bootstrapExisting()` 读完就返回，一个钩子都不装。这正是本组用例的起点：
 * 「adapter 上此刻没有捕获钩子」不是布置出来的，是产品行为本身。
 */
const createScene = async (): Promise<Scene> => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-plugin-capability-listener-${databaseSequence}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  const adapter = createMockAdapter(database);
  vi.mocked(adapter.isTableExisted).mockResolvedValue(true);
  stubRepositories(adapter, new Map<EntityType, object[]>([[RxDBBranch, []]]));
  database.adapter('local', () => adapter);
  database.use(rxDBPluginWorkingTree);
  database.init();
  databases.add(database);
  await database.connect('local');
  return { database, adapter };
};

describe('另一条连接启用能力后，本连接在下一次写之前接通（顺延 1 / FR-037）', () => {
  it('收到 CAPABILITY_ENABLED 之后，捕获钩子就装在本纪元的适配器上了', async () => {
    const { database, adapter } = await createScene();
    // 起点由产品行为决定：未启用的库 bootstrapExisting 一个钩子都不装（FR-046）。
    expect(adapter.workingTreeCaptureHook).toBeUndefined();

    database.dispatchEvent(new CapabilityEnabledEvent(WORKING_TREE_CAPABILITY));

    expect(adapter.workingTreeCaptureHook).toBeDefined();
  });

  it('装钩子发生在派发的同一个同步块里——不能让出微任务', async () => {
    const { database, adapter } = await createScene();

    database.dispatchEvent(new CapabilityEnabledEvent(WORKING_TREE_CAPABILITY));

    // 不 await 任何东西就断言：`await firstValueFrom(localAdapter$)` 的实现会在这里仍是
    // undefined，而那个微任务缝隙里的写入正是这条通道要救的东西。
    expect(adapter.workingTreeCaptureHook).toBeDefined();
  });

  it('别人的能力名一概不理', async () => {
    const { database, adapter } = await createScene();

    database.dispatchEvent(new CapabilityEnabledEvent('someOtherCapability'));

    expect(adapter.workingTreeCaptureHook).toBeUndefined();
  });

  it('重复收到是幂等的——能力位是只进不退的闩，装第二遍不该炸', async () => {
    const { database, adapter } = await createScene();

    database.dispatchEvent(new CapabilityEnabledEvent(WORKING_TREE_CAPABILITY));
    const first = adapter.workingTreeCaptureHook;
    database.dispatchEvent(new CapabilityEnabledEvent(WORKING_TREE_CAPABILITY));

    expect(first).toBeDefined();
    expect(adapter.workingTreeCaptureHook).toBeDefined();
  });

  it('尚未连接的实例上收到通知既不抛也不装', () => {
    databaseSequence += 1;
    const database = new RxDB({
      dbName: `rxdb-plugin-capability-listener-${databaseSequence}`,
      entities: [],
      sync: { local: { adapter: 'local' }, type: SyncType.None }
    });
    const adapter = createMockAdapter(database);
    database.adapter('local', () => adapter);
    database.use(rxDBPluginWorkingTree);
    database.init();
    databases.add(database);

    expect(() => database.dispatchEvent(new CapabilityEnabledEvent(WORKING_TREE_CAPABILITY))).not.toThrow();
    expect(adapter.workingTreeCaptureHook).toBeUndefined();
  });

  it('断连期间飘到的通知装不上——那时没有「本纪元的适配器」可言', async () => {
    const { database, adapter } = await createScene();

    await database.disconnectAll();
    database.dispatchEvent(new CapabilityEnabledEvent(WORKING_TREE_CAPABILITY));

    expect(adapter.workingTreeCaptureHook).toBeUndefined();
  });

  it('断连重连之后只有一个监听器——摘不干净的话，下一纪元会装两遍', async () => {
    const { database, adapter } = await createScene();

    await database.disconnectAll();
    await database.connect('local');
    // 断言装载**次数**而不是「钩子在不在」：漏摘的监听器装的是同一个运行时形状，
    // 只看结果的话两个监听器与一个监听器长得一模一样。
    const installSpy = vi.spyOn(adapter, 'setWorkingTreeCaptureHook');
    database.dispatchEvent(new CapabilityEnabledEvent(WORKING_TREE_CAPABILITY));

    expect(installSpy).toHaveBeenCalledTimes(1);
  });
});
