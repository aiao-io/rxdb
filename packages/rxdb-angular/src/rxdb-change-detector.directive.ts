import { EntityType, getEntityStatus } from '@aiao/rxdb';
import { ChangeDetectorRef, Directive, effect, ErrorHandler, inject, input } from '@angular/core';
import { auditTime, debounceTime, Observable } from 'rxjs';

/**
 * 时间窗是否需要真正挂入管道。
 *
 * @remarks
 * RAN-011：只有**正有限值**才代表一个真实的时间窗。`0`（默认值）语义是「禁用」，
 * 负值与 `NaN` 是无意义输入，`Infinity` 则会让 `debounceTime` 永不放行。
 */
const isActiveWindow = (duration: number): boolean => Number.isFinite(duration) && duration > 0;

/**
 * 按输入值给 patch 流挂上时间窗。
 *
 * @param source - patch 流
 * @param debounce - 防抖窗口毫秒数
 * @param audit - 采样窗口毫秒数
 * @returns 挂好 operator 的流；两个窗口都禁用时原样返回 `source`
 *
 * @remarks
 * RAN-011：早先两个 operator 无条件串联，于是默认配置（`0` / `0`）下每次 patch
 * 仍要经过 `debounceTime(0)` 和 `auditTime(0)` 两层 asyncScheduler —— OnPush 视图
 * 无法在当前变更周期内同步 `markForCheck`。禁用的窗口直接不进管道，
 * 让默认路径退化成同步透传。
 *
 * 逐段 `pipe` 而不是收集 operator 数组后 `pipe(...operators)`：`pipe` 的重载按
 * 定长参数声明，展开一个数组拿不到元组类型（TS2556）。
 */
const withTimeWindows = <T>(source: Observable<T>, debounce: number, audit: number): Observable<T> => {
  const debounced = isActiveWindow(debounce) ? source.pipe(debounceTime(debounce)) : source;
  return isActiveWindow(audit) ? debounced.pipe(auditTime(audit)) : debounced;
};

/**
 * RxDB 实体变化指令
 * 如果你使用了 `changeDetection: ChangeDetectionStrategy.OnPush`
 * 那么正在输入的变化不会触发 angular 渲染机制，使用这个指令可以实现实时渲染
 *
 * @example
 * 当修改实体时，需要在多个地方预览修改变化时，可以使用这个指令
 *
 * ```html
 * <!-- 每次 patch 都立即重渲染 -->
 * <div [rxdbChangeDetector]="todo">{{ todo.title }}</div>
 *
 * <!-- 输入停止 200ms 后才重渲染 -->
 * <div [rxdbChangeDetector]="todo" [debounceTime]="200">{{ todo.title }}</div>
 * ```
 *
 * @remarks
 * `debounceTime` 与 `auditTime` 单位均为毫秒，默认 `0`；
 * 两者同时设置时**串联**生效，顺序为 `debounceTime → auditTime`（RAN-015）。
 *
 * 只有**正有限值**才会挂入管道：`0`（默认）、负值、`NaN`、`Infinity` 一律视为
 * 禁用对应 operator。两个窗口都禁用时 patch 同步透传，OnPush 视图能在当前
 * 变更周期内完成 `markForCheck`（RAN-011）。
 */
@Directive({ selector: '[rxdbChangeDetector]' })
export class RxDBEntityChangeDirective {
  readonly #changeDetectorRef = inject(ChangeDetectorRef);
  readonly #errorHandler = inject(ErrorHandler);

  /**
   * 要监听的实体实例。为 `undefined` 时不建立订阅（可安全地绑定尚未加载的实体）。
   */
  readonly rxdbChangeDetector = input<InstanceType<EntityType>>();

  /**
   * 防抖窗口，**单位毫秒**。默认 `0` 表示不防抖（每次 patch 都同步触发一次变更检测）。
   *
   * @remarks
   * 语义同 RxJS `debounceTime`：安静满该时长才放行，持续输入期间不触发渲染。
   * 与 {@link auditTime} 同时设置时两者**串联**（先 debounce 再 audit），不是二选一。
   *
   * 仅正有限值生效；`0`、负值、`NaN`、`Infinity` 表示不挂入该 operator（RAN-011）。
   */
  readonly debounceTime = input<number>(0);

  /**
   * 采样窗口，**单位毫秒**。默认 `0` 表示不采样。
   *
   * @remarks
   * 语义同 RxJS `auditTime`：窗口内只放行最后一个值，可为持续输入提供稳定的刷新节流。
   * 与 {@link debounceTime} 同时设置时两者**串联**，管道顺序为 `debounceTime → auditTime`。
   *
   * 仅正有限值生效；`0`、负值、`NaN`、`Infinity` 表示不挂入该 operator（RAN-011）。
   */
  readonly auditTime = input<number>(0);

  constructor() {
    effect(onCleanup => {
      const entity = this.rxdbChangeDetector();
      const debounce = this.debounceTime();
      const audit = this.auditTime();
      if (!entity) return;

      const subscription = withTimeWindows(getEntityStatus(entity).patches$, debounce, audit).subscribe({
        next: () => this.#changeDetectorRef.markForCheck(),
        error: error => this.#errorHandler.handleError(error)
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }
}
