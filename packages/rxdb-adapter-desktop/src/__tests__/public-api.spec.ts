import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DESKTOP_ADAPTER_NAME,
  DESKTOP_DEFAULT_DATABASE_SUFFIX,
  DESKTOP_HOST_PROTOCOL_VERSION,
  DESKTOP_HOST_TRANSPORT_KEY,
  DesktopSqliteClient,
  RxDBAdapterDesktop,
  RxDBAdapterDesktopError,
  resolveDesktopHostTransport,
  type DesktopHostTransport,
  type DesktopOptions
} from '../index.js';
import { createDesktopSqliteHost, NodeSqliteEngine, parseDesktopHostRequest } from '../host.js';

const SOURCE_ROOT = resolve(import.meta.dirname, '..');
const IMPORT_PATTERN = /from\s+'([^']+)'/g;

/** 从入口出发跟着相对 import 走一遍，收集整棵图上出现过的模块说明符。 */
const collectSpecifiers = (entry: string, seen = new Set<string>(), specifiers = new Set<string>()): Set<string> => {
  if (seen.has(entry)) return specifiers;
  seen.add(entry);
  const source = readFileSync(entry, 'utf8');
  for (const [, specifier] of source.matchAll(IMPORT_PATTERN)) {
    specifiers.add(specifier);
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

  // 特权侧的东西泄漏到 renderer 入口，隔离就只剩文档上的一句话
  it('does not re-export the host factory from the renderer entry', async () => {
    expect(Object.keys(await import('../index.js'))).not.toContain('createDesktopSqliteHost');
  });
});
