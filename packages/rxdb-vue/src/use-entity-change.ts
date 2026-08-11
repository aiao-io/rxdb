import { getEntityStatus, type EntityType } from '@aiao/rxdb';
import { withTimeWindows } from '@aiao/utils';
import { type Subscription } from 'rxjs';
import {
  computed,
  shallowRef,
  toValue,
  triggerRef,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type ShallowRef
} from 'vue';
import { toError } from './to-error';

/**
 * {@link useEntityChange} 的时间窗配置。
 *
 * @remarks
 * 两个字段单位均为**毫秒**，默认 `0`；同时设置时**串联**生效，
 * 顺序固定为 `debounceTime → auditTime`，不是二选一。
 *
 * 仅**正有限值**生效：`0`（默认）、负值、`NaN`、`Infinity` 一律表示不挂入对应
 * operator。两个窗口都禁用时 patch 同步透传，组件能在当前 tick 内完成重渲染。
 *
 * 两个字段都接受响应式入参：改变窗口会重建管道并重新订阅。
 *
 * @public
 */
export interface EntityChangeOptions {
  /** 防抖窗口毫秒数：安静满该时长才放行，持续输入期间不重渲染。 */
  debounceTime?: MaybeRefOrGetter<number>;
  /** 采样窗口毫秒数：窗口内只放行最后一次 patch，为持续输入提供稳定的刷新节流。 */
  auditTime?: MaybeRefOrGetter<number>;
}

/**
 * 实体 patch 到 Vue 响应式系统的桥接结果。
 *
 * @typeParam T - 实体实例类型
 *
 * @public
 */
export interface EntityChangeResource<T> {
  /**
   * 与入参**同一个**实体实例（不是副本）；每次 patch 都强制触发依赖方重新求值。
   *
   * @remarks
   * 用 `triggerRef` 而不是换引用：实体是原地可变的类实例，patch 前后引用不变，
   * 任何基于值比较的响应式原语（`ref` / `computed`）都会判定「没变化」而跳过重渲染。
   * 因此模板必须经由这个 ref 读实体（`change.value?.title`），
   * 直接读原始实例的字段不会重渲染。
   */
  readonly value: Readonly<ShallowRef<T | undefined>>;
  /** patch 流的错误；实体切换时复位。 */
  readonly error: ComputedRef<Error | undefined>;
  /** 已收到的 patch 次数，从 `0` 起算；用于调试与测试断言。 */
  readonly revision: ComputedRef<number>;
}

/**
 * 把实体的 patch 流桥接到 Vue 响应式系统，让原地修改能实时反映到视图。
 *
 * @typeParam T - 实体实例类型
 * @param entity - 要监听的实体实例；可为常量、`Ref` 或 getter。为 `undefined` 时不建立订阅
 * @param options - 见 {@link EntityChangeOptions}
 * @returns 见 {@link EntityChangeResource}
 * @throws RxDBError 传入的不是已挂载的 RxDB 实体实例时，由 `getEntityStatus` 抛出
 *
 * @example
 * ```vue
 * <script lang="ts" setup>
 * import { useEntityChange } from '@aiao/rxdb-vue';
 *
 * const props = defineProps<{ todo: Todo }>();
 * // 输入停止 200ms 后才重渲染
 * const live = useEntityChange(() => props.todo, { debounceTime: 200 });
 * </script>
 *
 * <template>
 *   <div>{{ live.value?.title }}</div>
 * </template>
 * ```
 *
 * @remarks
 * 实体是原地可变的类实例，Vue 的响应式系统看不到它们的字段变化。编辑中的实体需要
 * 在多处实时预览时，用这个 hook 把 `patches$` 接进渲染依赖。
 *
 * `patches$` 带 `shareReplay(1)`：订阅时如果该实体此前已有 patch，会**立即**收到一次
 * 重放，因此 `revision` 可能在建立订阅后马上变成 `1`。
 *
 * 订阅随作用域销毁自动清理；实体或时间窗变化时先退订旧订阅再重建。
 *
 * 三端等价实现：Angular 的 `RxDBEntityChangeDirective`（OnPush 视图用 `markForCheck`）、
 * React 的 `useEntityChange`（快照 + revision）。时间窗判定共用
 * `@aiao/utils` 的 `withTimeWindows`，三端语义完全一致。
 *
 * @public
 */
export const useEntityChange = <T extends InstanceType<EntityType>>(
  entity: MaybeRefOrGetter<T | undefined>,
  options: EntityChangeOptions = {}
): EntityChangeResource<T> => {
  // 走无参重载：带值重载的返回类型是 `Ref extends T ? … : …`，T 还是未定的类型参数时
  // 无法归约，会退化成含 `unknown` 的联合，接不上 EntityChangeResource.value。
  // 无参重载没有这层条件，直接给出 ShallowRef<T | undefined>；初值由下方 immediate
  // 的 watch 在本函数返回前同步写入，与直接传 `toValue(entity)` 等价。
  const value = shallowRef<T>();
  const failure = shallowRef<Error | undefined>(undefined);
  const revision = shallowRef(0);

  watch(
    [() => toValue(entity), () => toValue(options.debounceTime) ?? 0, () => toValue(options.auditTime) ?? 0] as const,
    ([current, debounce, audit], _previous, onCleanup) => {
      value.value = current;
      failure.value = undefined;
      if (!current) return;

      const subscription: Subscription = withTimeWindows(getEntityStatus(current).patches$, debounce, audit).subscribe({
        next: () => {
          revision.value += 1;
          // 引用没变，只能强制触发：见 EntityChangeResource.value 的说明
          triggerRef(value);
        },
        error: cause => {
          failure.value = toError(cause);
        }
      });
      // 既覆盖「源变化后重订阅」，也覆盖「作用域销毁」——两者都会跑 onCleanup
      onCleanup(() => subscription.unsubscribe());
    },
    { immediate: true }
  );

  return {
    value,
    error: computed(() => failure.value),
    revision: computed(() => revision.value)
  };
};
