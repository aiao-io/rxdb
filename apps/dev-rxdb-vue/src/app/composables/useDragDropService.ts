import { reorderTargetForDrop, type ReorderTarget } from '@aiao/rxdb';
import type { DropMode } from './drag-drop-types';

/**
 * 一次放置的判定输入（`contracts/demo-drag-drop.md` §1，三端同名同形）。
 *
 * @typeParam Id - 节点主键类型
 */
export interface TreeDropInput<Id> {
  /** 被拖节点 */
  movedId: Id;
  /** 放置目标行；菜单节点恒 `isFolder = true` */
  target: { id: Id; parentId: Id | null; isFolder: boolean };
  /** 落点：目标上方 / 下方 / 拖进目标 */
  position: DropMode;
  /** 是否手动排序；菜单恒 `true`，文件管理器取 `sortMode === Manual` */
  manual: boolean;
  /** 被拖节点当前的父节点；根为 `null` */
  movedParentId: Id | null;
  /** 目标是被拖节点自己或其后代（祖先链判断） */
  isTargetInMovedSubtree: boolean;
  /** 目标所在组的完整手动序列；`position` 为 `into` 时不用 */
  groupIds: readonly Id[];
}

/** 放置判定结果：拒绝、原位（不写）、或交给引擎的重排目标。 */
export type TreeDropDecision<Id> =
  { kind: 'reject' } | { kind: 'noop' } | { kind: 'reorder'; target: ReorderTarget<Id> };

const REJECT = { kind: 'reject' } as const;

/**
 * 判定一次放置，按判定表自上而下命中即返回。
 *
 * @remarks
 * 拖动中的高亮与放下时的执行调用同一个函数，两处不会各判一遍。
 * 手动模式的前后放置由 core 的 `reorderTargetForDrop` 换算邻居，原位时它返回 `null`。
 *
 * @param input - 判定输入
 * @returns `reject` 不可放置；`noop` 原位不写；`reorder` 带交给 `Repository.reorder()` 的目标
 */
export function resolveTreeDrop<Id>(input: TreeDropInput<Id>): TreeDropDecision<Id> {
  const { movedId, target, position, manual, movedParentId, isTargetInMovedSubtree, groupIds } = input;

  if (isTargetInMovedSubtree) return REJECT;
  if (position === 'into') {
    if (!target.isFolder) return REJECT;
    if (!manual && target.id === movedParentId) return REJECT;
    return { kind: 'reorder', target: { group: { parentId: target.id } } };
  }
  if (!manual) {
    const toRoot = target.parentId === null && movedParentId !== null;
    return toRoot ? { kind: 'reorder', target: { group: { parentId: null } } } : REJECT;
  }

  const between = reorderTargetForDrop(groupIds, movedId, target.id, position);
  return between ? { kind: 'reorder', target: between } : { kind: 'noop' };
}

/**
 * 由指针在目标行内的纵向偏移决定落点（FR-013，三端同一份区间）。
 *
 * @param offsetY - 指针相对目标行顶部的偏移
 * @param height - 目标行高度
 * @param ctx - `manual`：是否手动排序；`targetIsRoot`：目标是否根级行
 * @returns 非手动模式的非根级行整行为 `into`；其余上三分之一 `before`、下三分之一 `after`、中间 `into`
 */
export function treeDropPosition(
  offsetY: number,
  height: number,
  ctx: { manual: boolean; targetIsRoot: boolean }
): DropMode {
  if (!ctx.manual && !ctx.targetIsRoot) return 'into';
  if (offsetY < height / 3) return 'before';
  if (offsetY > (height * 2) / 3) return 'after';
  return 'into';
}
