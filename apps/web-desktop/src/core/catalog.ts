import { requireCondition } from './errors.js';
import { latestRelease } from './releases.js';
import type { AppDefinition, Capability, DesktopState, Installation } from './types.js';

export const capabilities: Capability[] = [
  'files',
  'settings',
  'apps',
  'storage',
  'messages',
  'notifications',
  'clipboard'
];

function definition(
  id: string,
  name: string,
  description: string,
  required: Capability[],
  multiple = false,
  system = true
): AppDefinition {
  return {
    id,
    name,
    description,
    version: '1.0.0',
    entry: `${id}.html`,
    protocol: 1,
    ...(id === 'notes' ? {} : { suspension: 1 as const }),
    instances: multiple ? 'multiple' : 'single',
    capabilities: required,
    optionalCapabilities: ['notifications', 'clipboard', 'messages'],
    system,
    fileTypes: ['editor', 'notes'].includes(id) ? ['text/plain', 'text/markdown'] : [],
    minWidth: 360,
    minHeight: 240
  };
}

export const builtins: AppDefinition[] = [
  definition('files', '文件', '浏览器内桌面存储。管理文件、导入导出和回收站。', ['files', 'storage']),
  definition('editor', '文本编辑器', '独立文档、中文输入、纯文本和 Markdown 源文。', ['files', 'storage'], true, false),
  definition('settings', '设置', '交互模式、显示、权限、工作区、备份和本地诊断。', ['settings', 'storage']),
  definition('catalog', '应用目录', '只运行经过批准的 Web 应用。', ['apps', 'storage']),
  definition('notes', '速记本', '轻量文本笔记，可单独安装并选择为文件打开方式。', ['files', 'storage'], true, false),
  ...(['Angular', 'React', 'Vue'] as const).map(framework =>
    definition(`sample-${framework.toLowerCase()}`, `${framework} 便签`, '编辑、保存和下载文本，使用相同的桌面能力。', ['files'], true, false)
  )
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateManifest(value: unknown): AppDefinition {
  requireCondition(isRecord(value), 'INVALID', '应用描述须为对象');
  requireCondition(
    typeof value['id'] === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value['id']),
    'INVALID',
    'appId 无效'
  );
  for (const field of ['name', 'description', 'version', 'entry'])
    requireCondition(typeof value[field] === 'string' && value[field].length > 0, 'INVALID', `缺少 ${field}`);
  requireCondition(
    typeof value['version'] === 'string' && /^\d+\.\d+\.\d+$/.test(value['version']),
    'INVALID',
    'version 无效'
  );
  requireCondition(
    typeof value['entry'] === 'string' && /^[a-z][a-z0-9-]*\.html$/.test(value['entry']),
    'INVALID',
    'entry 必须为批准的本地 HTML 入口'
  );
  requireCondition(
    value['protocol'] === 1 && ['single', 'multiple'].includes(String(value['instances'])),
    'INVALID',
    '协议或实例策略不支持'
  );
  requireCondition(value['suspension'] === undefined || value['suspension'] === 1, 'INVALID', '挂起协议不受支持');
  for (const field of ['capabilities', 'optionalCapabilities']) {
    const list = value[field];
    requireCondition(
      Array.isArray(list) && list.every(item => capabilities.includes(item)) && new Set(list).size === list.length,
      'INVALID',
      `${field} 声明无效`
    );
  }
  requireCondition(
    Array.isArray(value['fileTypes']) && value['fileTypes'].every(item => typeof item === 'string'),
    'INVALID',
    'fileTypes 无效'
  );
  requireCondition(typeof value['system'] === 'boolean', 'INVALID', 'system 无效');
  requireCondition(
    ['minWidth', 'minHeight'].every(
      field => typeof value[field] === 'number' && Number.isFinite(value[field]) && value[field] > 0
    ),
    'INVALID',
    '最小尺寸无效'
  );
  return value as unknown as AppDefinition;
}

export function getDefinition(id: string): AppDefinition {
  const app = builtins.find(app => app.id === id);
  requireCondition(app, 'DENIED', '应用不在受控目录，需由运营方批准');
  return validateManifest(app);
}

export function installApp(state: DesktopState, id: string): Installation {
  const app = latestRelease(id).definition;
  const current = state.installations.find(item => item.appId === id);
  if (current) return current;
  const installation = {
    appId: app.id,
    version: app.version,
    previousVersion: null,
    resourceVersion: null,
    previousResourceVersion: null
  };
  state.installations.push(installation);
  return installation;
}

export function uninstallApp(state: DesktopState, id: string, clearData: boolean): void {
  requireCondition(!getDefinition(id).system, 'DENIED', '系统组件不能卸载');
  state.installations = state.installations.filter(app => app.appId !== id);
  state.grants = state.grants.filter(grant => grant.appId !== id);
  state.profile.pinned = state.profile.pinned.filter(appId => appId !== id);
  state.profile.shortcuts = state.profile.shortcuts.filter(appId => appId !== id);
  state.session = state.session.filter(item => item.appId !== id);
  state.associations = Object.fromEntries(Object.entries(state.associations).filter(([, appId]) => appId !== id));
  if (clearData) state.appData = state.appData.filter(data => data.appId !== id);
}
