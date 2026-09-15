/**
 * 插件注册的作用域寿命（US-025 阶段 B：B1）。
 *
 * 这里守的是一条比「装上能用」更难看见的性质：引擎工厂是**带连接纪元作用域**注册的，
 * 纪元结束时必须跟着一起撤掉。不撤的话槽位里会留着一个指向已拆纪元的工厂 —— 断连后
 * 新建的 QueryCache 仓储照样拿得到会话，然后打向一批已经断开的适配器，表现为
 * 「查得到、但数据永远不动」，正是最难查的那类故障。
 *
 * **为什么不跑真的 `connect()` / `disconnectAll()`**：那条路要一个能跑完系统引导
 * （`migrateSystemSchema` / `completeBootstrap` / `createTables` / 分支表写入）的本地适配器，
 * 本包为此要么复制核心的 `MockLocalAdapter`、要么 devDepend 一个真适配器 —— 两样都是为
 * 「宿主会不会在断连时释放插件作用域」买单，而那件事已经由核心的
 * `RxDB.plugin-scope.spec.ts` 对所有插件一次性证明过了。本文件只证**本插件这一半**：
 * 拿到的 scope 被如实用上，释放后槽位回空。两半的接缝由下面
 * `lifecycle` / `inject` 两条断言钉住 —— 宿主正是按它们决定给什么作用域、在什么时候给。
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { LifecycleScope } from '@aiao/utils';
import { describe, expect, it } from 'vitest';
import { RxDBPluginQueryCache, rxDBPluginQueryCache } from '../plugin.js';
import { RxDBQueryCacheEngineFactory } from '../query-cache-engine.factory.js';

let sequence = 0;

/** 只建实例、不连接：本文件全程不碰适配器，`new RxDB()` 也不会去碰。 */
const createDatabase = (): RxDB => {
  sequence += 1;
  return new RxDB({
    dbName: `querycache-engine-scope-${sequence}`,
    entities: [],
    sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
  });
};

describe('US-025 B1：QueryCache 引擎随插件作用域登记与撤销', () => {
  it('没装插件时槽位是空的：核心自己不填任何默认实现', () => {
    expect(createDatabase().getQueryCacheEngine()).toBeUndefined();
  });

  it('install() 之后槽位里是本包的工厂', () => {
    const rxdb = createDatabase();
    const scope = new LifecycleScope('test-epoch');

    rxDBPluginQueryCache(rxdb).install(scope);

    expect(rxdb.getQueryCacheEngine()).toBeInstanceOf(RxDBQueryCacheEngineFactory);
  });

  it('作用域释放后注册跟着撤销，槽位回到空', async () => {
    const rxdb = createDatabase();
    const scope = new LifecycleScope('test-epoch');
    rxDBPluginQueryCache(rxdb).install(scope);

    await scope.dispose();

    expect(rxdb.getQueryCacheEngine()).toBeUndefined();
  });

  it('下一纪元装回一个全新的工厂，而不是复活上一纪元那个', async () => {
    const rxdb = createDatabase();
    const first = new LifecycleScope('epoch-1');
    rxDBPluginQueryCache(rxdb).install(first);
    const firstFactory = rxdb.getQueryCacheEngine();
    await first.dispose();

    const second = new LifecycleScope('epoch-2');
    rxDBPluginQueryCache(rxdb).install(second);

    const secondFactory = rxdb.getQueryCacheEngine();
    expect(secondFactory).toBeInstanceOf(RxDBQueryCacheEngineFactory);
    expect(secondFactory).not.toBe(firstFactory);
  });

  it('声明 scoped 且不声明 inject：宿主据此给纪元作用域，并把安装排在 B3 护栏之前', () => {
    const plugin = rxDBPluginQueryCache(createDatabase());

    expect(plugin).toBeInstanceOf(RxDBPluginQueryCache);
    // `scoped` 少一个，宿主释放完作用域还会补调一次废弃的 `destroy()`；
    // `inject` 多一条，安装就要等适配器就绪，排到 `connect()` 的缺插件护栏之后，
    // 装了插件的应用反而会被护栏误报（US-025 B3）。
    expect(plugin.lifecycle).toBe('scoped');
    expect(plugin.inject).toBeUndefined();
  });
});
