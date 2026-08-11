import { auditTime, debounceTime, type Observable } from 'rxjs';

/**
 * 时间窗是否需要真正挂入管道。
 *
 * @param duration - 窗口毫秒数
 * @returns 仅当 `duration` 是**正有限值**时为 `true`
 *
 * @remarks
 * RAN-011：只有正有限值才代表一个真实的时间窗。`0`（各调用点的默认值）语义是「禁用」，
 * 负值与 `NaN` 是无意义输入，`Infinity` 则会让 `debounceTime` 永不放行 ——
 * 这三类都必须让 operator 整个不进管道，而不是「挂一个 0 毫秒的窗」。
 *
 * @public
 */
export const isActiveTimeWindow = (duration: number): boolean => Number.isFinite(duration) && duration > 0;

/**
 * 按窗口配置给一条流挂上防抖 / 采样。
 *
 * @typeParam T - 流的值类型
 * @param source - 源流
 * @param debounce - 防抖窗口毫秒数；非正有限值表示禁用
 * @param audit - 采样窗口毫秒数；非正有限值表示禁用
 * @returns 挂好 operator 的流；两个窗口都禁用时**原样返回 `source`**（引用相等）
 *
 * @remarks
 * 两者同时启用时**串联**生效，顺序固定为 `debounceTime → auditTime`，不是二选一。
 *
 * RAN-011：早先两个 operator 无条件串联，于是默认配置（`0` / `0`）下每个值仍要经过
 * `debounceTime(0)` 和 `auditTime(0)` 两层 `asyncScheduler` —— 同步消费者（Angular OnPush
 * 视图的 `markForCheck`、Vue/React 的当拍重渲染）在当前周期内根本拿不到值。
 * 禁用的窗口直接不进管道，让默认路径退化成同步透传。
 *
 * 逐段 `pipe` 而不是收集 operator 数组后 `pipe(...operators)`：`pipe` 的重载按定长参数
 * 声明，展开一个数组拿不到元组类型（TS2556）。
 *
 * 这份定义由 Angular 的 `RxDBEntityChangeDirective` 与 Vue/React 的 `useEntityChange`
 * 共用（RVU-010）：三端各抄一份必然漂移，而漂移的正是上面这些一字之差的判定。
 *
 * @public
 */
export const withTimeWindows = <T>(source: Observable<T>, debounce: number, audit: number): Observable<T> => {
  const debounced = isActiveTimeWindow(debounce) ? source.pipe(debounceTime(debounce)) : source;
  return isActiveTimeWindow(audit) ? debounced.pipe(auditTime(audit)) : debounced;
};
