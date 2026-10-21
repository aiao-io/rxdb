import { reorderTargetForDrop, type UUID } from '@aiao/rxdb';

/**
 * @fileoverview 落点换算（US-527）
 *
 * 核心包内一份纯函数换算表，三端只采集指针事件后调用同一份函数。
 * 仓库里没有可复用的看板落点实现：US-031 的 `resolveTreeDrop` / `treeDropPosition`
 * 是三个 demo 应用各一份的同名拷贝，按树的前 / 内 / 后三等分，卡片没有「拖进」；
 * US-028 也把「看板跨列拖拽 UI」列在范围外，只给 core API。
 */

/** 卡片落点：两邻之间（首部 `prevId=null`、尾部 `nextId=null`）或空列追加。 */
export type CardDropTarget =
  | { readonly kind: 'between'; readonly columnId: UUID; readonly prevId: UUID | null; readonly nextId: UUID | null }
  | { readonly kind: 'end'; readonly columnId: UUID };

/** 列视图：容器矩形 + 可见卡片矩形 + 完整任务序列（含被过滤或不在渲染窗口内的行）。 */
export interface CardDropColumnView {
  readonly columnId: UUID;
  readonly rect: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
  readonly cards: readonly { readonly id: UUID; readonly top: number; readonly bottom: number }[];
  readonly taskIds: readonly UUID[];
}

/** 被拖行当前的前后邻居是否恰好就是目标（原位落点零写）。 */
const isCurrentPlacement = (groupIds: readonly UUID[], movedId: UUID, prevId: UUID | null, nextId: UUID | null): boolean => {
  const index = groupIds.indexOf(movedId);
  if (index < 0) return false;
  return (groupIds[index - 1] ?? null) === prevId && (groupIds[index + 1] ?? null) === nextId;
};

/**
 * 指针坐标 → 列首 / 两邻之间 / 列尾 / 空列；原位落点返回 `null`（调用方不发起重排）。
 *
 * @remarks
 * 卡片按上下两半判定 before / after；列首空区落在首卡之前，列尾空区落在末卡之后；
 * 空列整区都是「列尾」，落到 `{ kind: 'end' }`。指针不在任何列容器内返回 `null`。
 * 邻居一律取自**完整**任务序列——只拿可见行会把被隐藏的兄弟夹在两个邻居之间，
 * `reorder()` 复核相邻时以 `staleTarget` 拒绝（US-027 同款边界）。
 */
export const resolveCardDrop = (
  columns: readonly CardDropColumnView[],
  movedId: UUID,
  x: number,
  y: number
): CardDropTarget | null => {
  const column = columns.find(view => x >= view.rect.left && x < view.rect.right && y >= view.rect.top && y < view.rect.bottom);
  if (!column) return null;

  // 卡片上下两半：上半 before、下半 after；拖到自己卡片上 = 原位，零写
  for (const card of column.cards) {
    if (y >= card.top && y < card.bottom) {
      if (card.id === movedId) return null;
      const position = y < (card.top + card.bottom) / 2 ? 'before' : 'after';
      const target = reorderTargetForDrop(column.taskIds, movedId, card.id, position);
      return target ? { kind: 'between', columnId: column.columnId, prevId: target.prevId, nextId: target.nextId } : null;
    }
  }

  if (column.taskIds.length === 0) {
    // 空列：整区都是列尾，追加到空组末尾（US-527 AC#2 的 `{ group: { columnId } }` 目标）
    return { kind: 'end', columnId: column.columnId };
  }

  const firstCardTop = column.cards[0]?.top;
  // 邻居一律从「去掉被拖行」的序列取：列首 / 列尾目标不会把自己当邻居，
  // 与引擎 `reorderTargetForDrop` 的 rest 语义一致
  const rest = column.taskIds.filter(id => id !== movedId);

  // 列首空区（列头上沿到首卡上沿；无可见卡时落在列首）
  if (firstCardTop === undefined || y < firstCardTop) {
    if (isCurrentPlacement(column.taskIds, movedId, null, rest[0])) return null;
    return { kind: 'between', columnId: column.columnId, prevId: null, nextId: rest[0] };
  }
  // 列尾空区（末卡下沿到列体下沿）
  if (isCurrentPlacement(column.taskIds, movedId, rest[rest.length - 1], null)) return null;
  return { kind: 'between', columnId: column.columnId, prevId: rest[rest.length - 1], nextId: null };
};

/** 列头横向拖动的视图：列头矩形 + 板内完整列序。 */
export interface ColumnDropView {
  readonly columnId: UUID;
  readonly rect: { readonly left: number; readonly right: number };
}

/**
 * 列头横向拖动 → 前后两邻；原位返回 `null`。列序以板内完整序列换算。
 */
export const resolveColumnDrop = (
  columns: readonly ColumnDropView[],
  columnIds: readonly UUID[],
  movedId: UUID,
  x: number
): { readonly prevId: UUID | null; readonly nextId: UUID | null } | null => {
  const over = columns.find(view => x >= view.rect.left && x < view.rect.right);
  if (!over || over.columnId === movedId) return null;
  const position = x < (over.rect.left + over.rect.right) / 2 ? 'before' : 'after';
  return reorderTargetForDrop(columnIds, movedId, over.columnId, position);
};
