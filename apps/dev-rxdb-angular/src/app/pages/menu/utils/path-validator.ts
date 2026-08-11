import type { RxDBEntityId } from '@aiao/rxdb';
import { Injectable } from '@angular/core';

export interface PathMenu {
  id: RxDBEntityId;
  title: string;
  parentId?: RxDBEntityId | null;
}

/**
 * 路径冲突检查结果
 */
export interface PathConflict {
  /** 是否存在冲突 */
  hasConflict: boolean;
  /** 冲突的完整路径 */
  conflictPath?: string;
  /** 冲突的菜单节点 */
  conflictMenu?: PathMenu;
}

/**
 * PathValidatorService - 路径验证服务
 *
 * 功能：
 * - 检查同级节点中是否存在同名菜单
 * - 构建完整路径（从根到当前节点）
 * - 提供路径冲突警告信息
 */
@Injectable({
  providedIn: 'root'
})
export class PathValidatorService {
  /**
   * 检查路径冲突
   *
   * @param title - 待检查的菜单标题
   * @param parentId - 父节点 ID（null 表示根节点）
   * @param allMenus - 所有菜单列表
   * @param excludeId - 排除的菜单 ID（编辑时排除自身）
   * @returns 路径冲突检查结果
   */
  checkPathConflict(
    title: string,
    parentId: RxDBEntityId | null,
    allMenus: readonly PathMenu[],
    excludeId?: RxDBEntityId
  ): PathConflict {
    // 查找同级同名节点
    const siblings = allMenus.filter(m => {
      const isSameParent = (m.parentId ?? null) === parentId;
      const isSameTitle = m.title.toLowerCase() === title.toLowerCase();
      const isNotExcluded = excludeId == null || m.id !== excludeId;
      return isSameParent && isSameTitle && isNotExcluded;
    });

    if (siblings.length === 0) {
      return { hasConflict: false };
    }

    // 存在冲突，构建完整路径
    const conflictMenu = siblings[0];
    const conflictPath = this.getFullPath(conflictMenu, allMenus);

    return {
      hasConflict: true,
      conflictPath,
      conflictMenu
    };
  }

  /**
   * 获取菜单节点的完整路径
   *
   * @param menu - 菜单节点
   * @param allMenus - 所有菜单列表
   * @returns 完整路径字符串（例如：/根节点/子节点/当前节点）
   */
  getFullPath(menu: PathMenu, allMenus: readonly PathMenu[]): string {
    const pathSegments: string[] = [];
    let currentMenu: PathMenu | undefined = menu;
    const visited = new Set<RxDBEntityId>();

    // 递归查找祖先节点
    while (currentMenu) {
      if (visited.has(currentMenu.id)) {
        console.error('Circular dependency detected in menu path for id:', currentMenu.id);
        break; // Prevent infinite loop
      }
      visited.add(currentMenu.id);

      pathSegments.unshift(currentMenu.title);
      const parentId: RxDBEntityId | null | undefined = currentMenu.parentId;

      if (parentId == null) break;

      currentMenu = allMenus.find(m => m.id === parentId);
    }

    return '/' + pathSegments.join('/');
  }

  /**
   * 获取同级节点列表（用于显示所有冲突）
   *
   * @param parentId - 父节点 ID
   * @param allMenus - 所有菜单列表
   * @returns 同级节点数组
   */
  getSiblings(parentId: RxDBEntityId | null, allMenus: readonly PathMenu[]): PathMenu[] {
    return allMenus.filter(m => (m.parentId ?? null) === parentId);
  }

  /**
   * 检查标题是否有效（基础验证）
   *
   * @param title - 菜单标题
   * @returns 是否有效
   */
  isValidTitle(title: string): boolean {
    const trimmed = title.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.length > 100) return false; // 最大长度限制
    return true;
  }
}
