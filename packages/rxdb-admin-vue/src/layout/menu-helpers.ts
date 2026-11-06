import type { MenuNode } from '@aiao/rxdb-admin';
import type { Component } from 'vue';

type Node = MenuNode<Component>;

/**
 * 折叠为图标轨时压平菜单：只留叶子，分组之间用 `null` 作分隔。
 * @param nodes - 菜单树。
 * @returns 叶子与分隔符。
 */
export function railEntries(nodes: readonly Node[]): Array<Node | null> {
  const entries: Array<Node | null> = [];
  for (const node of nodes) {
    if (!node.children?.length) entries.push(node);
    else {
      if (entries.length > 0) entries.push(null);
      entries.push(...railEntries(node.children));
    }
  }
  return entries;
}
