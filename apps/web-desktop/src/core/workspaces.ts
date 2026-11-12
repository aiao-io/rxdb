import { requireCondition } from './errors.js';
import type { DesktopState } from './types.js';

export function reorderWorkspaces(state: DesktopState, order: unknown): void {
  requireCondition(
    Array.isArray(order) && order.length === state.workspaces.length && new Set(order).size === order.length,
    'INVALID',
    '工作区顺序必须完整且不重复，请刷新后重试'
  );
  const byId = new Map(state.workspaces.map(workspace => [workspace.id, workspace]));
  const workspaces = Array.from(order, (id: unknown) => {
    const workspace = typeof id === 'string' ? byId.get(id) : undefined;
    requireCondition(workspace, 'INVALID', '排序包含无效或已删除的工作区，请刷新后重试');
    return workspace;
  });
  state.workspaces = workspaces;
}
