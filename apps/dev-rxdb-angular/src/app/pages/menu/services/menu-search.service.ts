import type { RxDBEntityId } from '@aiao/rxdb';
import { Injectable } from '@angular/core';

interface SearchableMenu {
  id: RxDBEntityId;
  title: string;
  parentId?: RxDBEntityId | null;
}

/**
 * MenuSearchService
 * 提供菜单搜索和过滤功能
 */
@Injectable({
  providedIn: 'root'
})
export class MenuSearchService {
  /**
   * 过滤树节点，返回匹配的菜单ID集合
   * @param menus 所有菜单数据
   * @param keyword 搜索关键词
   * @returns 匹配的菜单ID集合
   */
  filterTreeNodes<T extends SearchableMenu>(menus: readonly T[], keyword: string): Set<RxDBEntityId> {
    const trimmedKeyword = keyword.trim().toLowerCase();
    if (!trimmedKeyword) return new Set();

    const matchedIds = new Set<RxDBEntityId>();

    menus.forEach(menu => {
      if (menu.title.toLowerCase().includes(trimmedKeyword)) {
        matchedIds.add(menu.id);
      }
    });

    return matchedIds;
  }

  /**
   * 展开所有匹配项的祖先节点
   * @param menus 所有菜单数据
   * @param matchedIds 匹配的菜单ID集合
   * @returns 需要展开的菜单ID集合（包括所有祖先节点）
   */
  expandMatchedAncestors<T extends SearchableMenu>(
    menus: readonly T[],
    matchedIds: Set<RxDBEntityId>
  ): Set<RxDBEntityId> {
    const menuById = new Map<RxDBEntityId, T>(menus.map(menu => [menu.id, menu]));
    const toExpand = new Set<RxDBEntityId>();

    matchedIds.forEach(menuId => {
      const visited = new Set<RxDBEntityId>([menuId]);
      let current = menuById.get(menuId);

      while (current?.parentId != null && !visited.has(current.parentId)) {
        const parent = menuById.get(current.parentId);
        if (!parent) break;
        visited.add(parent.id);
        toExpand.add(parent.id);
        current = parent;
      }
    });

    return toExpand;
  }

  /**
   * 检查菜单或其任意子孙节点是否匹配搜索
   * @param menuId 菜单ID
   * @param menus 所有菜单数据
   * @param matchedIds 匹配的菜单ID集合
   * @returns 是否应该显示该菜单
   */
  shouldShowMenu<T extends SearchableMenu>(
    menuId: RxDBEntityId,
    menus: readonly T[],
    matchedIds: Set<RxDBEntityId>
  ): boolean {
    if (matchedIds.has(menuId)) return true;

    const childrenByParentId = new Map<RxDBEntityId | null, T[]>();
    menus.forEach(menu => {
      const parentId = menu.parentId ?? null;
      const siblings = childrenByParentId.get(parentId) ?? [];
      siblings.push(menu);
      childrenByParentId.set(parentId, siblings);
    });
    const visited = new Set<RxDBEntityId>();
    const hasMatchedDescendant = (id: RxDBEntityId): boolean => {
      if (visited.has(id)) return false;
      visited.add(id);
      return (childrenByParentId.get(id) ?? []).some(
        child => matchedIds.has(child.id) || hasMatchedDescendant(child.id)
      );
    };

    return hasMatchedDescendant(menuId);
  }
}
