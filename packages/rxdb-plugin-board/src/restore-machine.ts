/**
 * @fileoverview 恢复编排状态机（US-537）
 *
 * 备份 / 恢复的产品闭环：在 `rxdb.connect()` 之前把同 adapter、实体结构指纹一致的
 * 归档恢复到一个**新的库名**，恢复完成后整页重载，启动时连接新库并读回成功才把它
 * 记为活动位置；失败或取消保留原库与原活动位置。状态机放在核心包、三端共用，
 * 同一组输入必须产出相同的状态序列与失败去向（US-537 AC#10）。
 */

/** 恢复状态。 */
export type RestoreState = 'startup_choice' | 'selecting_archive' | 'restoring' | 'switching' | 'restored' | 'failed';

/** 状态机输入（宿主把用户动作与执行结果翻译成输入）。 */
export type RestoreInput =
  | { readonly kind: 'choose_restore' }
  /** 已选定归档并生成了本次恢复的目标库名（宿主据此写恢复中标记与目标记录）。 */
  | { readonly kind: 'archive_selected'; readonly targetDbName: string }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'restore_succeeded' }
  | { readonly kind: 'readback_succeeded' }
  | { readonly kind: 'archive_invalid'; readonly reason: string }
  | { readonly kind: 'restore_failed'; readonly reason: string }
  | { readonly kind: 'readback_failed'; readonly reason: string };

/** 状态机快照：状态 + 本次恢复的目标与失败去向。 */
export interface RestoreSnapshot {
  readonly state: RestoreState;
  /** 本次恢复的目标库名：选定归档起携带到切换与已恢复；未开始、失败或取消（目标已清理）为 `null`。 */
  readonly targetDbName: string | null;
  /** 恢复中标记是否在写（所有页面据此暂停写入）。 */
  readonly restoringMarker: boolean;
  /** 待切换记录是否在写（重载后据此连接新库并读回）。 */
  readonly pendingSwitch: boolean;
  readonly failure: {
    readonly kind: 'archive_invalid' | 'restore_failed' | 'readback_failed';
    readonly reason: string;
  } | null;
}

/** 初始快照：启动选择、无恢复目标、无标记。 */
export const initialRestoreSnapshot: RestoreSnapshot = {
  state: 'startup_choice',
  targetDbName: null,
  restoringMarker: false,
  pendingSwitch: false,
  failure: null
};

/**
 * 纯函数状态机：`(快照, 输入) → 新快照`。
 *
 * 状态转换（US-537 技术笔记「切换用整页重载」表）：
 * - 启动选择：无活动位置记录时选择新建、装载演示数据或恢复；只有新建与装载才连接；
 *   恢复失败 / 取消后回到这里或原看板（由宿主按是否有活动位置决定）。
 * - 选择备份：文件选择本身不写库；已有库恢复先确认，取消不启动恢复。
 * - 恢复中：写「恢复中」标记；断开本页连接、生成新库名、在未连接的 adapter 上
 *   `restore()`。失败或取消 → 清理本次目标、清除标记，原活动位置不变。
 * - 切换中：恢复完成后写「待切换位置」并整页重载；启动时连接新库并读回，
 *   成功才写成活动位置并清除标记；读回失败 → 断开新库、清理本次目标。
 * - 已恢复：打开备份中的看板，后续操作沿正常看板流程。
 * - 失败：按错误类别展示重试 / 释放空间 / 清理入口，未完成目标不作为活动位置。
 */
export const restoreStateMachine = (snapshot: RestoreSnapshot, input: RestoreInput): RestoreSnapshot => {
  switch (input.kind) {
    case 'choose_restore':
      // 启动选择或工具菜单都可进入；已有恢复中标记时拒绝重复进入（写门禁层面兜底）
      return snapshot.state === 'restoring' || snapshot.state === 'switching' ?
          snapshot
        : { ...initialRestoreSnapshot, state: 'selecting_archive' };

    case 'archive_selected':
      return snapshot.state === 'selecting_archive' ?
          { ...snapshot, state: 'restoring', targetDbName: input.targetDbName, restoringMarker: true }
        : snapshot;

    case 'cancel':
      // 取消：清理本次目标与标记，回到原看板或启动选择（宿主决定）。切换中不可取消：恢复已完成、
      // 待切换记录已写，读回或失败清理都由重载后的启动流程按该记录完成，内存快照本就不跨重载
      return (
        snapshot.state === 'selecting_archive' ? { ...initialRestoreSnapshot, state: 'startup_choice' }
        : snapshot.state === 'restoring' ? { ...initialRestoreSnapshot, state: 'startup_choice' }
        : snapshot
      );

    case 'archive_invalid':
      return snapshot.state === 'selecting_archive' ?
          {
            ...initialRestoreSnapshot,
            state: 'failed',
            failure: { kind: 'archive_invalid', reason: input.reason }
          }
        : snapshot;

    case 'restore_succeeded':
      return snapshot.state === 'restoring' ?
          { ...snapshot, state: 'switching', restoringMarker: false, pendingSwitch: true }
        : snapshot;

    case 'readback_succeeded':
      return snapshot.state === 'switching' ? { ...snapshot, state: 'restored', pendingSwitch: false } : snapshot;

    case 'restore_failed':
      return snapshot.state === 'restoring' ?
          {
            ...initialRestoreSnapshot,
            state: 'failed',
            failure: { kind: 'restore_failed', reason: input.reason }
          }
        : snapshot;

    case 'readback_failed':
      return snapshot.state === 'switching' ?
          {
            ...initialRestoreSnapshot,
            state: 'failed',
            failure: { kind: 'readback_failed', reason: input.reason }
          }
        : snapshot;
  }
};
