import { getEntityStatus, type EntityType } from '@aiao/rxdb';
import { isActiveTimeWindow, withTimeWindows } from '@aiao/utils';
import { useEffect, useState } from 'react';
import { type Subscription } from 'rxjs';
import { toError } from './query-options.js';

/**
 * {@link useEntityChange} 的时间窗配置。
 *
 * @remarks
 * 两个字段单位均为**毫秒**，默认 `0`；同时设置时**串联**生效，
 * 顺序固定为 `debounceTime → auditTime`，不是二选一。
 *
 * 仅**正有限值**生效：`0`（默认）、负值、`NaN`、`Infinity` 一律表示不挂入对应
 * operator。两个窗口都禁用时 patch 同步透传，组件能在同一批更新里完成重渲染。
 *
 * 改变窗口值会重建管道并重新订阅。
 *
 * @public
 */
export interface EntityChangeOptions {
  /** 防抖窗口毫秒数：安静满该时长才放行，持续输入期间不重渲染。 */
  debounceTime?: number;
  /** 采样窗口毫秒数：窗口内只放行最后一次 patch，为持续输入提供稳定的刷新节流。 */
  auditTime?: number;
}

/**
 * 实体 patch 到 React 渲染的桥接结果。
 *
 * @typeParam T - 实体实例类型
 *
 * @public
 */
export interface EntityChangeResource<T> {
  /**
   * 与入参**同一个**实体实例（不是副本）。
   *
   * @remarks
   * 实体是原地可变的类实例，patch 前后引用不变，React 的 props/state 比较会判定
   * 「没变化」而跳过重渲染。这个 hook 靠 {@link EntityChangeResource.revision}
   * 的自增强制重渲染，因此组件只要在渲染里读了实体字段就能拿到最新值。
   */
  readonly value: T | undefined;
  /** patch 流的错误；实体或时间窗切换时复位。 */
  readonly error: Error | undefined;
  /** 已收到的 patch 次数，从 `0` 起算；用于调试与测试断言。 */
  readonly revision: number;
}

/** 一次订阅周期内的可变状态。 */
interface ChangeState {
  revision: number;
  error: Error | undefined;
}

/**
 * 把「禁用」的各种写法统一收敛成 `0`。
 *
 * @remarks
 * 不只是美观：`NaN !== NaN`，直接拿原值做渲染期的「窗口变了吗」比较会**永远为真**，
 * 每次渲染都复位一次 state，React 直接判定无限重渲染。归一化后 `undefined` / `0` /
 * 负值 / `NaN` / `Infinity` 都是同一个 `0`，比较与 effect 依赖都稳定，
 * 而且换一种禁用写法不会白白重建订阅。
 */
const normalizeWindow = (duration: number | undefined): number =>
  duration !== undefined && isActiveTimeWindow(duration) ? duration : 0;

/**
 * 把实体的 patch 流桥接到 React 渲染，让原地修改能实时反映到视图。
 *
 * @typeParam T - 实体实例类型
 * @param entity - 要监听的实体实例；为 `undefined` 时不建立订阅
 * @param options - 见 {@link EntityChangeOptions}
 * @returns 见 {@link EntityChangeResource}
 * @throws RxDBError 传入的不是已挂载的 RxDB 实体实例时，由 `getEntityStatus` 抛出
 *
 * @example
 * ```tsx
 * // 输入停止 200ms 后才重渲染
 * const live = useEntityChange(todo, { debounceTime: 200 });
 *
 * return <div>{live.value?.title}</div>;
 * ```
 *
 * @remarks
 * 实体是原地可变的类实例，React 看不到它们的字段变化。编辑中的实体需要在多处实时预览时，
 * 用这个 hook 把 `patches$` 接进渲染依赖。
 *
 * `patches$` 带 `shareReplay(1)`：订阅时如果该实体此前已有 patch，会**立即**收到一次
 * 重放，因此 `revision` 可能在挂载后马上变成 `1`。
 *
 * 订阅随组件卸载自动清理；实体或时间窗变化时先退订旧订阅再重建。
 * `revision` 跨实体切换**继续累加**（与 Vue 侧一致），只有 `error` 会复位。
 *
 * 三端等价实现：Angular 的 `RxDBEntityChangeDirective`（OnPush 视图用 `markForCheck`）、
 * Vue 的 `useEntityChange`（`shallowRef` + `triggerRef`）。时间窗判定共用
 * `@aiao/utils` 的 `withTimeWindows`，三端语义完全一致。
 *
 * @public
 */
export const useEntityChange = <T extends InstanceType<EntityType>>(
  entity: T | undefined,
  options: EntityChangeOptions = {}
): EntityChangeResource<T> => {
  const debounce = normalizeWindow(options.debounceTime);
  const audit = normalizeWindow(options.auditTime);
  const [state, setState] = useState<ChangeState>({ revision: 0, error: undefined });

  // 渲染期同步复位，而不是等 passive effect：放在 effect 里 React 会先提交并绘制一帧
  // 「新实体 + 旧实体的错误」。与 useRepositoryQuery 的复位时机保持一致。
  const [previous, setPrevious] = useState({ entity, debounce, audit });
  if (previous.entity !== entity || previous.debounce !== debounce || previous.audit !== audit) {
    setPrevious({ entity, debounce, audit });
    setState(current => (current.error === undefined ? current : { ...current, error: undefined }));
  }

  useEffect(() => {
    if (!entity) return;

    const subscription: Subscription = withTimeWindows(getEntityStatus(entity).patches$, debounce, audit).subscribe({
      next: () => setState(current => ({ ...current, revision: current.revision + 1 })),
      error: cause => setState(current => ({ ...current, error: toError(cause) }))
    });
    return () => subscription.unsubscribe();
  }, [entity, debounce, audit]);

  return { value: entity, error: state.error, revision: state.revision };
};
