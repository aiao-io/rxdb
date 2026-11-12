import { isRecord } from './catalog.js';
import { DesktopError, requireCondition } from './errors.js';

export type NavigationState = {
  route: string;
  back: boolean;
  forward: boolean;
};
export type NavigationAction = { type: 'push' | 'replace'; route: string } | { type: 'back' | 'forward' };

export function normalizeRoute(value: unknown): string {
  requireCondition(typeof value === 'string' && value.length <= 2048, 'INVALID', '应用位置格式无效');
  requireCondition(
    ![...value].some(
      character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === '\\'
    ) && /^(?:\/(?!\/)|[?#]|$)/.test(value),
    'INVALID',
    '应用位置必须是实例内相对路由'
  );
  const path = value.split(/[?#]/)[0];
  let segments: string[];
  try {
    segments = path.split('/').map(segment => decodeURIComponent(segment));
  } catch {
    throw new DesktopError('INVALID', '应用位置编码无效');
  }
  requireCondition(
    !segments.some(segment => segment === '.' || segment === '..' || /[\\/]/.test(segment)),
    'INVALID',
    '应用位置包含越界路径'
  );
  const url = new URL(value || '/', 'https://instance.invalid/');
  const fragment = new URLSearchParams(url.hash.slice(1).split('?').at(-1));
  const keys = [...url.searchParams.keys(), ...fragment.keys()];
  const credential = /^(?:(?:access|refresh|id)[_-]?token|token|password|secret|authorization|code|__aiao_orbit)$/i;
  requireCondition(!keys.some(key => credential.test(key)), 'INVALID', '凭据不能进入可恢复的应用位置');
  return url.pathname + url.search + url.hash;
}

export function readNavigationAction(value: unknown): NavigationAction {
  requireCondition(isRecord(value), 'INVALID', '导航动作无效');
  if (value['type'] === 'back' || value['type'] === 'forward') return { type: value['type'] };
  requireCondition(value['type'] === 'push' || value['type'] === 'replace', 'INVALID', '导航动作无效');
  return { type: value['type'], route: normalizeRoute(value['route']) };
}

export function readNavigationState(value: unknown): NavigationState {
  requireCondition(
    isRecord(value) && typeof value['back'] === 'boolean' && typeof value['forward'] === 'boolean',
    'INVALID',
    '导航状态无效'
  );
  return { route: normalizeRoute(value['route']), back: value['back'], forward: value['forward'] };
}
