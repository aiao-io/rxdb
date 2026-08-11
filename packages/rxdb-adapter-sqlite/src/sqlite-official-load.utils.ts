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
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { SqliteLoadOptions } from './sqlite-official.interface.js';

let cachedModule: Oo1Static | undefined;
/**
 * 缓存模块对应的加载指纹。
 *
 * @remarks
 * SQLI-001：早先只记一个布尔「是否用过 OPFS proxy patch」，
 * 于是不同 `wasmPath` / `opfsProxyPath` / `locateFile` 的后续调用会静默拿到首个模块。
 */
let cachedFingerprint: Oo1LoadFingerprint | undefined;

/** 清除官方 sqlite-wasm 模块缓存；仅供需要隔离模块状态的测试调用。 */
export function resetSqliteLoadCache(): void {
  cachedModule = undefined;
  cachedFingerprint = undefined;
}

/**
 * 加载并缓存官方 sqlite-wasm 的 oo1 模块。
 *
 * @remarks
 * 资源定位配置相同的调用共享模块；`wasmPath`、`opfsProxyPath` 或 `locateFile` 改变时重新初始化。
 * 浏览器 OPFS 模式需要 cross-origin isolation。传入的 worker URL 只在初始化期间临时改写。
 *
 * @param options - WASM 资源、日志、OPFS 与客户端性能选项
 * @returns 通过运行时结构校验的 oo1 模块
 * @throws 上游模块结构不兼容、WASM 初始化失败或 OPFS 环境不可用时抛错
 */
export async function sqliteLoad(options?: SqliteLoadOptions): Promise<Oo1Static> {
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
        const initFn = sqlite3InitModule as (opts: Record<string, unknown>) => Promise<unknown>;
        const loadedModule = await initFn(initOptions);
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
