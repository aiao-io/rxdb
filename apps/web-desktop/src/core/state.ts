import { requireCondition } from './errors.js';
import type { DesktopState, Mode, Profile } from './types.js';

export function defaultProfile(mode: Mode): Profile {
  return {
    mode,
    theme: 'system',
    scale: 100,
    reducedMotion: false,
    guided: false,
    pinned: ['files', 'editor', 'settings'],
    shortcuts: ['files', 'editor'],
    doNotDisturb: false
  };
}

export function createState(mode: Mode): DesktopState {
  return {
    schemaVersion: 4,
    navigation: { workspaceId: 'first', activeWindows: { first: null } },
    profile: defaultProfile(mode),
    workspaces: [{ id: 'first', name: '工作区 1' }],
    files: [],
    installations: ['files', 'editor', 'settings', 'catalog'].map(appId => ({
      appId,
      version: '1.0.0',
      previousVersion: null,
      resourceVersion: null,
      previousResourceVersion: null
    })),
    grants: [],
    appData: [],
    associations: { 'text/plain': 'editor', 'text/markdown': 'editor' },
    session: []
  };
}

export function validateProfile(value: Profile): void {
  requireCondition(['macos', 'windows'].includes(value.mode), 'INVALID', '交互模式无效');
  requireCondition(['light', 'dark', 'system'].includes(value.theme), 'INVALID', '主题无效');
  requireCondition(
    Number.isInteger(value.scale) && value.scale >= 100 && value.scale <= 200,
    'INVALID',
    '缩放范围为 100–200%'
  );
  requireCondition(
    [value.reducedMotion, value.guided, value.doNotDisturb].every(v => typeof v === 'boolean'),
    'INVALID',
    '偏好格式无效'
  );
  requireCondition(
    [value.pinned, value.shortcuts].every(
      v => Array.isArray(v) && v.every(id => typeof id === 'string') && new Set(v).size === v.length
    ),
    'INVALID',
    '应用入口必须唯一'
  );
}
