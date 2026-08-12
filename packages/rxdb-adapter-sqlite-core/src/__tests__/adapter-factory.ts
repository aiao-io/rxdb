import type { RxDB } from '@aiao/rxdb';

/** 适配器工厂的清理目标：暴露 RxDB 实例供工厂释放资源。 */
export interface AdapterCleanupTarget {
  readonly rxdb: RxDB;
}

/** 测试参数化接口：由共享测试套件使用，为 wa-sqlite 和 sqliteai 后端创建适配器实例。 */
export interface AdapterFactory {
  /** 工厂显示名称（例如 'wa-sqlite'、'sqliteai'）。 */
  readonly name: string;

  createAdapter<T = unknown>(options?: Record<string, unknown>): Promise<T>;

  /** 创建用于底层测试的原始 SQLite 客户端。 */
  createClient<T = unknown>(dbName: string, options?: Record<string, unknown>): Promise<T>;

  cleanupAdapter?(adapter: AdapterCleanupTarget): void | Promise<void>;
}
