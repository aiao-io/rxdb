/**
 * 适配器 guard（纯逻辑）。
 *
 * 在 `createRxDatabase` 阶段由插件构造函数调用：把 adapter 名解析成一个具体的搜索后端，
 * 解析不出来就直接抛 {@link SearchUnsupportedAdapterError}，不挂载 `.search`，
 * 不返回降级 handle。
 *
 * 判定规则不写在这里，而是集中在 {@link SEARCH_BACKEND_DESCRIPTORS}——本模块只是它的
 * 一层向后兼容外壳，保留 US-703 之前既有的两个导出形状。
 *
 * @packageDocumentation
 */

import { resolveSearchBackend, SEARCH_BACKEND_DESCRIPTORS } from '../backend/backend-registry.js';

/**
 * 当前版本受支持的 adapter 名单。
 *
 * 由 {@link SEARCH_BACKEND_DESCRIPTORS} 派生，只含 `status === 'supported'` 的条目。
 * 需要知道**为什么**某个 adapter 不在其中时，查 descriptor 而不是查这个集合——
 * 集合天然只能回答「在不在」。
 *
 * @public
 */
export const SUPPORTED_SEARCH_ADAPTERS: ReadonlySet<string> = new Set(
  SEARCH_BACKEND_DESCRIPTORS.filter(descriptor => descriptor.status === 'supported').map(
    descriptor => descriptor.adapter
  )
);

/**
 * 断言 adapter 能解析到一个可用的搜索后端。
 *
 * @param adapter - `rxdb.config.sync.local.adapter` 读出的 adapter key
 * @throws {SearchUnsupportedAdapterError} adapter 未配置、未登记或登记为待实测
 */
export const assertSupportedAdapter = (adapter: string | undefined): void => {
  resolveSearchBackend(adapter);
};
