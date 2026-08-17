import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createDesktopFileHost,
  createDesktopSqliteHost,
  isDesktopHostFileRequestKind,
  NodeSqliteEngine,
  parseDesktopHostFileRequest,
  parseDesktopHostRequest
} from '../host.js';
import {
  DESKTOP_ADAPTER_NAME,
  DESKTOP_DEFAULT_DATABASE_SUFFIX,
  DESKTOP_HOST_PROTOCOL_VERSION,
  DESKTOP_HOST_TRANSPORT_KEY,
  DesktopSqliteClient,
  resolveDesktopHostTransport,
  RxDBAdapterDesktop,
  RxDBAdapterDesktopError,
  type DesktopHostTransport,
  type DesktopOptions
} from '../index.js';

const SOURCE_ROOT = resolve(import.meta.dirname, '..');
const IMPORT_PATTERN = /from\s+'([^']+)'/g;

/**
 * 走图时要跟进去的**工作区内**说明符。
 *
 * @remarks
 * US-207 E1 把线协议、renderer client、存储联合与错误类型下沉到了共享层，于是 renderer
 * 的依赖图有一截不在本包里了。只按相对路径走图的话，那一截就成了盲区——共享层某天引进
 * `node:fs`，下面两条断言照样是绿的，而 renderer bundle 已经被污染了。
 * 因此把这个子路径也解析成源码继续走。
 *
 * 主入口 `@aiao/rxdb-adapter-sqlite-core` 不在此列：它从来就在本 guard 的射程之外，
 * 且五个下游浏览器适配器一直在吃它，浏览器可用性由它们自己那套 e2e 守着。
 */
const WORKSPACE_ENTRIES: ReadonlyMap<string, string> = new Map([
  ['@aiao/rxdb-adapter-sqlite-core/desktop-host', resolve(SOURCE_ROOT, '../../rxdb-adapter-sqlite-core/src/desktop-host.ts')]
]);

/** 从入口出发跟着相对 import（与共享层子路径）走一遍，收集整棵图上出现过的模块说明符。 */
const collectSpecifiers = (entry: string, seen = new Set<string>(), specifiers = new Set<string>()): Set<string> => {
  if (seen.has(entry)) return specifiers;
  seen.add(entry);
  const source = readFileSync(entry, 'utf8');
  for (const [, specifier] of source.matchAll(IMPORT_PATTERN)) {
    specifiers.add(specifier);
    const workspaceEntry = WORKSPACE_ENTRIES.get(specifier);
    if (workspaceEntry) collectSpecifiers(workspaceEntry, seen, specifiers);
    if (!specifier.startsWith('.')) continue;
    collectSpecifiers(resolve(dirname(entry), specifier.replace(/\.js$/, '.ts')), seen, specifiers);
  }
  return specifiers;
};

describe('renderer entry', () => {
  it('exposes the adapter, the client and the transport contract', () => {
    expect(DESKTOP_ADAPTER_NAME).toBe('desktop');
    expect(DESKTOP_DEFAULT_DATABASE_SUFFIX).toBe('.sqlite3');
    expect(DESKTOP_HOST_PROTOCOL_VERSION).toBe(1);
    expect(DESKTOP_HOST_TRANSPORT_KEY).toBe('__aiaoRxdbDesktopHost__');
    expect(typeof RxDBAdapterDesktop).toBe('function');
    expect(typeof DesktopSqliteClient).toBe('function');
    expect(typeof resolveDesktopHostTransport).toBe('function');
    expect(typeof RxDBAdapterDesktopError).toBe('function');
    expectTypeOf<DesktopOptions>().toMatchTypeOf<object>();
    expectTypeOf<DesktopHostTransport>().toMatchTypeOf<object>();
  });

  // AC#3：renderer bundle 里出现 node:sqlite 就等于把文件系统能力还给了渲染进程
  it('never reaches node:sqlite from the renderer entry', () => {
    expect([...collectSpecifiers(resolve(SOURCE_ROOT, 'index.ts'))]).not.toContain('node:sqlite');
  });

  it('keeps every Node builtin behind the host entry', () => {
    const rendererSpecifiers = [...collectSpecifiers(resolve(SOURCE_ROOT, 'index.ts'))];
    expect(rendererSpecifiers.filter(specifier => specifier.startsWith('node:'))).toEqual([]);
  });
});

describe('host entry', () => {
  it('exposes the host factory, the engine and the request validator', () => {
    expect(typeof createDesktopSqliteHost).toBe('function');
    expect(typeof NodeSqliteEngine).toBe('function');
    expect(typeof parseDesktopHostRequest).toBe('function');
  });

  // US-504：文件 host 与它的分派判据同样只在特权侧
  it('exposes the file host and the dispatch predicate', () => {
    expect(typeof createDesktopFileHost).toBe('function');
    expect(typeof parseDesktopHostFileRequest).toBe('function');
    expect(isDesktopHostFileRequestKind('file.open')).toBe(true);
    expect(isDesktopHostFileRequestKind('execute')).toBe(false);
  });

  // 特权侧的东西泄漏到 renderer 入口，隔离就只剩文档上的一句话
  it('does not re-export the host factories from the renderer entry', async () => {
    const rendererExports = Object.keys(await import('../index.js'));
    expect(rendererExports).not.toContain('createDesktopSqliteHost');
    expect(rendererExports).not.toContain('createDesktopFileHost');
  });
});
