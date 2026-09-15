/**
 * undo session 类型：按分支隔离的撤销边界。
 *
 * @internal 供 {@link HistoryManager} 与 undo/redo sibling 共用
 */

/** 同步清空后的永久撤销边界 */
export type UndoBoundary = Readonly<{
  changeId: number;
  createdAfter: Date | null;
}>;

/** 当前可撤销的 session */
export type ActiveUndoSession = Readonly<{
  generation: number;
  state: 'active';
  boundary: UndoBoundary;
}>;

/** 同步后已清空、等待本地新写入再恢复的 session */
export type ClearedUndoSession = Readonly<{
  generation: number;
  state: 'cleared';
  boundary: UndoBoundary;
  clearedAt: Date;
}>;

export type UndoSession = ActiveUndoSession | ClearedUndoSession;

/** 本地写入事件携带的 session 归属信息 */
export type UndoSessionEvent = Readonly<{
  generation: number | null;
  recordAt: Date | null;
}>;

/** 未发生过清空时的默认边界 */
export const INITIAL_UNDO_BOUNDARY: UndoBoundary = { changeId: 0, createdAfter: null };
