/**
 * @fileoverview 插件装配契约
 *
 * 只测 `install()` 在宿主上接了哪几根线、断连时是否都拆干净。推拉本身的行为
 * 有各自的用例，这里不重复——本文件关心的是**接线**，装错了的症状是「功能全在、
 * 就是没人调它」，那种毛病从推拉的用例里一条都看不出来。
 *
 * 「重算待拉数」那两条是 US-025 阶段 D 从 `@aiao/rxdb-plugin-history` 的同名文件搬来的：
 * `refreshPullableCount` 随实现进了本包，接住 `requestPullableRefresh()` 于是也归本插件。
 */

import { type Plugin, RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncManager } from '../SyncManager.js';
import { rxDBPluginSync } from '../plugin.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

// 不复用 `createTestDB()`：那个夹具总是两个插件一起装，而本文件恰恰要测「只装一个会怎样」。
//
// `connect()` 那一句不是走个过场：本插件声明了 `inject: ['plugin:history']`，于是它的
// `install()` 不在 `init()` 里跑——要等历史插件自己装完、状态转 `active`，宿主再对齐一趟
// 才轮到它。`connect()` 内部 `await` 了调度器 settle，是这条链唯一的公开静止点。
// 少了它，下面每一条断言都在和一串微任务赛跑，赢了才算数的断言不是断言。
const createDB = async (plugins: ReadonlyArray<Plugin<object>>): Promise<RxDB> => {
  const rxdb = new RxDB({
    dbName: `plugin-spec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
  });
  const adapter = createMockAdapter(rxdb);
  rxdb.adapter('sqlite', () => adapter);
  for (const plugin of plugins) rxdb.use(plugin);
  rxdb.init();
  await rxdb.connect('sqlite');
  return rxdb;
};

describe('rxDBPluginSync 装配', () => {
  let refreshPullableCount: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    refreshPullableCount = vi.fn(async () => 0);
    vi.spyOn(SyncManager.prototype, 'refreshPullableCount').mockImplementation(
      refreshPullableCount as unknown as SyncManager['refreshPullableCount']
    );
  });

  it('装上插件才有 syncManager 槽位', async () => {
    const rxdb = await createDB([rxDBPluginHistory, rxDBPluginSync]);

    expect(rxdb.syncManager).toBeInstanceOf(SyncManager);
    await rxdb.disconnectAll();
  });

  // `inject: ['plugin:history']` 的实情判据。核心对缺失依赖不抛也不兜底：插件停在
  // `waiting`，槽位根本不存在。写这一条是因为「没装历史」在真实工程里表现为用户以为
  // 装了同步——`rxdb.syncManager.pull()` 报的是 `undefined` 上取属性，不是「缺依赖」。
  it('缺了历史插件就不装，槽位不存在，宿主点名一次', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => void 0);

    const rxdb = await createDB([rxDBPluginSync]);

    expect(rxdb.syncManager).toBeUndefined();
    // 「槽位不存在」是必要的，但光有它，用户看到的仍然只是一句 `undefined` 上取属性。
    // 依赖来源尘埃落定之后宿主会点名，这一条把那行诊断也钉住。
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Plugin 'sync' is not installed"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('plugin:history'));
    await rxdb.disconnectAll();
  });

  // 远端适配器在实时订阅恢复后按 `syncState.requestPullableRefresh()` 发信号，
  // 它不认识 `SyncManager`；接住这一跳正是本插件的活。
  it('把 syncState 的重算待拉数请求接到 syncManager 上', async () => {
    const rxdb = await createDB([rxDBPluginHistory, rxDBPluginSync]);

    rxdb.syncState.requestPullableRefresh();

    expect(refreshPullableCount).toHaveBeenCalledOnce();
    await rxdb.disconnectAll();
  });

  // 跳板约定「回调不得抛出」。重算失败只说明这一次读数没刷新，下一次实时恢复还会再请求；
  // 让它冒出去会炸在适配器的订阅恢复路径上，那条路径没有调用方接得住。
  it('重算失败只告警，不把错误抛回跳板', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => void 0);
    refreshPullableCount.mockRejectedValue(new Error('remote down'));
    const rxdb = await createDB([rxDBPluginHistory, rxDBPluginSync]);

    expect(() => rxdb.syncState.requestPullableRefresh()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('remote down'));
    await rxdb.disconnectAll();
  });

  // 拆线不干净的症状是断连之后请求打在一个已 `destroy()` 的管理器上：
  // 它的事件总线、订阅都拆了，再调只会抛在一条没人接的异步路径里。
  it('断连之后请求不再落到已拆的 syncManager 上', async () => {
    const rxdb = await createDB([rxDBPluginHistory, rxDBPluginSync]);
    await rxdb.disconnectAll();

    rxdb.syncState.requestPullableRefresh();

    expect(refreshPullableCount).not.toHaveBeenCalled();
  });

  it('断连之后槽位连同管理器一起撤掉', async () => {
    const rxdb = await createDB([rxDBPluginHistory, rxDBPluginSync]);
    const destroy = vi.spyOn(rxdb.syncManager, 'destroy');

    await rxdb.disconnectAll();

    expect(destroy).toHaveBeenCalledOnce();
    expect(Reflect.has(rxdb, 'syncManager')).toBe(false);
  });

  // US-025 D2。判据走**真实的** `window` 事件而不是 spy `watch()`：要证的是「浏览器说
  // 网断了，库知道了」这条链通没通，而不是某个方法被调过。核心自己不消费这两个事件 ——
  // 唯一的消费者是本插件的同步监听器（`wakeup$` 驱动回推重试），所以宿主监听的开关
  // 跟着本插件的作用域走。
  describe('浏览器可达性事件', () => {
    it('装上插件才收 offline 事件', async () => {
      const rxdb = await createDB([rxDBPluginHistory, rxDBPluginSync]);

      globalThis.dispatchEvent(new Event('offline'));

      expect(rxdb.reachability.online).toBe(false);
      await rxdb.disconnectAll();
    });

    // 没装同步的库压根不回推，收了这个事件也无事可做；而监听器是挂在 `globalThis` 上的，
    // 活得比实例还久 —— 每 new 一个 RxDB 就永久多一对，正是 D2 要掐掉的那条。
    it('没装插件就不收：offline 事件打不动可达性', async () => {
      const rxdb = await createDB([]);

      globalThis.dispatchEvent(new Event('offline'));

      expect(rxdb.reachability.online).toBe(true);
      await rxdb.disconnectAll();
    });

    it('断连之后不再收：监听随作用域一起摘掉', async () => {
      const rxdb = await createDB([rxDBPluginHistory, rxDBPluginSync]);
      await rxdb.disconnectAll();

      globalThis.dispatchEvent(new Event('offline'));

      expect(rxdb.reachability.online).toBe(true);
    });
  });
});
