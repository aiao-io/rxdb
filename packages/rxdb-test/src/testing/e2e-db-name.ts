/**
 * @fileoverview Playwright e2e 与本地开发共用的数据库命名策略。
 *
 * @module @aiao/rxdb-test/testing/e2e-db-name
 */

const DEFAULT_E2E_STORAGE_KEY = '__aiao_e2e_db_name__';

/**
 * `getE2eDbName` 的可选配置。**默认值（不传 options）适合 React / Vue demo**：
 * - `storage`: `window.sessionStorage`
 * - `storageKey`: `__aiao_e2e_db_name__`
 * - `isE2e`: `Boolean(window.navigator.webdriver)`
 *
 * Angular demo 历史上用 `localStorage` 并加 e2e 端口检测（`location.port === '8200'`），
 * 通过传 options 复用同一 helper 而不破坏既有行为。
 */
export interface GetE2eDbNameOptions {
  /** 持久化隔离名的 Storage（默认 `sessionStorage`）。 */
  storage?: Storage;
  /** Storage key（默认 `__aiao_e2e_db_name__`）。 */
  storageKey?: string;
  /** 自定义 e2e 环境检测；返回 true 表示需要生成隔离名（默认仅看 webdriver）。 */
  isE2e?: () => boolean;
}

/**
 * 返回适合当前运行环境的数据库名。
 *
 * - **非 e2e 环境** → 直接返回 `defaultName`，便于跨刷新复用同一份本地数据，方便手动调试
 * - **e2e 环境** → 在指定 `storage` 缓存一个带时间戳/随机后缀的隔离名
 *   `{defaultName}_pw_{base36-time}_{base36-rand}`，保证不同 worker / spec 之间的
 *   OPFS 与 IndexedDB 不互相污染。同一 page 上下文内多次调用会拿到同一隔离名。
 * - **SSR / Node** → 直接返回 `defaultName`
 *
 * @param defaultName 非 e2e 环境直接使用的数据库名
 * @param options 见 {@link GetE2eDbNameOptions}
 * @returns 数据库名
 */
export function getE2eDbName(defaultName: string, options: GetE2eDbNameOptions = {}): string {
  if (typeof window === 'undefined') {
    return defaultName;
  }

  const isE2e = options.isE2e ?? (() => Boolean(window.navigator.webdriver));
  if (!isE2e()) {
    return defaultName;
  }

  const storage = options.storage ?? window.sessionStorage;
  const storageKey = options.storageKey ?? DEFAULT_E2E_STORAGE_KEY;
  const existing = storage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const dbName = `${defaultName}_pw_${suffix}`;
  storage.setItem(storageKey, dbName);
  return dbName;
}
