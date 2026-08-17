/**
 * @fileoverview 两个入口各自的导出面与依赖图门禁（US-504 AC#8）。
 *
 * @remarks
 * 主入口要能安全打进浏览器 bundle，桌面代码不能顺着依赖图跟进去。产物层的自动门禁
 * 已随 US-207 移除，因此这条约束在源码层守：从入口出发跟着相对 import 走一遍，
 * 图上不许出现 `node:` 内建，也不许出现桌面适配器。
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createDesktopStorageFilesystem, type DesktopStorageFilesystemOptions } from '../desktop.js';
import {
  createOpfsStorageFilesystem,
  isStorageNotFoundError,
  OpfsStorageFilesystem,
  rxDBPluginStorage,
  StorageBackendError,
  type StorageFilesystem,
  type StorageFilesystemContext,
  type StorageFilesystemFactory
} from '../index.js';

const SOURCE_ROOT = resolve(import.meta.dirname, '..');
const IMPORT_PATTERN = /from\s+'([^']+)'/g;

/**
 * 从入口出发跟着相对 import 走一遍，收集整棵图上出现过的模块说明符。
 *
 * @remarks
 * 正则捕不到 side-effect import（`import 'x'`）与动态 `import()`，因此这两种写法
 * 在本包的入口链路上一律避开 —— 用了就等于给这道门禁开了个洞。
 */
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

describe('主入口', () => {
  it('导出插件、后端接缝与错误载体', () => {
    expect(typeof rxDBPluginStorage).toBe('function');
    expect(typeof createOpfsStorageFilesystem).toBe('function');
    expect(typeof OpfsStorageFilesystem).toBe('function');
    expect(typeof isStorageNotFoundError).toBe('function');
    expect(typeof StorageBackendError).toBe('function');
    expectTypeOf<StorageFilesystem>().toMatchTypeOf<object>();
    expectTypeOf<StorageFilesystemContext>().toMatchTypeOf<object>();
    expectTypeOf<StorageFilesystemFactory>().toBeFunction();
  });

  // AC#8：桌面后端顺着依赖图跟进浏览器 bundle，隔离就只剩文档上的一句话。
  // 判据按前缀写：US-207 E2/E3 之后桌面运行时是两个包（electron / tauri），将来还会有
  // `pglite-electron` 这样的第三个——逐个点名的写法漏掉新包时是静默通过的。
  it('依赖图不触及桌面适配器', () => {
    const specifiers = [...collectSpecifiers(resolve(SOURCE_ROOT, 'index.ts'))];
    expect(specifiers.filter(specifier => /rxdb-adapter-(electron|tauri)/.test(specifier))).toEqual([]);
    expect(specifiers.filter(specifier => specifier.startsWith('node:'))).toEqual([]);
  });

  it('不从主入口再导出桌面后端', async () => {
    expect(Object.keys(await import('../index.js'))).not.toContain('createDesktopStorageFilesystem');
  });
});

describe('./desktop 子入口', () => {
  it('导出桌面后端工厂', () => {
    expect(typeof createDesktopStorageFilesystem).toBe('function');
    expectTypeOf<DesktopStorageFilesystemOptions>().toMatchTypeOf<object>();
  });

  // 桌面后端跑在 renderer 里，只能走 host 通道；直接摸 node: 内建就说明有人绕过了 IPC。
  it('依赖图不触及 Node 内建', () => {
    const specifiers = [...collectSpecifiers(resolve(SOURCE_ROOT, 'desktop.ts'))];
    expect(specifiers.filter(specifier => specifier.startsWith('node:'))).toEqual([]);
  });

  // 走的必须是协议层，而不是某一个运行时适配器包：本后端对 Electron 与 Tauri 一视同仁，
  // 依赖上哪一个都会逼另一端的用户装一个用不到的包（US-207 E3）。
  // `@aiao/rxdb-adapter-electron/host` 更是禁区——它会把 node:sqlite 一起拖进 renderer bundle。
  it('只依赖共享协议层', () => {
    const specifiers = [...collectSpecifiers(resolve(SOURCE_ROOT, 'desktop.ts'))];
    expect(specifiers).toContain('@aiao/rxdb-adapter-sqlite-core/desktop-host');
    expect(specifiers.filter(specifier => /rxdb-adapter-(electron|tauri)/.test(specifier))).toEqual([]);
  });
});
