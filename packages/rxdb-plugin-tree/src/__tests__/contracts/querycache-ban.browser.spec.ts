/**
 * @fileoverview `TreeRepository` 拒绝 `SyncType.QueryCache` 的注册期护栏（US-025 阶段 E）。
 *
 * @remarks
 * 这条限制原先硬编码在核心 `metadata-validate.ts` 的 `unsupportedTreeQueryCache` 规则里，
 * 搬出核心后改由插件在 `install()` 中通过 `unsupportedSyncTypes` 自行声明。搬家把**声明方**
 * 换了，护栏却没跟着换地方：核心那份 `entity-manager.querycache.spec.ts` 只测「核心能把任意
 * 仓储的声明翻成违规」（它用的是一个临时替身仓储，并在 TSDoc 里写明不该为了造违规去装插件），
 * 于是「树**确实**声明了这条限制」在搬家后没有任何用例盯着——把 `plugin.ts` 里的
 * `unsupportedSyncTypes` 整段删掉，全仓测试依然全绿。
 *
 * 这份用例补的就是那半边：断言经由**真实**的 `rxDBPluginTree` 安装后，树实体 + QueryCache
 * 在 `init()` 同步抛错。它住在插件包，因为只有这里同时拿得到 `@TreeEntity` 和核心。
 */
import { RxDB, SyncType, type EntitySyncOverride, type EntityType, type IRxDBAdapter } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { TreeEntity } from '../../entity/tree-entity.decorator.js';
import { rxDBPluginTree } from '../../plugin.js';

const createMockAdapter = (name: string): IRxDBAdapter =>
  ({
    name,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    version: vi.fn().mockResolvedValue('1.0.0'),
    isTableExisted: vi.fn().mockResolvedValue(false),
    createTables: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn()
  }) as unknown as IRxDBAdapter;

/** 实体级就写死 QueryCache */
@TreeEntity({
  name: 'CachedTreeNode',
  sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
})
class CachedTreeNode {}

/** 不写 `sync`：生效的是数据库级配置，走的是另一条取值路径 */
@TreeEntity({ name: 'InheritedTreeNode' })
class InheritedTreeNode {}

const createRxDB = (
  dbName: string,
  entities: EntityType[],
  type: SyncType.Full | SyncType.QueryCache,
  { withPlugin = true, syncOverrides }: { withPlugin?: boolean; syncOverrides?: EntitySyncOverride[] } = {}
) => {
  const rxdb = new RxDB({
    dbName,
    entities,
    sync: { type, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } },
    syncOverrides
  });
  rxdb.adapter('sqlite', () => createMockAdapter('sqlite'));
  rxdb.adapter('supabase', () => createMockAdapter('supabase'));
  if (withPlugin) rxdb.use(rxDBPluginTree);
  return rxdb;
};

describe('TreeRepository 不支持 SyncType.QueryCache', () => {
  it('实体级 QueryCache：init() 抛错，消息点名实体、仓储与策略', () => {
    const entities = [CachedTreeNode] as unknown as EntityType[];

    // 三段都要在，缺任何一段调用方都定位不到该改哪里：
    // 哪个实体违规、什么仓储撑不住、撑不住哪种策略。
    expect(() => createRxDB('tree-querycache-entity', entities, SyncType.Full).init()).toThrow(/CachedTreeNode/);
    expect(() => createRxDB('tree-querycache-entity', entities, SyncType.Full).init()).toThrow(
      /TreeRepository 不支持 SyncType\.QueryCache/
    );
    // 理由由插件提供，核心原样转发——断言它确实被转发出来了，而不是只报了个规则名。
    expect(() => createRxDB('tree-querycache-entity', entities, SyncType.Full).init()).toThrow(
      /改用 SyncType\.Full \/ Filter/
    );
  });

  it('库级 QueryCache：实体不写 sync 时同样拦下', () => {
    const entities = [InheritedTreeNode] as unknown as EntityType[];

    // 库级 sync 是实体缺省时的生效值，取值路径与实体级不同，得各测一次。
    expect(() => createRxDB('tree-querycache-db', entities, SyncType.QueryCache).init()).toThrow(
      /InheritedTreeNode.*TreeRepository 不支持 SyncType\.QueryCache/s
    );
  });

  it('SyncType.Full 放行——拦的是 QueryCache，不是「树 + 同步」', () => {
    const entities = [InheritedTreeNode] as unknown as EntityType[];

    // 少了这条，把 `unsupportedSyncTypes` 写成拦所有策略也能骗过上面两条。
    expect(() => createRxDB('tree-full-ok', entities, SyncType.Full).init()).not.toThrow();
  });

  it('限制由插件声明——不装插件时核心不认识这条规则', () => {
    const entities = [CachedTreeNode] as unknown as EntityType[];

    // 核心里不该再留 `unsupportedTreeQueryCache` 那种硬编码：不装插件时先炸的必须是
    // 「仓储没注册」，而不是「树不支持 QueryCache」——后者意味着核心又认识树了。
    expect(() => createRxDB('tree-no-plugin', entities, SyncType.Full, { withPlugin: false }).init()).toThrow(
      /Repository 'TreeRepository' not found/
    );
  });
});

/**
 * 实例级覆盖（US-026 AC#11）：护栏认的是**生效**策略，不是装饰器原值。
 *
 * 核心那份 `sync-override.spec.ts` 用的是替身仓储；这里经由真实的 `rxDBPluginTree` 再钉一次，
 * 防止树插件的声明与核心的生效配置解析之间出现只查原值的漏洞。
 */
describe('TreeRepository 按实例覆盖后的生效策略校验', () => {
  const QUERY_CACHE = {
    type: SyncType.QueryCache,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'supabase' }
  } as const;
  const FULL = { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } } as const;

  it('原声明合法、覆盖成 QueryCache：init() 拒绝', () => {
    const entities = [InheritedTreeNode] as unknown as EntityType[];
    const syncOverrides = [{ entity: InheritedTreeNode as unknown as EntityType, sync: QUERY_CACHE }];

    expect(() => createRxDB('tree-override-to-qc', entities, SyncType.Full, { syncOverrides }).init()).toThrow(
      /InheritedTreeNode.*TreeRepository 不支持 SyncType\.QueryCache/s
    );
  });

  it('原声明 QueryCache、覆盖成 Full：init() 放行', () => {
    const entities = [CachedTreeNode] as unknown as EntityType[];
    const syncOverrides = [{ entity: CachedTreeNode as unknown as EntityType, sync: FULL }];

    // 少了这条，只查装饰器原值的实现会在这里误报。
    expect(() => createRxDB('tree-override-to-full', entities, SyncType.Full, { syncOverrides }).init()).not.toThrow();
  });
});
