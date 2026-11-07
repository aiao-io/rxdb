import { isRecord } from './catalog.js';
import { requireCondition } from './errors.js';
import { validateState } from './session.js';
import type { DesktopState } from './types.js';

export function migrateState(value: unknown): DesktopState {
  requireCondition(isRecord(value), 'INVALID', '托管数据格式错误');
  if (value['schemaVersion'] === 2) return migrateResources(value);
  if (value['schemaVersion'] !== 1) return validateState(value);
  requireCondition(!('navigation' in value), 'INVALID', '旧数据包含未知导航字段');
  const workspaces = value['workspaces'];
  const session = value['session'];
  requireCondition(
    Array.isArray(workspaces) && workspaces.length > 0 && workspaces.every(isRecord),
    'INVALID',
    '旧工作区格式错误'
  );
  requireCondition(Array.isArray(session) && session.every(isRecord), 'INVALID', '旧会话格式错误');
  const activeWindows: Record<string, number | null> = {};
  for (const workspace of workspaces) {
    requireCondition(typeof workspace['id'] === 'string', 'INVALID', '旧工作区身份无效');
    const index = session.findLastIndex(win => win['workspaceId'] === workspace['id'] && win['state'] !== 'minimized');
    activeWindows[workspace['id']] = index < 0 ? null : index;
  }
  return migrateResources({
    ...value,
    schemaVersion: 2,
    navigation: { workspaceId: workspaces[0]['id'], activeWindows }
  });
}

function migrateResources(value: Record<string, unknown>): DesktopState {
  const installations = value['installations'];
  requireCondition(Array.isArray(installations) && installations.every(isRecord), 'INVALID', '旧安装记录无效');
  return validateState({
    ...value,
    schemaVersion: 3,
    installations: installations.map(item => ({ ...item, resourceVersion: null, previousResourceVersion: null }))
  });
}
