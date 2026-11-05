/**
 * @fileoverview `<Activity>` 隐藏再显示的测试时序。
 *
 * @internal 仅测试使用，不随库发布。
 */
import { act, render, type RenderResult } from '@testing-library/react';
import { Activity, createElement, type ReactElement } from 'react';

/** 按可见性渲染的界面；同一组件类型才能在隐藏与重显之间保留 state。 */
export type ActivityUi = (mode: 'visible' | 'hidden') => ReactElement;

/**
 * 依次渲染 visible → hidden → 跨过微任务 → visible，复现 Activity 清理并重建 effects、保留 state 的时序。
 * @param whileVisible - 首次显示后、隐藏前执行的动作（如编辑草稿）
 */
export async function hideAndReveal(
  ui: ActivityUi,
  whileVisible?: (view: RenderResult) => void
): Promise<RenderResult> {
  const view = render(ui('visible'));
  if (whileVisible) act(() => whileVisible(view));
  view.rerender(ui('hidden'));
  await act(async () => {
    await Promise.resolve();
  });
  view.rerender(ui('visible'));
  return view;
}

/** 在 Activity 里挂一个只调用 hook 的探针，按渲染顺序收集每次的返回值。 */
export function captureHook<T>(useHook: () => T): { readonly results: T[]; readonly ui: ActivityUi } {
  const results: T[] = [];
  function Probe(): null {
    results.push(useHook());
    return null;
  }
  return { results, ui: mode => createElement(Activity, { mode, children: createElement(Probe) }) };
}
