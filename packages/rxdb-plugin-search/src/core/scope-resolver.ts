/**
 * 解析参与聚合的 collection 范围。
 *
 * 优先级（自上而下，逐级求交集）：
 * 1. `candidates`：拥有 `searchable` 字段（已通过 schema 校验）的 collection 名集合
 * 2. `excludedCollections`：插件级全局排除（{@link SearchPluginOptions.excludedCollections}）
 * 3. `requested`：单次调用 {@link SearchOptions.collections} 显式 allowlist；未传时等价 1∩2
 *
 * 该函数为纯逻辑（无副作用、无 DB 访问），便于单测覆盖与运行时复用。
 *
 * @public
 */
export interface ResolveScopeInput {
  readonly candidates: readonly string[];
  readonly excludedCollections?: readonly string[];
  readonly requested?: readonly string[];
}

/**
 * 计算最终参与搜索聚合的 collection 名列表（保持与 `candidates` 同序、去重）。
 *
 * 语义：
 * - `excludedCollections` 总是先生效（插件级硬排除）
 * - `requested` 只能进一步收窄（与 `excluded` 后剩余集合求交集）
 * - 若 `requested` 中包含 `candidates` 中不存在的名称，抛错并列出全部未知名称
 *   （fail-fast：拼错名字必须暴露，不能伪装成"无搜索结果"）
 * - 若 `requested` 非空但解析后范围为空（全部被排除），同样抛错
 * - 返回结果对调用方只读
 *
 * @public
 */
export function resolveSearchScope({
  candidates,
  excludedCollections,
  requested
}: ResolveScopeInput): readonly string[] {
  const excluded = new Set(excludedCollections ?? []);
  const allow = requested && requested.length > 0 ? new Set(requested) : null;
  if (allow) {
    const known = new Set(candidates);
    const unknown = [...allow].filter(name => !known.has(name));
    if (unknown.length > 0) {
      throw new Error(
        `[rxdb-plugin-search] unknown collection(s) in \`options.collections\`: ${unknown.join(', ')} — no searchable entity is registered under these names`
      );
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of candidates) {
    if (seen.has(name)) continue;
    if (excluded.has(name)) continue;
    if (allow && !allow.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  if (allow && out.length === 0) {
    throw new Error(
      `[rxdb-plugin-search] \`options.collections\` resolves to an empty scope: all requested collections are excluded via excludedCollections`
    );
  }
  return out;
}
