import { describe, expect, it } from 'vitest';
import { migrateState, removeSavedWindow } from './layout.js';
import { validateState } from './session.js';
import { createState } from './state.js';
import type { SavedWindow } from './types.js';

function saved(id: string): SavedWindow {
  return {
    id,
    appId: 'editor',
    fileId: null,
    route: '/',
    workspaceId: 'first',
    bounds: { x: 90, y: 48, width: 800, height: 520 },
    state: 'normal',
    previousState: 'normal',
    beforeMinimized: 'normal'
  };
}

describe('DESKTOP-US-501/AC2 会话窗口稳定身份', () => {
  it('v4 中完全相同的两条窗口升级后拥有不同身份，旧布局和焦点保留', () => {
    const window = { ...saved('discard') } as Record<string, unknown>;
    delete window['id'];
    const legacy = {
      ...createState('windows'),
      schemaVersion: 4,
      session: [window, { ...window }],
      navigation: { workspaceId: 'first', activeWindows: { first: 1 } }
    };
    const before = structuredClone(legacy);
    const upgraded = migrateState(legacy);
    expect(upgraded.schemaVersion).toBe(5);
    expect(upgraded.session[0].id).toBeTruthy();
    expect(upgraded.session[1].id).not.toBe(upgraded.session[0].id);
    expect(upgraded.session.map(({ id: _id, ...rest }) => rest)).toEqual(legacy.session);
    expect(upgraded.navigation).toEqual(legacy.navigation);
    expect(legacy).toEqual(before);
  });

  it('缺少、空白、超长或重复身份均拒绝恢复', () => {
    const state = createState('windows');
    state.session = [saved('one'), saved('two')];
    expect(validateState(state)).toBe(state);
    for (const id of [undefined, '', '  ', 'x'.repeat(129), 'one']) {
      const next = { ...state, session: [state.session[0], { ...state.session[1], id }] };
      expect(() => validateState(next)).toThrow('INVALID');
    }
  });

  it('移除待恢复项按身份重排每区活动索引，不移动其他窗口或删除文件', () => {
    const state = createState('windows');
    state.workspaces.push({ id: 'other', name: '另一区' });
    state.session = [saved('failed'), saved('first-active'), { ...saved('other-active'), workspaceId: 'other' }];
    state.navigation.activeWindows = { first: 1, other: 2 };
    removeSavedWindow(state, 'failed');
    expect(state.session.map(win => win.id)).toEqual(['first-active', 'other-active']);
    expect(state.navigation.activeWindows).toEqual({ first: 0, other: 1 });
    removeSavedWindow(state, 'first-active');
    expect(state.navigation.activeWindows).toEqual({ first: null, other: 0 });
    const before = structuredClone(state);
    expect(() => removeSavedWindow(state, 'missing')).toThrow('NOT_FOUND');
    expect(state).toEqual(before);
  });
});
