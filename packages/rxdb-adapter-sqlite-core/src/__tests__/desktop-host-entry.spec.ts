/**
 * `@aiao/rxdb-adapter-sqlite-core/desktop-host` 子路径的入口契约（US-207 E1）。
 *
 * @remarks
 * 这个子路径存在的**唯一**理由是「协议层要共享，但不能进主入口」：wa-sqlite / sqlite /
 * sqlite-wasm / pglite / miniprogram 五个下游包吃的是主入口，桌面协议对它们一行都用不上，
 * 却要跟着进 bundle。所以本文件的重点不是「导出了什么」，而是**两个方向都不许越界**：
 * 桌面符号不许出现在主入口，`node:` 内建不许出现在桌面入口（它要在浏览器 renderer 里加载）。
 */

import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';
import {
  DEFAULT_DATABASE_SUFFIX,
  DESKTOP_HOST_PROTOCOL_VERSION,
  DESKTOP_HOST_TRANSPORT_KEY,
  DesktopSqliteClient,
  RxDBAdapterDesktopError,
  assertDesktopSqliteStorage,
  assertValidDesktopDatabaseName,
  isDesktopHostFileRequestKind,
  isDesktopPgliteDirectoryStorage,
  isDesktopSqliteFileStorage,
  isRxDBAdapterDesktopErrorCode,
  parseDesktopHostRequest,
  resolveDesktopHostTransport,
  type DesktopHostTransport,
  type DesktopOptions,
  type DesktopStorage
} from '../desktop-host.js';

/** 只在桌面入口出现、绝不该被主入口捎带上的值导出。 */
const DESKTOP_ONLY_VALUE_EXPORTS = [
  'DEFAULT_DATABASE_SUFFIX',
  'DESKTOP_HOST_PROTOCOL_VERSION',
  'DESKTOP_HOST_TRANSPORT_KEY',
  'DesktopSqliteClient',
  'RxDBAdapterDesktopError',
  'assertDesktopSqliteStorage',
  'assertValidDesktopDatabaseName',
  'parseDesktopHostRequest',
  'resolveDesktopHostTransport'
];

describe('desktop-host subpath', () => {
  it('keeps the published desktop-host export on executable dist entries', () => {
    expect(packageJson.exports).toHaveProperty('./desktop-host');
    // `@aiao/source` 是构建期条件（US-601）：Node 的运行时解析器不认识这个条件名，
    // 因此它指向 `.ts` 不影响下面三条运行时条件仍然落在可执行的 dist 产物上。
    // 它的用途是让 api-surface.mjs 从一处真相源找到本子路径的源入口并纳入 API 基线。
    expect(Reflect.get(packageJson.exports, './desktop-host')).toEqual({
      '@aiao/source': './src/desktop-host.ts',
      types: './dist/desktop-host.d.ts',
      import: './dist/desktop-host.js',
      default: './dist/desktop-host.js'
    });
  });

  /**
   * 「不进主入口」是本子路径全部的存在理由。
   *
   * @remarks
   * 主入口某天顺手 `export * from './desktop-host.js'` 的话，构建照样绿、类型照样对，
   * 五个浏览器适配器的 bundle 里却多出了一整套它们永远不会调用的桌面协议——
   * 而这件事没有任何别的信号，所以只能在这里固定。
   */
  it('never leaks the desktop protocol into the main entry', async () => {
    const mainExports = Object.keys(await import('../index.js'));

    for (const name of DESKTOP_ONLY_VALUE_EXPORTS) expect(mainExports).not.toContain(name);
  });

  it('exposes the four halves of the desktop host contract', () => {
    // 选项与后缀
    expect(DEFAULT_DATABASE_SUFFIX).toBe('.sqlite3');
    // 线协议
    expect(DESKTOP_HOST_PROTOCOL_VERSION).toBe(1);
    expect(isDesktopHostFileRequestKind('file.open')).toBe(true);
    expect(parseDesktopHostRequest({ kind: 'handshake' })).toEqual({ kind: 'handshake' });
    // renderer client
    expect(DESKTOP_HOST_TRANSPORT_KEY).toBe('__aiaoRxdbDesktopHost__');
    expect(DesktopSqliteClient).toBeTypeOf('function');
    expect(resolveDesktopHostTransport).toBeTypeOf('function');
    // 存储联合与错误类型
    expect(isDesktopSqliteFileStorage({ engine: 'sqlite', databaseName: 'a.sqlite3' })).toBe(true);
    expect(isDesktopPgliteDirectoryStorage({ engine: 'pglite', dataDirectoryName: 'pgdata' })).toBe(true);
    expect(isRxDBAdapterDesktopErrorCode('protocol_violation')).toBe(true);
    expect(new RxDBAdapterDesktopError('open_failed', 'boom').code).toBe('open_failed');
  });

  it('re-exports the checks as live bindings rather than copies', () => {
    const storage: DesktopStorage = { engine: 'pglite', dataDirectoryName: 'pgdata' };

    expect(() => assertDesktopSqliteStorage(storage)).toThrowError(/^\[unsupported_runtime_engine\]/);
    expect(() => assertValidDesktopDatabaseName('../escape')).toThrowError(/^\[invalid_database_name\]/);
  });

  /**
   * 选项形状是**跨运行时**的，因此不含任何指认运行时的字段。
   *
   * @remarks
   * 曾经有过一个 `runtime?: 'electron' | 'tauri'`，US-207 E3 把它删了：适配器注册名
   * （`sqlite-electron` / `sqlite-tauri`）已经把运行时定死在包的身份里，再让调用方自报一次
   * 家门，只会多出「名字说 electron、字段说 tauri」这种自相矛盾的配置。
   */
  it('types the cross-runtime option shape without naming a runtime', () => {
    const options: DesktopOptions = { databaseName: `app${DEFAULT_DATABASE_SUFFIX}` };
    const transport: DesktopHostTransport = { request: () => Promise.resolve(null), subscribe: () => () => undefined };

    expect(options.databaseName).toBe('app.sqlite3');
    expect(transport.subscriptionReady).toBeUndefined();
    expect(Object.keys(options)).not.toContain('runtime');
  });
});
