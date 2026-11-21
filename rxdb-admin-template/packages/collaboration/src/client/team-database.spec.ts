import { cloneEntityClasses, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openTeamDatabase, teamDatabaseName, type TeamDatabase, type TeamScope } from './team-database.js';
import { assetEntities, pgliteTeamFactory } from './team-entities.testing.js';

const scope: TeamScope = { userId: crypto.randomUUID(), teamId: 'team', appId: 'assets' };
const opened: TeamDatabase[] = [];
afterEach(async () => {
  for (const database of opened.splice(0)) await database.close();
});
/** 不合约定的工厂：在合约定的基础上改一处。 */
function factory(change: { init?: boolean; userId?: string; synced?: boolean; history?: boolean }) {
  return (given: TeamScope) => {
    const database = new RxDB({
      dbName: teamDatabaseName(`bad${Math.random().toString(36).slice(2, 8)}`, given),
      context: { userId: change.userId ?? given.userId },
      entities: cloneEntityClasses([...assetEntities]),
      sync:
        change.synced ?
          { local: { adapter: 'pglite' }, remote: { adapter: 'supabase' }, type: SyncType.Full }
        : { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    if (change.history !== false) database.use(rxDBPluginHistory);
    database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    if (change.init) database.init();
    return database;
  };
}

// 每个用例都要起 PGlite（WASM）：全量并行跑时冷启动会超过默认的 5 秒
vi.setConfig({ testTimeout: 30000 });
describe('团队库的库名：用户 × 团队 × 应用', () => {
  const uuid = () => crypto.randomUUID();
  it('前缀加作用域的 80 位散列：同一作用域永远同名，不同用户、团队或应用不共库，组合的切分方式不同也不撞名', () => {
    const scope = { userId: uuid(), teamId: uuid(), appId: 'assets' };
    const name = teamDatabaseName('admin-workbench', scope);
    expect(name).toMatch(/^admin-workbench-[0-9a-f]{20}$/);
    expect(teamDatabaseName('admin-workbench', { ...scope })).toBe(name);
    const names = new Set(
      [
        { userId: 'u1', teamId: 't1', appId: 'a1' },
        { userId: 'u2', teamId: 't1', appId: 'a1' },
        { userId: 'u1', teamId: 't2', appId: 'a1' },
        { userId: 'u1', teamId: 't1', appId: 'a2' },
        { userId: 'u1', teamId: 't1a', appId: '1' },
        { userId: 'u1t', teamId: '1', appId: 'a1' }
      ].map(item => teamDatabaseName('admin-workbench', item))
    );
    expect(names.size).toBe(6);
  });
  it('库名短到 sqlite-wasm 的 IndexedDB 文件系统放得下（回滚日志「<库名>@0_1.sqlite.db-journal」不超过 63 字节），也不含被当作 URL 协议的冒号', () => {
    const name = teamDatabaseName('admin-workbench-vue', { userId: uuid(), teamId: uuid(), appId: 'a'.repeat(128) });
    expect(`${name}@0_1.sqlite.db-journal`.length).toBeLessThanOrEqual(63);
    expect(name).not.toContain(':');
    expect(() => teamDatabaseName('x'.repeat(21), { userId: uuid(), teamId: uuid(), appId: 'assets' })).toThrow(
      '团队库配置不正确'
    );
    expect(() => teamDatabaseName('admin:workbench', { userId: uuid(), teamId: uuid(), appId: 'assets' })).toThrow(
      '团队库配置不正确'
    );
  });
});

describe('打开团队库：连接前装上 working-tree，空库上启用提交能力', () => {
  it('工厂交回未初始化的库：打开之后提交能力已启用、当前分支是镜像共享分支的 main，工作树干净', async () => {
    const database = await openTeamDatabase(pgliteTeamFactory(assetEntities), scope);
    opened.push(database);
    expect(database.scope).toEqual(scope);
    expect(await database.rxdb.workingTree.isEnabled()).toBe(true);
    expect(await database.currentBranch()).toBe('main');
    expect(await database.tree.status()).toMatchObject({ branchId: 'main', entryCount: 0 });
    expect(database.rxdb.config.context?.userId).toBe(scope.userId);
  });
  it.each([
    ['已经初始化过（working-tree 来不及在 init() 之前登记）', { init: true }],
    ['context.userId 不是当前用户', { userId: 'someone-else' }],
    ['库级同步不是 SyncType.None（导入拒绝写走通用同步的实体）', { synced: true }],
    ['没装 history 插件（切分支与从提交建分支要用它）', { history: false }]
  ])('不合约定的工厂一律拒绝：%s', async (_label, change) => {
    await expect(openTeamDatabase(factory(change), scope)).rejects.toMatchObject({
      code: 'configuration',
      message: '团队库配置不正确'
    });
  });
  it('拒绝时关闭已经建立的连接', async () => {
    const destroy = vi.spyOn(RxDB.prototype, 'destroy');
    await expect(openTeamDatabase(factory({ history: false }), scope)).rejects.toMatchObject({ code: 'configuration' });
    expect(destroy).toHaveBeenCalledTimes(1);
    destroy.mockRestore();
  });
  it('按记录写入当前分支：保留记录标识、按给定的实体顺序写，写入经捕获进入工作树并通知订阅者；退订之后不再通知', async () => {
    const database = await openTeamDatabase(pgliteTeamFactory(assetEntities), scope);
    opened.push(database);
    const written = vi.fn();
    const unsubscribe = database.onWrite(written);
    const [category, asset] = [crypto.randomUUID(), crypto.randomUUID()];
    await database.writeRecords(
      {
        [asset]: { entity: 'Asset', fields: { name: '笔记本', categoryId: category } },
        [category]: { entity: 'AssetCategory', fields: { name: '电脑' } }
      },
      ['AssetCategory', 'Asset', 'AssetEvent']
    );
    // 本地写入事件由适配器的变更管线在写入之后派发
    await vi.waitFor(() => expect(written).toHaveBeenCalled());
    expect(await database.tree.status()).toMatchObject({ entryCount: 2 });
    unsubscribe();
    written.mockClear();
    await database.writeRecords({ [crypto.randomUUID()]: { entity: 'AssetCategory', fields: { name: '桌椅' } } }, [
      'AssetCategory'
    ]);
    expect(await database.tree.status()).toMatchObject({ entryCount: 3 });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(written).not.toHaveBeenCalled();
    await expect(database.writeRecords({ x: { entity: 'Unknown', fields: {} } }, ['Unknown'])).rejects.toMatchObject({
      code: 'invalid',
      message: '实体不受支持'
    });
  });
});
