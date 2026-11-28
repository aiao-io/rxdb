import { getEntityMetadata, SyncType, type RxDB, type RxDBIdentity } from '@aiao/rxdb';
import { teamDatabaseName, type TeamScope } from '@rxdb-admin-template/collaboration';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { appConfig } from '../app-config';
import { ENTITIES } from '../entities/asset-entities';
import { createWorkbenchDatabase } from './setup_rxdb';
import { createTeamDatabase } from './team-database';

/** 一个团队任务场景的作用域：用户是 UUID，团队与应用是不含冒号的短标识。 */
const scope: TeamScope = { userId: '0191b2c4-7f3a-7c1e-9d4b-2a6f8e1c5b30', teamId: 'team-north', appId: 'assets' };
/** 协作包交给工厂的身份：后端取自全局会话，主体是作用域里的用户（ADMIN-US-222）。 */
const identityOf = (given: TeamScope): RxDBIdentity => ({ scope: 'https://project.supabase.co', subject: given.userId });

const opened: RxDB[] = [];

/** 创建团队库并登记，用例结束统一销毁。 */
function create(given: TeamScope = scope): RxDB {
  const database = createTeamDatabase(given, identityOf(given));
  opened.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map(database => database.destroy()));
});

describe('团队库工厂', () => {
  it('库名是协作包按作用域算出的短库名：应用的库名前缀加用户、团队与应用的散列（sqlite-wasm 的路径放得下）', () => {
    const { dbName } = create().config;
    expect(dbName.startsWith(`${appConfig.dbName}-`)).toBe(true);
    expect(dbName.startsWith(teamDatabaseName(appConfig.dbName, scope))).toBe(true);
    expect(`${dbName}.sqlite.db-journal`.length).toBeLessThanOrEqual(63);
  });

  it('不同的用户、团队或应用各是一个库，互不共用', () => {
    const names = [
      scope,
      { ...scope, userId: '0191b2c4-7f3a-7c1e-9d4b-2a6f8e1c5b31' },
      { ...scope, teamId: 'team-south' },
      { ...scope, appId: 'tickets' }
    ].map(given => create(given).config.dbName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('数据库上下文的用户是作用域里的真实用户，不是匿名本机身份', () => {
    const database = create();
    expect(database.config.context?.userId).toBe(scope.userId);
    expect(database.context.userId).toBe(scope.userId);
  });

  it('库按协作包交给它的身份绑定：换了账号就打不开别人的团队库（ADMIN-US-222）', () => {
    expect(create().config.identity).toEqual(identityOf(scope));
  });

  it('实体是业务实体的克隆：类不同、元数据的名称与命名空间一一相同，每次调用各克隆一份', () => {
    const first = create().config.entities;
    const second = create().config.entities;
    expect(first).toHaveLength(ENTITIES.length);
    ENTITIES.forEach((original, index) => {
      const clone = first[index];
      if (!clone) throw new Error('团队库缺少实体');
      expect(clone).not.toBe(original);
      expect(clone.prototype).toBeInstanceOf(original);
      const expected = getEntityMetadata(original);
      const actual = getEntityMetadata(clone);
      expect({ name: actual.name, namespace: actual.namespace }).toEqual({
        name: expected.name,
        namespace: expected.namespace
      });
      expect(second[index]).not.toBe(clone);
    });
  });

  it('库级同步关闭，本地适配器是 sqlite-wasm', () => {
    const { sync } = create().config;
    expect(sync.type).toBe(SyncType.None);
    expect(sync.local?.adapter).toBe('sqlite-wasm');
  });

  it('只装 history 插件，不装 working-tree、搜索与活动索引', () => {
    const database = create();
    expect(database.getPlugins('history')).toHaveLength(1);
    // working-tree 由协作包在连接前装上；搜索与活动索引是匿名工作台的功能
    for (const name of ['workingTree', 'search', 'workbench-activity-index'])
      expect(database.getPlugins(name)).toEqual([]);
  });

  it('返回的库尚未初始化，也没有连接适配器', async () => {
    const database = create();
    expect(database.initialized).toBe(false);
    expect(await firstValueFrom(database.adapterConnected$('sqlite-wasm'))).toBe(false);
  });

  it('适配器与匿名工作台完全相同：主线程 + IndexedDB，取得适配器不会提前连接空库', async () => {
    const team = create();
    const workbench = createWorkbenchDatabase(appConfig, identityOf(scope));
    try {
      const [teamAdapter, workbenchAdapter] = await Promise.all([
        team.getAdapter('sqlite-wasm'),
        workbench.getAdapter('sqlite-wasm')
      ]);
      expect(teamAdapter.options).toEqual(workbenchAdapter.options);
      expect(teamAdapter.options.vfs).toBe('idb');
      expect(teamAdapter.options.wasmUrl).toBe(new URL('sqlite-wasm/wa-sqlite-async.wasm', document.baseURI).href);
      expect(teamAdapter.options.worker).not.toBe(true);
      expect(teamAdapter.options.sharedWorker).not.toBe(true);
      expect(await firstValueFrom(team.adapterConnected$(teamAdapter.name))).toBe(false);
    } finally {
      await workbench.destroy();
    }
    // 取得适配器会冷导入 SQLite 后端模块（按需加载本身就是设计），全量并行跑时可能超过默认的 5 秒用例时限
  }, 30_000);
});
