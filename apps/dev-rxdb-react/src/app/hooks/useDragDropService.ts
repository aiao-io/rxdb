import { reorderTargetForDrop, type ReorderTarget, type RxDBEntityId } from '@aiao/rxdb';

/** 落点相对目标行的位置：上方、下方、拖进。 */
export type TreeDropPosition = 'before' | 'after' | 'into';

/** {@link resolveTreeDrop} 的输入；菜单与文件管理器共用，三端同名同形。 */
export interface TreeDropInput<Id> {
  /** 被拖节点 */
  movedId: Id;
  /** 落点所在的目标行；菜单节点恒 `isFolder = true` */
  target: { id: Id; parentId: Id | null; isFolder: boolean };
  position: TreeDropPosition;
  /** 是否手动排序：菜单恒为 `true`，文件管理器为 `sortMode === Manual` */
  manual: boolean;
  /** 被拖节点当前的父节点，根为 `null` */
  movedParentId: Id | null;
  /** 目标是被拖节点自己或后代（祖先链判断） */
  isTargetInMovedSubtree: boolean;
  /** 目标所在组的完整手动序列（含被搜索过滤或不在窗口内的兄弟）；`position` 为 `into` 时不用 */
  groupIds: readonly Id[];
}

/** 一次放下的判定结果。 */
export type TreeDropDecision<Id> =
  /** 页面直接拒绝：零写，拖动中以无效高亮表示 */
  | { kind: 'reject' }
  /** 原位放下：零写，不是错误 */
  | { kind: 'noop' }
  /** 交给 `Repository.reorder()` 的目标 */
  | { kind: 'reorder'; target: ReorderTarget<Id> };

const REJECT = { kind: 'reject' } as const;
const NOOP = { kind: 'noop' } as const;

/**
 * 判定一次放下该做什么。拖动中的高亮与放下后的执行都调它，两处不会各判一遍。
 *
 * @remarks
 * 判定表自上而下，命中即返回：
 *
 * 1. 目标是被拖节点自己或后代 → `reject`（环）
 * 2. 拖进文件 → `reject`
 * 3. 手动模式拖进节点 → 追加到该节点子组末尾；不读该节点已加载的子节点
 * 4. 非手动模式拖进当前父文件夹 → `reject`（非手动模式看不到末尾）
 * 5. 非手动模式拖进文件夹 → 追加到该文件夹末尾
 * 6. 非手动模式把非根级节点拖到根级节点上下方 → 追加到根组末尾
 * 7. 非手动模式其余前后放置 → `reject`
 * 8. 手动模式原位放下 → `noop`
 * 9. 手动模式前后放置 → 邻居目标
 *
 * @param input - 放下现场，见 {@link TreeDropInput}
 * @returns 判定结果，见 {@link TreeDropDecision}
 * @throws RangeError 手动模式前后放置时目标不在 `groupIds` 里（调用方逻辑错误）
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
  return between === null ? NOOP : { kind: 'reorder', target: between };
}

/**
 * 按光标在目标行内的纵向位置取落点：上三分之一为上方、下三分之一为下方、中间为拖进。
 * 非手动模式下非根级行没有前后放置的意义，整行都是拖进。
 *
 * @param offsetY - 光标相对目标行顶部的纵向偏移
 * @param height - 目标行高度
 * @param ctx - `manual` 是否手动排序；`targetIsRoot` 目标是否为根级行
 * @returns 落点
 */
export function treeDropPosition(
  offsetY: number,
  height: number,
  ctx: { manual: boolean; targetIsRoot: boolean }
): TreeDropPosition {
  if (!ctx.manual && !ctx.targetIsRoot) return 'into';
  if (offsetY < height / 3) return 'before';
  if (offsetY > (height * 2) / 3) return 'after';
  return 'into';
}

interface TreeNodeRef {
  id: RxDBEntityId;
  parentId?: RxDBEntityId | null;
}

/**
 * 目标是否为被拖节点自己或其后代：沿目标的祖先链向上找被拖节点。
 *
 * 祖先链只需要 `items` 里已有的节点：能被拖到的目标必然可见，可见就说明逐级展开过它的祖先。
 *
 * @param movedId - 被拖节点
 * @param target - 落点所在的目标节点
 * @param items - 含目标祖先链的节点集合
 */
export function isTargetInMovedSubtree(
  movedId: RxDBEntityId,
  target: TreeNodeRef,
  items: readonly TreeNodeRef[]
): boolean {
  const byId = new Map(items.map(item => [item.id, item]));
  let current: TreeNodeRef | undefined = target;
  while (current) {
    if (current.id === movedId) return true;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}
