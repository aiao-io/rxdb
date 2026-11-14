import { getDefinition } from '../core/catalog.js';
import { requireCondition } from '../core/errors.js';
import { findFile, readFile } from '../core/files.js';
import type { Capability, DesktopState, Grant } from '../core/types.js';

const labels: Record<Capability, string> = {
  files: '文件访问',
  settings: '桌面设置',
  apps: '应用管理',
  storage: '应用私有存储',
  messages: '跨应用通信',
  notifications: '通知',
  clipboard: '剪贴板'
};

export function capabilityLabel(capability: string): string {
  const label = Object.entries(labels).find(([id]) => id === capability)?.[1];
  requireCondition(label, 'DENIED', '应用请求了未知桌面能力');
  return label;
}

function describeFile(state: DesktopState, scope: string, lookup: typeof findFile): string {
  if (scope === '*') return '全部桌面文件与目录';
  const directory = scope.startsWith('directory:');
  const id = directory ? scope.slice('directory:'.length) : scope;
  if (directory && id === 'root') return '目录「我的文件」';
  const file = lookup(state, id);
  requireCondition(!directory || file.kind === 'directory', 'INVALID', '文件授权的目标不是目录');
  const names = [file.name];
  let parentId = file.parentId;
  while (parentId !== null) {
    const parent = lookup(state, parentId);
    names.push(parent.name);
    parentId = parent.parentId;
  }
  return `${file.kind === 'directory' ? '目录' : '文件'}「我的文件/${names.reverse().join('/')}」${file.deleted ? '（已在回收站）' : ''}`;
}

export function fileScopeLabel(state: DesktopState, scope: string): string {
  return describeFile(state, scope, readFile);
}

export interface GrantView extends Grant {
  appName: string;
  capabilityName: string;
  scopeName: string;
}

function grantScopeLabel(state: DesktopState, grant: Grant): string {
  if (grant.capability === 'files') {
    const id = grant.scope.startsWith('directory:') ? grant.scope.slice('directory:'.length) : grant.scope;
    if (!['*', 'directory:root'].includes(grant.scope) && !state.files.some(file => file.id === id))
      return '文件或目录已不存在';
    return describeFile(state, grant.scope, findFile);
  }
  if (grant.scope === '*') return '全部相关托管数据';
  if (grant.capability === 'messages') return `应用「${getDefinition(grant.scope).name}」`;
  requireCondition(
    grant.capability === 'clipboard' && ['read', 'write'].includes(grant.scope),
    'INVALID',
    '授权记录的范围无效'
  );
  return `${grant.scope === 'read' ? '读取' : '写入'}剪贴板`;
}

export function permissionView(state: DesktopState, grant: Grant): GrantView {
  return {
    ...grant,
    appName: getDefinition(grant.appId).name,
    capabilityName: capabilityLabel(grant.capability),
    scopeName: grantScopeLabel(state, grant)
  };
}
