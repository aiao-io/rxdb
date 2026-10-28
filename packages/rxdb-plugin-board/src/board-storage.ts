/**
 * @fileoverview 活动位置与恢复标记的持久化（US-537）
 *
 * 每个存储位置一个库名：活动位置就是当前使用的 `dbName`，由应用记在 `localStorage`。
 * 新旧库名不同，`RxDBTabsGateway` 的广播与选主按 `dbName` 区分，旧页面与新库
 * 不会共用网关。存储接口由宿主注入（浏览器 `localStorage` / 测试内存表）。
 */

/** 键值存储接口（宿主注入：浏览器 `localStorage` / 测试内存表）。 */
export interface BoardStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** 活动库名记录键（localStorage）：当前打开的看板库；无记录 = 首次启动（显示启动选择页）。 */
export const ACTIVE_DB_KEY = 'rxdb-board-active-db';
/** 待切换库名记录键（localStorage）：恢复完成后整页重载、读回成功才转成活动位置。 */
export const PENDING_SWITCH_KEY = 'rxdb-board-pending-switch';
/** 恢复中标记键（localStorage）：跨页写门禁的信号源（US-539 AC#5）。 */
export const RESTORING_MARKER_KEY = 'rxdb-board-restoring';

/** 当前活动库名；无记录 = 首次启动（显示启动选择页）。 */
export const readActiveDbName = (storage: BoardStorage): string | null => storage.get(ACTIVE_DB_KEY);

/** 读回成功后才把新库写成活动位置（US-537：切换提交前中断仍回到旧位置）。 */
export const writeActiveDbName = (storage: BoardStorage, dbName: string): void => storage.set(ACTIVE_DB_KEY, dbName);

/** 恢复完成 → 写待切换记录并整页重载。 */
export const writePendingSwitch = (storage: BoardStorage, dbName: string): void =>
  storage.set(PENDING_SWITCH_KEY, dbName);

/** 待切换库名；无记录 = 没有待读回的恢复。 */
export const readPendingSwitch = (storage: BoardStorage): string | null => storage.get(PENDING_SWITCH_KEY);

/** 读回成功写成活动位置后，或读回失败清理完目标后清除待切换记录。 */
export const clearPendingSwitch = (storage: BoardStorage): void => storage.remove(PENDING_SWITCH_KEY);

/** 恢复中标记：所有页面据此暂停写入（US-534 恢复中写门禁的状态来源）。 */
export const writeRestoringMarker = (storage: BoardStorage): void => storage.set(RESTORING_MARKER_KEY, '1');

/** 是否有页面正在恢复（标记存在即暂停写入）。 */
export const readRestoringMarker = (storage: BoardStorage): boolean => storage.get(RESTORING_MARKER_KEY) !== null;

/** 恢复结束（成功切换或失败清理）后清除恢复中标记，各页面恢复写入。 */
export const clearRestoringMarker = (storage: BoardStorage): void => storage.remove(RESTORING_MARKER_KEY);

/** 生成一个不与活动位置冲突的新库名。 */
export const nextRestoreDbName = (activeDbName: string | null, existing: readonly string[] = []): string => {
  const taken = new Set([...(activeDbName ? [activeDbName] : []), ...existing]);
  let index = 0;
  let candidate = `rxdb-board-restore-${index}`;
  while (taken.has(candidate)) {
    index++;
    candidate = `rxdb-board-restore-${index}`;
  }
  return candidate;
};
