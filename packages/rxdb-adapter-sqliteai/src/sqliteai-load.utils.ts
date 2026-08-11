import {
  assertOo1Static,
  buildOo1InitOptions,
  defaultWarn,
  isSameOo1LoadConfig,
  toOo1LoadFingerprint,
  withGlobalOo1LoadLock,
  withPatchedOpfsProxyWorker,
  withSqliteApiConfig,
  type Oo1LoadFingerprint,
  type Oo1Static
} from '@aiao/rxdb-adapter-sqlite-core';
import sqlite3InitModule from '@sqliteai/sqlite-wasm';
import type { SqliteaiLoadOptions } from './sqliteai.interface.js';

let cachedModule: Oo1Static | undefined;
/**
 * 缓存模块对应的加载指纹。
 *
 * @remarks
 * SQLAI-001：早先只记一个布尔「是否用过 OPFS proxy patch」，
 * 于是不同 `wasmPath` / `opfsProxyPath` / `locateFile` 的后续调用会静默拿到首个模块。
 */
let cachedFingerprint: Oo1LoadFingerprint | undefined;

/**
 * 清除模块级 SqliteAI WASM 缓存。
 *
 * 仅供测试使用：每个测试用例需要重新加载干净模块时调用，
 * 生产代码不应依赖这个钩子。
 */
export function resetSqliteaiLoadCache(): void {
  cachedModule = undefined;
  cachedFingerprint = undefined;
}

/**
 * 加载 SqliteAI WASM 模块（带模块级缓存）。
 *
 * 第一次调用会下载并初始化 WASM；之后调用复用缓存的 `Oo1Static`。
 * 若新调用需要 OPFS proxy patch 而缓存模块未启用过，会重新加载一次以应用 patch。
 *
 * @param options - 加载选项（含 OPFS / wasmPath / printErr 等）
 * @returns 共享的 `Oo1Static` 实例
 */
export async function sqliteaiLoad(options?: SqliteaiLoadOptions): Promise<Oo1Static> {
  const fingerprint = toOo1LoadFingerprint(options);
  // 只有「决定加载什么」的配置完全一致才复用缓存；否则重新加载。
  // 早先的缓存键只有一个布尔（是否用过 OPFS proxy patch），
  // 不同 wasmPath / opfsProxyPath / locateFile 会静默拿到首个模块。
  const cacheHit = (): Oo1Static | undefined =>
    cachedModule && cachedFingerprint && isSameOo1LoadConfig(cachedFingerprint, fingerprint) ? cachedModule : undefined;

  const hit = cacheHit();
  if (hit) {
    return hit;
  }

  return withGlobalOo1LoadLock(async () => {
    const lockedHit = cacheHit();
    if (lockedHit) {
      return lockedHit;
    }

    const initOptions = buildOo1InitOptions(options);
    const module = await withPatchedOpfsProxyWorker(options, async () => {
      return await withSqliteApiConfig({ warn: defaultWarn }, async () => {
        const loadedModule: unknown = await sqlite3InitModule(initOptions);
        assertOo1Static(loadedModule);
        return loadedModule;
      });
    });
    if (module.config) {
      module.config.warn = defaultWarn;
    }
    cachedModule = module;
    cachedFingerprint = fingerprint;
    return module;
  });
}
