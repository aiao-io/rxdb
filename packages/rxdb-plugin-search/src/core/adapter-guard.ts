/**
 * 适配器 guard（纯逻辑）。
 *
 * 当前版本仅支持 `@aiao/rxdb-adapter-sqlite-wasm`；在 `createRxDatabase` 阶段
 * 插件构造函数调用本 guard，对非受支持 adapter 直接 throw
 * {@link SearchUnsupportedAdapterError}，不挂载 `.search`，不返回降级 handle。
 *
 * @packageDocumentation
 */

import { SearchUnsupportedAdapterError } from '../types.js';

/** 当前版本受支持的 adapter 名单 */
export const SUPPORTED_SEARCH_ADAPTERS = new Set<string>(['sqlite-wasm']);

/**
 * 断言 adapter 名称属于受支持名单。
 *
 * @param adapter - `rxdb.config.sync.local.adapter` 读出的 adapter key
 * @throws {@link SearchUnsupportedAdapterError} 当 adapter 未配置或不在白名单内
 */
export const assertSupportedAdapter = (adapter: string | undefined): void => {
  if (adapter === undefined || !SUPPORTED_SEARCH_ADAPTERS.has(adapter)) {
    throw new SearchUnsupportedAdapterError(adapter ?? 'unknown');
  }
};
