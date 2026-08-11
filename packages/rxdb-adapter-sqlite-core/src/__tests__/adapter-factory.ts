/**
 * AdapterFactory —— 测试参数化接口。
 *
 * 由共享测试套件使用，为 wa-sqlite 和 sqliteai 后端创建适配器实例。
 */
import type { RxDB } from '@aiao/rxdb';

export interface AdapterCleanupTarget {
  readonly rxdb: RxDB;
}

export interface AdapterFactory {
  /** 工厂显示名称（例如 'wa-sqlite'、'sqliteai'）。 */
  readonly name: string;

  /** 创建已配置的测试适配器实例。 */
  createAdapter<T = unknown>(options?: Record<string, unknown>): Promise<T>;

  /** 创建用于底层测试的原始 SQLite 客户端。 */
  createClient<T = unknown>(dbName: string, options?: Record<string, unknown>): Promise<T>;

  /** 释放适配器工厂持有的资源。 */
  cleanupAdapter?(adapter: AdapterCleanupTarget): void | Promise<void>;
}
