import { generateKeyBetween } from '@aiao/utils';
import { Injectable } from '@angular/core';

interface FileParentRelation<T> {
  set(parent: T | null): void;
}

interface DraggableFile {
  id: string;
  parentId?: string | null;
  sortOrder?: string | null;
  type: 'file' | 'folder';
  parent$: FileParentRelation<this>;
  save: () => Promise<unknown>;
}

export type DropMode = 'before' | 'after' | 'into';

/**
 * 拖拽结果
 */
export interface DropResult {
  success: boolean;
  newSortOrder?: string;
  newParentId?: string | null;
  error?: string;
}

/**
 * 文件拖拽服务
 * 处理文件/文件夹的拖拽移动逻辑
 */
@Injectable({
  providedIn: 'root'
})
export class FileDragDropService {
  /**
   * 计算拖放模式（上/中/下）
   * @param clientY 鼠标 Y 坐标
   * @param rect 目标元素的边界矩形
   * @param isManualSort 是否为自由排序模式
   * @param isRootLevel 目标是否为根节点
   * @returns 拖放模式
   */
  calculateDropMode(clientY: number, rect: DOMRect, isManualSort = true, isRootLevel = false): DropMode {
    const third = rect.height / 3;
    const relativeY = clientY - rect.top;

    // 非自由排序模式
    if (!isManualSort) {
      // 根节点：before/after 视为拖入根目录
      if (isRootLevel) {
        if (relativeY < third) return 'before';
        if (relativeY > third * 2) return 'after';
      }
      // 默认只能拖入文件夹内部
      return 'into';
    }

    // 自由排序模式：支持 before/after/into 三种模式
    if (relativeY < third) return 'before';
    if (relativeY > third * 2) return 'after';
    return 'into';
  }

  /**
   * 验证拖拽是否有效
   * @param sourceId 源节点 ID
   * @param targetId 目标节点 ID
   * @param mode 拖放模式
   * @param allFiles 所有文件节点
   * @param isManualSort 是否为自由排序模式
   * @returns 是否有效
   */
  isValidDrop<T extends DraggableFile>(
    sourceId: string,
    targetId: string,
    mode: DropMode,
    allFiles: readonly T[],
    isManualSort = true
  ): boolean {
    // 禁止拖到自己
    if (sourceId === targetId) return false;

    const sourceFile = allFiles.find(f => f.id === sourceId);
    const targetFile = allFiles.find(f => f.id === targetId);

    if (!sourceFile || !targetFile) return false;

    // 禁止拖入自己的后代节点（循环引用检测）
    if (this.isDescendant(targetId, sourceId, allFiles)) return false;

    // 非自由排序模式
    if (!isManualSort) {
      const isRootLevel = !targetFile.parentId;
      const sourceParentId = sourceFile.parentId || null;
      const targetParentId = targetFile.parentId || null;

      // 根节点的 before/after 模式
      if (isRootLevel && (mode === 'before' || mode === 'after')) {
        // 如果源节点也在根级别，禁止同级拖放
        if (sourceParentId === null) {
          return false;
        }
        // 允许从子级拖到根级别
        return true;
      }

      // before/after 模式：禁止同级拖放
      if (mode === 'before' || mode === 'after') {
        if (sourceParentId === targetParentId) {
          return false; // 同级禁止
        }
      }

      // into 模式：只允许拖入文件夹，且不能是同级
      if (mode === 'into') {
        if (targetFile.type !== 'folder') return false;
        // 如果目标文件夹就是源节点的父节点，禁止（相当于拖到原位置）
        if (targetFile.id === sourceParentId) return false;
        return true;
      }

      return false;
    }

    // 自由排序模式：文件不能作为 'into' 目标
    if (mode === 'into' && targetFile.type !== 'folder') return false;

    return true;
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
   * 获取无效的拖放目标集合
   * @param sourceId 源节点 ID
   * @param allFiles 所有文件节点
   * @returns 无效目标 ID 集合
   */
  getInvalidTargets<T extends DraggableFile>(sourceId: string, allFiles: readonly T[]): Set<string> {
    const invalidTargets = new Set<string>();

    // 添加自己
    invalidTargets.add(sourceId);

    // 优化: 预构建 childrenMap 避免重复过滤
    const childrenMap = new Map<string, T[]>();
    allFiles.forEach(file => {
      if (file.parentId) {
        if (!childrenMap.has(file.parentId)) {
          childrenMap.set(file.parentId, []);
        }
        childrenMap.get(file.parentId)!.push(file);
      }
    });

    // 添加所有后代
    const addDescendants = (fileId: string) => {
      const children = childrenMap.get(fileId);
      if (!children) return;

      children.forEach(child => {
        invalidTargets.add(child.id);
        addDescendants(child.id);
      });
    };

    addDescendants(sourceId);

    return invalidTargets;
  }

  /**
   * 计算拖放后的新位置
   * @param sourceFile 源文件
   * @param targetFile 目标文件
   * @param mode 拖放模式
   * @param allFiles 所有文件
   * @param isManualSort 是否为自由排序模式
   * @returns 拖放结果
   */
  calculateDropPosition(
    sourceFile: DraggableFile,
    targetFile: DraggableFile,
    mode: DropMode,
    allFiles: readonly DraggableFile[],
    isManualSort = true
  ): DropResult {
    try {
      let newSortOrder: string;
      let newParentId: string | null;

      if (mode === 'into') {
        // 拖入文件夹
        newParentId = targetFile.id;
        const targetChildren = allFiles
          .filter(f => f.parentId === targetFile.id)
          .sort((a, b) => {
            const orderA = a.sortOrder || '';
            const orderB = b.sortOrder || '';
            if (orderA < orderB) return -1;
            if (orderA > orderB) return 1;
            return 0;
          });

        const lastChild = targetChildren[targetChildren.length - 1];
        newSortOrder = generateKeyBetween(lastChild?.sortOrder || null, null);
      } else {
        // before 或 after
        // 非自由模式下，如果目标是根节点，则移动到根目录
        const isRootLevel = !targetFile.parentId;
        if (!isManualSort && isRootLevel) {
          newParentId = null;
          // 获取根目录的所有节点
          const rootSiblings = allFiles
            .filter(f => !f.parentId && f.id !== sourceFile.id)
            .sort((a, b) => {
              const orderA = a.sortOrder || '';
              const orderB = b.sortOrder || '';
              if (orderA < orderB) return -1;
              if (orderA > orderB) return 1;
              return 0;
            });

          // 插入到最后
          const lastRoot = rootSiblings[rootSiblings.length - 1];
          newSortOrder = generateKeyBetween(lastRoot?.sortOrder || null, null);
        } else {
          // 自由模式或非根节点：正常处理 before/after
          newParentId = targetFile.parentId ?? null;
          const siblings = allFiles
            .filter(f => f.parentId === newParentId && f.id !== sourceFile.id)
            .sort((a, b) => {
              const orderA = a.sortOrder || '';
              const orderB = b.sortOrder || '';
              if (orderA < orderB) return -1;
              if (orderA > orderB) return 1;
              return 0;
            });

          const targetIndex = siblings.findIndex(s => s.id === targetFile.id);

          if (mode === 'before') {
            const prevSibling = targetIndex > 0 ? siblings[targetIndex - 1] : null;
            newSortOrder = generateKeyBetween(prevSibling?.sortOrder || null, targetFile.sortOrder);
          } else {
            // after
            const nextSibling = targetIndex < siblings.length - 1 ? siblings[targetIndex + 1] : null;
            newSortOrder = generateKeyBetween(targetFile.sortOrder, nextSibling?.sortOrder || null);
          }
        }
      }

      return {
        success: true,
        newSortOrder,
        newParentId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 执行拖放操作
   * @param sourceId 源节点 ID
   * @param targetId 目标节点 ID
   * @param mode 拖放模式
   * @param allFiles 所有文件
   * @returns 执行结果
   */
  async executeDrop<T extends DraggableFile>(
    sourceId: string,
    targetId: string,
    mode: DropMode,
    allFiles: T[]
  ): Promise<DropResult> {
    // 验证拖拽有效性
    if (!this.isValidDrop(sourceId, targetId, mode, allFiles)) {
      return {
        success: false,
        error: 'Invalid drop operation'
      };
    }

    const sourceFile = allFiles.find(f => f.id === sourceId);
    const targetFile = allFiles.find(f => f.id === targetId);

    if (!sourceFile || !targetFile) {
      return {
        success: false,
        error: 'Source or target file not found'
      };
    }

    // 计算新位置
    const result = this.calculateDropPosition(sourceFile, targetFile, mode, allFiles);

    if (!result.success) {
      return result;
    }

    // 更新文件
    sourceFile.sortOrder = result.newSortOrder!;
    if (result.newParentId !== undefined) {
      if (result.newParentId) {
        const newParent = allFiles.find(f => f.id === result.newParentId);
        if (newParent) {
          sourceFile.parent$.set(newParent);
        }
      } else {
        // 移动到根级别
        sourceFile.parent$.set(null);
      }
    }

    await sourceFile.save();

    return result;
  }
}
