/**
 * 迁移记录 store（`RxDBPluginSearch#createMigrationStore`）回归测试。
 *
 * 这里刻意**不** mock `installFtsForEntity`——它是唯一会调用
 * `listInstallMigrationsForTable` 的地方，mock 掉就等于什么都没测。
 */
import { Entity, EntityBase, PropertyType, type RxDB } from '@aiao/rxdb';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core/search-engine.js', async () => {
  const actual = await vi.importActual<typeof import('../core/search-engine.js')>('../core/search-engine.js');
  return {
    ...actual,
    createSearchEngine: vi.fn(() => ({ search: vi.fn(async () => []) }))
  };
});

import { rxDBPluginSearch, type RxDBPluginSearch } from '../plugin.js';

@Entity({
  name: 'Article',
  tableName: 'article',
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'title', type: PropertyType.string, searchable: true }
  ]
})
class FakeArticle extends EntityBase {}

// 锚在物理表名（schema 限定）上，而非 entity 的 `tableName`
const INSTALL_PREFIX = 'fts5__public$article__v1__install__';

const buildFakeRxdb = (migrationRecords: { name: string }[] = []) => {
  const find = vi.fn(async () => migrationRecords);
  const create = vi.fn(async (entity: unknown) => entity);
  const rawQuery = vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] }));
  const adapter = {
    rawQuery,
    getRepository: vi.fn(() => ({ find, create })),
    bootstrapTransaction: async (
      fn: (tx: {
        query: typeof rawQuery;
        getRepository: () => { find: typeof find; create: typeof create };
      }) => Promise<unknown>
    ) => fn({ query: rawQuery, getRepository: () => ({ find, create }) })
  };
  const rxdb = {
    config: { sync: { local: { adapter: 'sqlite-wasm' } }, entities: [FakeArticle] },
    localAdapter$: new BehaviorSubject(adapter),
    connected$: new BehaviorSubject(true),
    adapterConnected$: () => new BehaviorSubject(true),
    connect: vi.fn(async () => adapter),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
  return { find, create, adapter, rxdb: rxdb as unknown as RxDB };
};

describe('search plugin migration store', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // P3-003：旧实现 `find({ rules: [] })` 全表扫迁移记录再在 JS 里 startsWith 过滤。
  // 迁移表随项目生命周期只增不减，安装期每张表都要拉一次全量 —— 前缀过滤必须下推到查询。
  it('pushes the install-name prefix filter down into the query instead of scanning all migrations', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    plugin.install();
    await plugin.ready;

    expect(fake.find).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [{ field: 'name', operator: 'startsWith', value: INSTALL_PREFIX }]
      }
    });
    plugin.destroy();
  });

  // 下推后仍要在 JS 侧做精确前缀复核：SQLite/PG 都把 `startsWith` 编译成不带 ESCAPE 的
  // `LIKE 'prefix%'`，而前缀里的 `_` 在 LIKE 语义下是「任意单字符」通配符。
  // 一旦放行了别表的记录，`installFtsForEntity` 会把它当成本表的历史签名，
  // 直接抛 SearchSchemaMismatchError —— 安装被误杀。
  it('drops records that match the LIKE wildcard but not the literal prefix', async () => {
    // 把前缀里的每个 `_` 换成 `!`：SQL 的 `LIKE 'prefix%'` 会放行，字面前缀不会
    const fake = buildFakeRxdb([{ name: 'fts5!!public$article!!v1!!install!!deadbeef' }]);
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    plugin.install();

    await expect(plugin.ready).resolves.toBeUndefined();
    plugin.destroy();
  });
});
