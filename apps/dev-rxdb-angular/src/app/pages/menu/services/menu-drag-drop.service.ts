import type { RxDBEntityId } from '@aiao/rxdb';
import { Injectable } from '@angular/core';
import { resolveTreeDrop, type TreeDropDecision } from '../../../shared/tree-drop';
import { DropMode } from '../models/drag-drop-types';

interface DraggableMenu {
  id: RxDBEntityId;
  parentId?: RxDBEntityId | null;
}

/**
 * 菜单拖放服务：把页面上的一次拖放组装成 {@link resolveTreeDrop} 的输入。
 *
 * @remarks
 * 不算排序键、不写库：写入由 `Repository.reorder()` 在一个事务内完成，这里只回答「该做什么」。
 * 拖动中的高亮与放下后的执行都调 {@link MenuDragDropService.resolveDrop}，两处不会各判一遍。
 */
@Injectable({
  providedIn: 'root'
})
export class MenuDragDropService {
  /**
   * 判定一次拖放（菜单恒为手动排序，每个节点都可作拖入目标）。
   *
   * @param draggedItem - 被拖节点
   * @param targetItem - 目标行
   * @param dropMode - 落点：上方 / 下方 / 拖进
   * @param allMenus - 页面持有的全部节点，须是各组的完整序列（不是搜索过滤后的可见行），顺序即查询顺序
   * @returns 判定结果：`reject` / `noop` 都不写库，`reorder` 带引擎要的目标
   */
  resolveDrop<T extends DraggableMenu>(
    draggedItem: T,
    targetItem: T,
    dropMode: DropMode,
    allMenus: readonly T[]
  ): TreeDropDecision<RxDBEntityId> {
    const targetParentId = targetItem.parentId ?? null;
    return resolveTreeDrop<RxDBEntityId>({
      movedId: draggedItem.id,
      target: { id: targetItem.id, parentId: targetParentId, isFolder: true },
      position: dropMode,
      manual: true,
      movedParentId: draggedItem.parentId ?? null,
      isTargetInMovedSubtree:
        draggedItem.id === targetItem.id || this.isDescendantOf(targetItem, draggedItem, allMenus),
      groupIds: dropMode === 'into' ? [] : this.groupIdsOf(targetParentId, allMenus)
    });
  }

  /**
   * 判断节点是否是另一个节点的后代。
   *
   * @param item - 待判断的节点
   * @param potentialAncestor - 可能的祖先
   * @param allMenus - 全部节点（沿父链回溯用）
   * @returns `item` 是 `potentialAncestor` 的后代时为 `true`
   */
  isDescendantOf<T extends DraggableMenu>(item: T, potentialAncestor: T, allMenus: readonly T[]): boolean {
    let currentItem: T | undefined = item;

    while (currentItem?.parentId != null) {
      if (currentItem.parentId === potentialAncestor.id) {
        return true;
      }

      const parentId: RxDBEntityId = currentItem.parentId;
      currentItem = allMenus.find(m => m.id === parentId);
    }

    return false;
  }

  /** 某个父节点下完整的子节点序列（按 `allMenus` 的顺序，根组的父节点为 `null`）。 */
  private groupIdsOf(parentId: RxDBEntityId | null, allMenus: readonly DraggableMenu[]): RxDBEntityId[] {
    return allMenus.filter(m => (m.parentId ?? null) === parentId).map(m => m.id);
  }
}
