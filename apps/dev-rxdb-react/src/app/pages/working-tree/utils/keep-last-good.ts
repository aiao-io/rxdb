import { useState } from 'react';

/**
 * 查询状态的渲染保底：`loading` 相位不携带旧值（`@aiao/rxdb-plugin-working-tree` 的
 * async-state 契约），把 `diffState` / `statusState` 直接绑进渲染，每次重读都会闪一帧空白。
 *
 * 这里把上一份非 loading 状态留作替身：loading 期间界面停在旧内容，
 * 新结果落地后一次性替换——重读不再闪，列表、徽章与详情在刷新时都保持原样。
 *
 * @remarks
 * 只在**本页**用：三端入口的状态契约是三端共用的（contracts/tri-framework-api.md §4），
 * 不能在入口层替所有调用方决定「loading 该显示什么」——那是一个产品决定，不是框架语义。
 * 本页是发起重读的一方（每次写命令后都由 `refreshStatus()` 兜一次重读），由它决定
 * 重读期间保持旧内容，语义正好。Angular 参考实现是 computed + effect（`keepLastGood`），
 * React 端用「storing information from previous renders」模式（条件守卫 + 渲染期 setState）
 * 达成同一语义。
 */

/** 纯函数：loading 相位退回上一份已知值；非 loading 原样透传；从未有过已知值时原样透传。 */
export const keepLastGood = <T extends { readonly phase: string }>(state: T, last: T | null): T =>
  state.phase !== 'loading' ? state : (last ?? state);

/**
 * React hook 版本：上一份非 loading 状态存在 state 里，loading 期间返回它。
 *
 * 替身是 state 里那份**同一引用**：连续 loading 相位之间返回值保持恒等，
 * 依赖它的 render 调整（如 diff 列表的自动选中）不会被 loading 重读反复触发。
 */
export const useKeepLastGood = <T extends { readonly phase: string }>(state: T): T => {
  const [last, setLast] = useState<T | null>(null);
  // 条件守卫 + 渲染期 setState：React 文档的「storing information from previous renders」模式。
  if (state.phase !== 'loading' && last !== state) {
    setLast(state);
  }
  return keepLastGood(state, last);
};
