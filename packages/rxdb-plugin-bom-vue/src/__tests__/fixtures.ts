/** @fileoverview Vue 绑定与真实组件的输入快照和挂载辅助，不计算领域结果。 */

import type { BomLineEditorState, BomViewInput, BomViewNode, BomViewState } from '@aiao/rxdb-plugin-bom';
import { createApp, nextTick, type VNode } from 'vue';

const mounted: (() => void)[] = [];

/** 每次创建独立的编辑状态。 */
export const editorState = (patch: Partial<BomLineEditorState> = {}): BomLineEditorState => ({
  phase: 'idle',
  value: null,
  saving: false,
  error: null,
  ...patch
});

/** 每次创建独立的视图状态。 */
export const viewState = (patch: Partial<BomViewState> = {}): BomViewState => ({
  phase: 'idle',
  nodes: [],
  unresolved: [],
  truncated: null,
  quantityError: null,
  error: null,
  refreshing: false,
  editor: editorState(),
  ...patch
});

/** 已由共享 kernel 生成的可见节点快照。 */
export const viewNode = (path: string[], patch: Partial<BomViewNode> = {}): BomViewNode => ({
  path,
  key: JSON.stringify(path),
  depth: path.length,
  itemId: 'shared-item',
  revisionId: 'revision-a',
  occurrenceId: path.at(-1) ?? null,
  qty: path.length === 0 ? null : '1',
  lineNo: path.length === 0 ? null : 10,
  effectiveFrom: path.length === 0 ? null : new Date('2099-01-01T00:00:00.000Z'),
  effectiveTo: null,
  itemNo: 'R10K',
  description: null,
  quantity: { value: '1', uom: 'pcs' },
  hasChildren: false,
  expanded: false,
  ...patch
});

/** 绑定入口使用完整的显式输入。 */
export const viewInput = (): BomViewInput => ({
  context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2099-01-01T00:00:00.000Z'), unit: 137 },
  target: { parentItemId: 'root-item' },
  plannedQty: { value: '1', uom: 'pcs' },
  budgets: { depth: 8 },
  params: { width: '2' }
});

/** 挂载真实 Vue 渲染树，并在用例结束后移除宿主。 */
export const mountRender = (render: () => VNode): HTMLElement => {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render });
  app.mount(host);
  mounted.push(() => {
    app.unmount();
    host.remove();
  });
  return host;
};

/** 卸载本文件辅助创建的全部组件。 */
export const cleanupMounted = (): void => {
  while (mounted.length > 0) mounted.pop()?.();
};

/** 从标签关联中读取输入框，兼容包裹式与 for/id 标签。 */
export const labeledInput = (host: HTMLElement, name: string): HTMLInputElement => {
  const label = [...host.querySelectorAll('label')].find(value => value.textContent?.trim() === name);
  const input = label?.querySelector('input') ?? (label?.htmlFor ? document.getElementById(label.htmlFor) : null);
  if (!(input instanceof HTMLInputElement)) throw new Error(`缺少有标签的输入：${name}`);
  return input;
};

/** 模拟输入事件，不用失焦补发 change 掩盖输入同步问题。 */
export const fillInput = async (input: HTMLInputElement, value: string): Promise<void> => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
};

/** 派发可取消的键盘事件并等待真实组件更新。 */
export const pressKey = async (element: HTMLElement, key: string): Promise<KeyboardEvent> => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  await nextTick();
  return event;
};
