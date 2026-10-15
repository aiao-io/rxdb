/**
 * {@link RxDBReplayError} 的可判别原因。
 *
 * - `no_dom`：当前环境没有 `document`（Node、Worker），无从录制。
 * - `already_recording`：已有一个会话在录制，`start()` 不叠加第二个。
 * - `store_limit`：已落库总量达到 `limits.storeBytes`，拒绝开始新会话；用 `deleteSession()` 释放空间。
 * - `recording_db_unavailable`：录制库工厂抛错，或它返回的库连不上；`cause` 是原错误，下一次调用会重新调用工厂。
 * - `session_not_found`：给出的会话 id 在录制库里不存在。
 * - `session_recording`：要删除的会话正在录制，先 `stop()`。
 * - `working_tree_unavailable`：没有安装 `@aiao/rxdb-plugin-working-tree`，无从恢复到 commit。
 * - `invalid_marker`：事件的 tag 是本插件的标记，但 payload 形状不对（数据被外部改过）。
 * - `not_installed`：插件没安装，或安装它的连接纪元已经释放。
 */
export type RxDBReplayErrorCode =
  | 'no_dom'
  | 'already_recording'
  | 'store_limit'
  | 'recording_db_unavailable'
  | 'session_not_found'
  | 'session_recording'
  | 'working_tree_unavailable'
  | 'invalid_marker'
  | 'not_installed';

/**
 * `@aiao/rxdb-plugin-replay` 抛出的全部业务错误。
 *
 * @remarks
 * 按 `code` 分支，不要匹配 `message`：后者只给人看，措辞随版本可能调整。
 */
export class RxDBReplayError extends Error {
  override readonly name = 'RxDBReplayError';

  /**
   * @param code - 可判别原因
   * @param message - 给人看的说明
   * @param options - 透传给 `Error`；`cause` 指向触发它的原错误（如录制库连接失败）
   */
  constructor(
    readonly code: RxDBReplayErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(`[rxdb-plugin-replay] ${message}`, options);
  }
}
