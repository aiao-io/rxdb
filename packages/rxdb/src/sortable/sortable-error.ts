import { RxDBError } from '../RxDBError.js';

/**
 * {@link SortOrderError} 的分类
 *
 * - `'notManualOrder'`：实体没有声明 `manualOrder: true`，却调用了重排
 * - `'invalidKey'`：用户显式写入的排序键不合法
 * - `'corruptAnchor'`：库里作为锚点读到的键（尾键 / 邻居）不合法，或两邻居不满足 `prev < next`
 * - `'unsupportedPrimary'`：主端是 remote-only 或 QueryCache，读不到完整序列
 * - `'invalidTarget'`：重排目标本身不成立（两侧邻居都为空、邻居就是移动行、`group` 的键与分组字段不符）
 * - `'notFound'`：被移动的行已不存在
 * - `'staleTarget'`：邻居已不存在、不再相邻或不在同一组——调用方看到的顺序过期了，应重查
 */
export type SortOrderErrorReason =
  | 'notManualOrder'
  | 'invalidKey'
  | 'corruptAnchor'
  | 'unsupportedPrimary'
  | 'invalidTarget'
  | 'notFound'
  | 'staleTarget';

/**
 * 手动排序写入被拒绝
 *
 * @remarks
 * 抛出时一条写都没有发出：校验全部发生在写之前，事务内的复核失败则整个事务不提交。
 * 按 {@link SortOrderError.reason} 分流——`'staleTarget'` / `'notFound'` 是并发下的正常结果，
 * 重查后重试即可；其余是调用方或数据的问题，重试不会变。
 *
 * @example
 * ```typescript
 * try {
 *   await rxdb.entityManager.getRepository(Category).reorder(id, { prevId, nextId });
 * } catch (error) {
 *   if (error instanceof SortOrderError && error.reason === 'staleTarget') {
 *     refresh();
 *   } else {
 *     throw error;
 *   }
 * }
 * ```
 */
export class SortOrderError extends RxDBError {
  constructor(
    /** 实体名（元数据里的 `name`） */
    readonly entity: string,
    /** 拒绝原因，见 {@link SortOrderErrorReason} */
    readonly reason: SortOrderErrorReason,
    detail: string
  ) {
    super(`${entity}: ${detail}`);
    this.name = 'SortOrderError';
    Object.setPrototypeOf(this, SortOrderError.prototype);
  }
}
