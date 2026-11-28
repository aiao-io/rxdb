import { getRxDBIdentityDatabaseName, RxDB, type RxDBIdentity } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appConfig } from '../app-config';
import setupRxdb, {
  ANONYMOUS_LOCAL_USER_ID,
  createWorkbenchDatabase,
  E2E_DATABASE_BASE_KEY,
  workbenchBaseName
} from './setup_rxdb';

/** 一个登录账号的本机库身份：后端是 Supabase 项目的 origin，主体是账号 id（ADMIN-US-222）。 */
const alice: RxDBIdentity = { scope: 'https://project.supabase.co', subject: '0191b2c4-7f3a-7c1e-9d4b-2a6f8e1c5b30' };
const bob: RxDBIdentity = { ...alice, subject: '0191b2c4-7f3a-7c1e-9d4b-2a6f8e1c5b31' };
/**
 * sqlite-wasm 的 IndexedDB 文件系统里库的回滚日志路径：至多 63 字节，否则 `sqlite3_open_v2` 打不开。
 * RxDB 的 `config.dbName` 已带上 `@0_1`，按身份算出的名字还要补上它。
 */
const journalPath = (dbName: string) => `${dbName.includes('@') ? dbName : `${dbName}@0_1`}.sqlite.db-journal`;
/** 平常（不是自动化测试）的浏览器：基础名就是配置的库名。 */
const ordinaryBrowser = () => vi.spyOn(window.navigator, 'webdriver', 'get').mockReturnValue(false);

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.removeItem(E2E_DATABASE_BASE_KEY);
});

describe('工作台数据库启动', () => {
  it('重复进入应用仍复用同一数据库，只初始化一次', async () => {
    vi.stubEnv('DEV', false);
    const init = vi.spyOn(RxDB.prototype, 'init');
    const database = setupRxdb();
    try {
      expect(setupRxdb()).toBe(database);
      expect(init).toHaveBeenCalledTimes(1);
      expect(await firstValueFrom(database.adapterConnected$('sqlite-wasm'))).toBe(false);
      // 本应用的测试环境里 import.meta.env.DEV 打桩无效（恒为 true），setupRxdb() 会不等待地启动开发工具的懒加载；
      // 不等它加载完，文件结束、环境销毁时模块链还在加载，全量并行跑偶发 EnvironmentTeardownError
      await vi.dynamicImportSettled();
    } finally {
      await database.destroy();
      init.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('匿名本机身份保持历史取值，数据库上下文使用同一个常量', async () => {
    // 已有本机库的历史与活动记录都以 'userId' 归属；改值会让这些记录脱离当前身份
    expect(ANONYMOUS_LOCAL_USER_ID).toBe('userId');
    const database = createWorkbenchDatabase(appConfig, alice);
    try {
      expect(database.context.userId).toBe(ANONYMOUS_LOCAL_USER_ID);
    } finally {
      await database.destroy();
    }
  });

  it('默认适配器保留主线程 IndexedDB 组合，取得实例不会提前连接空库', async () => {
    const database = createWorkbenchDatabase(appConfig, alice);
    try {
      const adapter = await database.getAdapter('sqlite-wasm');
      const { RxDBAdapterSqlite } = await import('@aiao/rxdb-adapter-sqlite-wasm');
      expect(adapter).toBeInstanceOf(RxDBAdapterSqlite);
      expect(adapter.name).toBe(database.config.sync.local?.adapter);
      expect(adapter.options.vfs).toBe('idb');
      expect(adapter.options.wasmUrl).toBe(new URL('sqlite-wasm/wa-sqlite-async.wasm', document.baseURI).href);
      expect(adapter.options.worker).not.toBe(true);
      expect(adapter.options.sharedWorker).not.toBe(true);
      expect(adapter.options.workerInstance).toBeUndefined();
      expect(adapter.options.sharedWorkerInstance).toBeUndefined();
      expect(await firstValueFrom(database.adapterConnected$(adapter.name))).toBe(false);
    } finally {
      await database.destroy();
    }
  });
});

describe('工作台库按账号隔离（ADMIN-US-222）', () => {
  it('库名由账号的身份派生：应用的库名加身份摘要，库记下这份身份；名字里没有账号 id，sqlite-wasm 打得开', async () => {
    ordinaryBrowser();
    const database = createWorkbenchDatabase(appConfig, alice);
    try {
      expect(database.config.dbName.startsWith(getRxDBIdentityDatabaseName(appConfig.dbName, alice))).toBe(true);
      expect(database.config.dbName.startsWith(`${appConfig.dbName}-`)).toBe(true);
      expect(database.config.dbName).not.toContain(alice.subject);
      expect(journalPath(database.config.dbName).length).toBeLessThanOrEqual(63);
      expect(database.config.identity).toEqual(alice);
    } finally {
      await database.destroy();
    }
  });

  it('换一个账号就是另一个库；同一个账号永远是同一个库', async () => {
    const databases = [alice, bob, alice].map(identity => createWorkbenchDatabase(appConfig, identity));
    try {
      const [first, other, again] = databases.map(database => database.config.dbName);
      expect(other).not.toBe(first);
      expect(again).toBe(first);
    } finally {
      await Promise.all(databases.map(database => database.destroy()));
    }
  });

  it('没有身份（未登录）时是占位实例：不注册本地适配器，连接当场报错；也不叫旧的设备共用库名', async () => {
    const database = createWorkbenchDatabase(appConfig, null);
    try {
      expect(database.config.dbName.split('@')[0]).not.toBe(appConfig.dbName);
      expect(database.config.identity).toBeUndefined();
      await expect(database.connect('sqlite-wasm')).rejects.toThrow();
    } finally {
      await database.destroy();
    }
  });

  it('自动化测试里每个浏览器上下文一个短基础名，存在 sessionStorage 的同一个键里；按身份派生之后 sqlite-wasm 仍打得开', () => {
    vi.spyOn(window.navigator, 'webdriver', 'get').mockReturnValue(true);
    const base = workbenchBaseName(appConfig);
    expect(base).not.toBe(appConfig.dbName);
    expect(workbenchBaseName(appConfig)).toBe(base);
    expect(sessionStorage.getItem(E2E_DATABASE_BASE_KEY)).toBe(base);
    expect(journalPath(getRxDBIdentityDatabaseName(base, alice)).length).toBeLessThanOrEqual(63);
    sessionStorage.removeItem(E2E_DATABASE_BASE_KEY);
    expect(workbenchBaseName(appConfig)).not.toBe(base);
  });

  it('不是自动化测试时基础名就是应用配置的库名', () => {
    ordinaryBrowser();
    expect(workbenchBaseName(appConfig)).toBe(appConfig.dbName);
    expect(sessionStorage.getItem(E2E_DATABASE_BASE_KEY)).toBeNull();
  });

  it('默认按全局会话本机记下的身份建库（首屏之前，不联网）', async () => {
    ordinaryBrowser();
    localStorage.setItem(
      'admin-collaboration-config:/collaboration-api',
      JSON.stringify({ supabaseUrl: 'https://project.supabase.co', supabaseKey: 'public' })
    );
    localStorage.setItem(
      'admin-collaboration-grant:/collaboration-api',
      JSON.stringify({ user: { id: alice.subject, email: 'alice@example.test', verified: true }, expiresAt: Date.now() + 60_000 })
    );
    const database = createWorkbenchDatabase();
    try {
      expect(database.config.identity).toEqual(alice);
      expect(database.config.dbName.startsWith(getRxDBIdentityDatabaseName(appConfig.dbName, alice))).toBe(true);
    } finally {
      await database.destroy();
      localStorage.removeItem('admin-collaboration-config:/collaboration-api');
      localStorage.removeItem('admin-collaboration-grant:/collaboration-api');
    }
  });
});
