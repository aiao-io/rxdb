import { computed, effect, signal, type Signal } from '@angular/core';

/**
 * 查询状态的渲染保底：`loading` 相位不携带旧值（`@aiao/rxdb-plugin-working-tree` 的
 * async-state 契约），把 `diffState` / `statusState` 直接绑进模板，每次重读都会闪一帧空白。
 *
 * 这里返回一个把上一份非 loading 状态留作替身的 computed：loading 期间界面停在旧内容，
 * 新结果落地后一次性替换——重读不再闪，列表、徽章与详情在刷新时都保持原样。
 *
 * @remarks
 * 只在**本页**用：三端入口的状态契约是三端共用的（contracts/tri-framework-api.md §4），
 * 不能在入口层替所有调用方决定「loading 该显示什么」——那是一个产品决定，不是框架语义。
 * 本页是发起重读的一方（每次写命令后都由 `refreshStatus()` 兜一次重读），由它决定
 * 重读期间保持旧内容，语义正好。
 */
export const keepLastGood = <T extends { readonly phase: string }>(source: Signal<T>): Signal<T> => {
  /** 上一份非 loading 状态；还没有过任何一份时是 null。 */
  const last = signal<T | null>(null);
  effect(() => {
    const state = source();
    if (state.phase !== 'loading') last.set(state);
  });
  return computed(() => {
    const state = source();
    if (state.phase !== 'loading') return state;
    return last() ?? state;
  });
};
