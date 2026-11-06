import { activeGroupIds, type MenuNode } from '@aiao/rxdb-admin';
import type { Component } from 'vue';

type Node = MenuNode<Component>;

/**
 * 侧栏首次渲染时展开的分组：当前页所在分组 + 菜单声明 `expanded` 的分组。
 * @param nodes - 菜单树。
 * @param url - 当前地址。
 * @returns 展开的分组 id。
 */
export function initialOpen(nodes: readonly Node[], url: string): Set<string> {
  const open = new Set(activeGroupIds(nodes, url));
  const visit = (items: readonly Node[]): void => {
    for (const node of items) {
      if (node.expanded) open.add(node.id);
      visit(node.children ?? []);
    }
  };
  visit(nodes);
  return open;
}

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
