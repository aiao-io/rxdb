import { Injectable } from '@angular/core';
import { resolveTreeDrop, type TreeDropDecision, type TreeDropPosition } from '../../../shared/tree-drop';

interface DraggableFile {
  id: string;
  parentId?: string | null;
  type: 'file' | 'folder';
}

export type DropMode = TreeDropPosition;

/**
 * 文件拖拽服务：把页面上的一次拖放组装成 {@link resolveTreeDrop} 的输入。
 *
 * @remarks
 * 不算排序键、不写库：写入由 `Repository.reorder()` 在一个事务内完成，这里只回答「该做什么」。
 * 拖动中的高亮（`onDragOver` / 无效行）与放下后的执行都调 {@link FileDragDropService.resolveDrop}，
 * 两处共用同一份判定，不会各判一遍。
 */
@Injectable({
  providedIn: 'root'
})
export class FileDragDropService {
  /**
   * 判定一次拖放。
   *
   * @param source - 被拖节点
   * @param target - 目标行
   * @param mode - 落点：上方 / 下方 / 拖进
   * @param allFiles - 页面持有的全部节点，须是各组的完整序列（不是搜索过滤后的可见行），顺序即查询顺序
   * @param manual - 是否手动排序模式；非手动模式只允许换父节点
   * @returns 判定结果：`reject` / `noop` 都不写库，`reorder` 带引擎要的目标
   */
  resolveDrop<T extends DraggableFile>(
    source: T,
    target: T,
    mode: DropMode,
    allFiles: readonly T[],
    manual: boolean
  ): TreeDropDecision<string> {
    const targetParentId = target.parentId ?? null;
    return resolveTreeDrop<string>({
      movedId: source.id,
      target: { id: target.id, parentId: targetParentId, isFolder: target.type === 'folder' },
      position: mode,
      manual,
      movedParentId: source.parentId ?? null,
      isTargetInMovedSubtree: source.id === target.id || this.isDescendant(target.id, source.id, allFiles),
      groupIds:
        mode === 'into' || !manual ? [] : allFiles.filter(f => (f.parentId ?? null) === targetParentId).map(f => f.id)
    });
  }

  /**
   * 检查是否是后代节点
   * @param potentialDescendant 可能的后代节点 ID
   * @param ancestorId 祖先节点 ID
   * @param allFiles 所有文件节点
   * @returns 是否是后代
   */
  isDescendant<T extends DraggableFile>(
    potentialDescendant: string,
    ancestorId: string,
    allFiles: readonly T[]
  ): boolean {
    // 优化: 使用 Map 避免重复查找
    const fileMap = new Map<string, T>(allFiles.map(f => [f.id, f]));
    let current = fileMap.get(potentialDescendant);

    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = fileMap.get(current.parentId);
    }

    return false;
  }

  /**
   * 获取整行无效的拖放目标集合：被拖节点自己、它的全部后代，以及当前排序模式下任何落点都被拒的行。
   *
   * @remarks
   * 对每个候选目标调 {@link resolveTreeDrop}，三种落点全被拒才算整行无效。
   * 前后放置的邻居不影响「拒绝与否」，所以组序列只给目标自己，避免每行都扫一遍整组。
   *
   * @param sourceId 源节点 ID
   * @param allFiles 所有文件节点
   * @param manual 是否手动排序模式
   * @returns 无效目标 ID 集合
   */
  getInvalidTargets<T extends DraggableFile>(sourceId: string, allFiles: readonly T[], manual: boolean): Set<string> {
    const invalidTargets = new Set<string>();
    const source = allFiles.find(f => f.id === sourceId);
    if (!source) return invalidTargets;

    // 优化: 预构建 childrenMap，避免每个候选目标都沿祖先链回溯
    const descendantIds = this.collectDescendantIds(sourceId, allFiles);
    const positions: DropMode[] = ['before', 'after', 'into'];

    for (const target of allFiles) {
      const rejectedEverywhere = positions.every(position => {
        const decision = resolveTreeDrop<string>({
          movedId: sourceId,
          target: { id: target.id, parentId: target.parentId ?? null, isFolder: target.type === 'folder' },
          position,
          manual,
          movedParentId: source.parentId ?? null,
          isTargetInMovedSubtree: target.id === sourceId || descendantIds.has(target.id),
          groupIds: [target.id]
        });
        return decision.kind === 'reject';
      });
      if (rejectedEverywhere) invalidTargets.add(target.id);
    }

    return invalidTargets;
  }

  /** 被拖节点的全部后代 ID。 */
  private collectDescendantIds<T extends DraggableFile>(sourceId: string, allFiles: readonly T[]): Set<string> {
    const childrenMap = new Map<string, T[]>();
    allFiles.forEach(file => {
      if (!file.parentId) return;
      const siblings = childrenMap.get(file.parentId) ?? [];
      siblings.push(file);
      childrenMap.set(file.parentId, siblings);
    });

    const descendantIds = new Set<string>();
    const queue: string[] = [sourceId];
    for (let head = 0; head < queue.length; head++) {
      for (const child of childrenMap.get(queue[head]) ?? []) {
        descendantIds.add(child.id);
        queue.push(child.id);
      }
    }
    return descendantIds;
  }
}
