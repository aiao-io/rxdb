import { decodedByteLength } from './bytes.js';
import { getDefinition, isRecord } from './catalog.js';
import { requireCondition } from './errors.js';
import { validateName } from './files.js';
import { getRelease } from './releases.js';
import { normalizeRoute } from './routes.js';
import { validateProfile } from './state.js';
import type { DesktopState, Json, Profile } from './types.js';

export function isJson(value: unknown): value is Json {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}

function checkRecord(value: unknown): asserts value is Record<string, unknown> {
  requireCondition(isRecord(value), 'INVALID', '托管数据格式错误');
}

export function validateState(value: unknown): DesktopState {
  checkRecord(value);
  requireCondition(
    Object.keys(value).every(key =>
      [
        'schemaVersion',
        'profile',
        'workspaces',
        'files',
        'installations',
        'grants',
        'appData',
        'associations',
        'session',
        'navigation'
      ].includes(key)
    ),
    'INVALID',
    '托管数据包含未知字段'
  );
  requireCondition(value['schemaVersion'] === 5, 'INVALID', '不支持的数据版本，原数据保持不变');
  for (const key of ['files', 'workspaces', 'installations', 'grants', 'appData', 'session'])
    requireCondition(Array.isArray(value[key]), 'INVALID', `缺少 ${key}`);
  checkRecord(value['profile']);
  validateProfile(value['profile'] as unknown as Profile);
  const state = value as unknown as DesktopState;
  requireCondition(
    state.workspaces.length > 0 &&
      new Set(state.workspaces.map(workspace => workspace.id)).size === state.workspaces.length,
    'INVALID',
    '至少保留一个唯一工作区'
  );
  for (const workspace of state.workspaces)
    requireCondition(
      isRecord(workspace) &&
        typeof workspace.id === 'string' &&
        typeof workspace.name === 'string' &&
        workspace.name.trim(),
      'INVALID',
      '工作区无效'
    );
  validateFiles(state);
  requireCondition(
    new Set(state.installations.map(app => app.appId)).size === state.installations.length,
    'INVALID',
    '应用身份重复'
  );
  for (const app of state.installations) {
    getRelease(app.appId, app.version);
    requireCondition(
      app.resourceVersion === null ||
        (typeof app.resourceVersion === 'string' && /^[a-f0-9]{64}$/.test(app.resourceVersion)),
      'INVALID',
      '安装资源版本无效'
    );
    requireCondition(
      (app.previousVersion === null && app.previousResourceVersion === null) ||
        (typeof app.previousVersion === 'string' &&
          typeof app.previousResourceVersion === 'string' &&
          /^[a-f0-9]{64}$/.test(app.previousResourceVersion)),
      'INVALID',
      '回退版本与资源必须成对固定'
    );
    if (app.previousVersion !== null) getRelease(app.appId, app.previousVersion);
  }
  const installed = new Set(state.installations.map(app => app.appId));
  requireCondition(
    [...state.profile.pinned, ...state.profile.shortcuts].every(id => installed.has(id)),
    'INVALID',
    '应用入口引用未安装的应用'
  );
  for (const data of state.appData)
    requireCondition(
      isRecord(data) &&
        typeof data.appId === 'string' &&
        data.schemaVersion === 1 &&
        typeof data.key === 'string' &&
        isJson(data.value),
      'INVALID',
      '应用私有数据不兼容'
    );
  checkRecord(state.associations);
  for (const appId of Object.values(state.associations)) getDefinition(appId);
  for (const win of state.session) validateSavedWindow(win, state);
  requireCondition(
    new Set(state.session.map(win => win.id)).size === state.session.length,
    'INVALID',
    '会话窗口身份重复'
  );
  validateNavigation(state);
  for (const grant of state.grants)
    requireCondition(
      isRecord(grant) &&
        ['id', 'appId', 'origin', 'capability', 'scope'].every(key => typeof grant[key] === 'string') &&
        (grant.instanceId === null || typeof grant.instanceId === 'string'),
      'INVALID',
      '授权格式无效'
    );
  return state;
}

function validateFiles(state: DesktopState): void {
  requireCondition(new Set(state.files.map(file => file.id)).size === state.files.length, 'INVALID', '文件身份重复');
  const byId = new Map(state.files.map(file => [file.id, file]));
  const names = new Set<string>();
  for (const file of state.files) {
    requireCondition(
      isRecord(file) &&
        typeof file.id === 'string' &&
        typeof file.name === 'string' &&
        typeof file.bytes === 'string' &&
        typeof file.mime === 'string',
      'INVALID',
      '文件字段无效'
    );
    validateName(file.name);
    decodedByteLength(file.bytes);
    requireCondition(
      ['file', 'directory'].includes(file.kind) && (file.kind !== 'directory' || file.bytes === ''),
      'INVALID',
      '文件类型无效'
    );
    requireCondition(
      Number.isSafeInteger(file.revision) &&
        file.revision > 0 &&
        Number.isFinite(file.modified) &&
        typeof file.deleted === 'boolean' &&
        (file.deleted ? typeof file.trashId === 'string' : file.trashId === null),
      'INVALID',
      '文件版本无效'
    );
    requireCondition(
      file.parentId === null ||
        (byId.get(file.parentId)?.kind === 'directory' && (file.deleted || !byId.get(file.parentId)?.deleted)),
      'INVALID',
      '目录引用无效'
    );
    validateAncestry(file.id, byId);
    const key = JSON.stringify([file.parentId, file.name]);
    requireCondition(file.deleted || !names.has(key), 'INVALID', '同目录文件重名');
    if (!file.deleted) names.add(key);
  }
}

function validateAncestry(id: string, byId: Map<string, DesktopState['files'][number]>): void {
  const seen = new Set<string>();
  let current: string | null = id;
  while (current !== null) {
    requireCondition(!seen.has(current), 'INVALID', '目录存在环');
    seen.add(current);
    const file = byId.get(current);
    requireCondition(file, 'INVALID', '父目录缺失');
    current = file.parentId;
  }
}

function validateSavedWindow(win: DesktopState['session'][number], state: DesktopState): void {
  requireCondition(isRecord(win), 'INVALID', '会话窗口格式无效');
  requireCondition(
    typeof win.id === 'string' && win.id.trim().length > 0 && win.id.length <= 128,
    'INVALID',
    '会话窗口身份无效'
  );
  getDefinition(win.appId);
  normalizeRoute(win.route);
  requireCondition(
    state.workspaces.some(workspace => workspace.id === win.workspaceId),
    'INVALID',
    '会话工作区缺失'
  );
  requireCondition(
    ['normal', 'minimized', 'maximized', 'left', 'right'].includes(win.state) &&
      ['normal', 'left', 'right'].includes(win.previousState) &&
      ['normal', 'maximized', 'left', 'right'].includes(win.beforeMinimized) &&
      typeof win.route === 'string',
    'INVALID',
    '会话状态无效'
  );
  requireCondition(
    isRecord(win.bounds) &&
      (['x', 'y', 'width', 'height'] as const).every(
        key => typeof win.bounds[key] === 'number' && Number.isFinite(win.bounds[key])
      ) &&
      win.bounds.width > 0 &&
      win.bounds.height > 0,
    'INVALID',
    '窗口边界无效'
  );
  requireCondition(win.fileId === null || typeof win.fileId === 'string', 'INVALID', '保存引用无效');
}

function validateNavigation(state: DesktopState): void {
  const navigation = state.navigation;
  requireCondition(isRecord(navigation) && Object.keys(navigation).length === 2, 'INVALID', '导航状态无效');
  requireCondition(
    state.workspaces.some(workspace => workspace.id === navigation.workspaceId),
    'INVALID',
    '当前工作区缺失'
  );
  requireCondition(
    isRecord(navigation.activeWindows) && Object.keys(navigation.activeWindows).length === state.workspaces.length,
    'INVALID',
    '工作区焦点清单无效'
  );
  for (const workspace of state.workspaces) {
    const index = navigation.activeWindows[workspace.id];
    const win = typeof index === 'number' && Number.isSafeInteger(index) ? state.session[index] : undefined;
    requireCondition(
      index === null || (win && win.workspaceId === workspace.id && win.state !== 'minimized'),
      'INVALID',
      '活动窗口引用无效'
    );
  }
}
