/**
 * 查询辅助（与核心包 `eq` / `inRule` 同语义）。
 *
 * @remarks
 * `field` 泛型收窄为字面量：返回对象直接满足 `FindOptions.where` 的
 * `StringKey<T>` 字段联合，生产构建的 partial 模板编译按此收窄。
 */
export const eq = <F extends string, V>(field: F, value: V) => ({
  combinator: 'and' as const,
  rules: [{ field, operator: '=' as const, value }]
});

export const inRule = <F extends string, V>(field: F, values: readonly V[]) => ({
  combinator: 'and' as const,
  rules: [{ field, operator: 'in' as const, value: [...values] }]
});
