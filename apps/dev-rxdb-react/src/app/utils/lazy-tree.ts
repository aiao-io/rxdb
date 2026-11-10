/** 已加载子树里某节点的全部后代 id（按 `parentId → childIds` 映射深度优先取）。 */
export function collectLoadedDescendants(childrenMap: ReadonlyMap<string, readonly string[]>, id: string): string[] {
  const result: string[] = [];
  const visit = (parentId: string): void => {
    for (const childId of childrenMap.get(parentId) ?? []) {
      result.push(childId);
      visit(childId);
    }
  };
  visit(id);
  return result;
}

/** 返回去掉一组 id 之后的新集合。 */
export function withoutIds(set: ReadonlySet<string>, ids: ReadonlySet<string>): Set<string> {
  return new Set([...set].filter(id => !ids.has(id)));
}
