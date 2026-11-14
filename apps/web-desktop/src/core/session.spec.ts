import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors.js';
import { createFile } from './files.js';
import { migrateState } from './layout.js';
import { isJson, validateState } from './session.js';
import { createState, validateProfile } from './state.js';

describe('DESKTOP-US-501/503 持久化与恢复输入边界', () => {
  it('验证真实会话边界、文件引用及私有 JSON', () => {
    const state = createState('windows');
    const file = createFile(state, { name: 'a.txt' });
    state.appData.push({ appId: 'editor', schemaVersion: 1, key: 'x', value: { list: [null, true, 1, '文本'] } });
    state.session.push({
      id: crypto.randomUUID(),
      appId: 'editor',
      fileId: file.id,
      route: '#document',
      workspaceId: 'first',
      bounds: { x: 0, y: 0, width: 800, height: 500 },
      state: 'normal',
      previousState: 'normal',
      beforeMinimized: 'normal'
    });
    expect(validateState(state)).toBe(state);
    expect(isJson({ x: [null, false, 0, 'a'] })).toBe(true);
    expect(isJson({ invalid: undefined })).toBe(false);
    expect(isJson(Number.POSITIVE_INFINITY)).toBe(false);
    expect(errorMessage(new Error('原始错误'))).toBe('原始错误');
    expect(errorMessage(null)).toBe('操作失败');
  });
  it('拒绝缺少坐标的会话、额外顶层字段及无效元数据', () => {
    const state = createState('macos');
    const win = {
      appId: 'editor',
      fileId: null,
      route: '',
      workspaceId: 'first',
      bounds: { width: 800, height: 500 },
      state: 'normal'
    };
    expect(() => validateState({ ...state, session: [win] })).toThrow('INVALID');
    expect(() => validateState({ ...state, tokens: '不应进入托管数据' })).toThrow('INVALID');
    expect(() => validateState({ ...state, schemaVersion: 99 })).toThrow('INVALID');
    expect(() => validateState({ ...state, workspaces: [] })).toThrow('INVALID');
  });
  it('损坏目录、重复身份、同目录重名不能恢复', () => {
    const state = createState('windows');
    const dir = createFile(state, { name: '目录', kind: 'directory' });
    const file = createFile(state, { name: 'a', parentId: dir.id });
    const duplicate = structuredClone(state);
    duplicate.files.push({ ...file });
    expect(() => validateState(duplicate)).toThrow('INVALID');
    const cycle = structuredClone(state);
    cycle.files[0].parentId = dir.id;
    expect(() => validateState(cycle)).toThrow('INVALID');
    const orphan = structuredClone(state);
    orphan.files[1].parentId = 'missing';
    expect(() => validateState(orphan)).toThrow('INVALID');
    const badRevision = structuredClone(state);
    badRevision.files[1].revision = 0;
    expect(() => validateState(badRevision)).toThrow('INVALID');
  });
  it.each([50, 201, Number.NaN])('非法缩放 %s 不写入', scale => {
    expect(() => validateProfile({ ...createState('windows').profile, scale })).toThrow('INVALID');
  });
  it('v1 会话升级到当前版本，文件、授权和窗口顺序保持不变，旧输入不被修改', () => {
    const legacy = { ...createState('windows'), schemaVersion: 1 } as Record<string, unknown>;
    delete legacy['navigation'];
    legacy['session'] = [
      {
        appId: 'editor',
        fileId: null,
        route: '',
        workspaceId: 'first',
        bounds: { x: 0, y: 0, width: 800, height: 500 },
        state: 'normal'
      }
    ];
    const snapshot = structuredClone(legacy);
    const upgraded = migrateState(legacy);
    expect(upgraded.schemaVersion).toBe(5);
    expect(upgraded).toHaveProperty('navigation', { workspaceId: 'first', activeWindows: { first: 0 } });
    expect(upgraded.session).toEqual(
      (legacy['session'] as object[]).map(win => ({
        ...win,
        id: expect.any(String),
        previousState: 'normal',
        beforeMinimized: 'normal'
      }))
    );
    expect(legacy).toEqual(snapshot);
    expect(() => migrateState({ ...legacy, secret: '不应迁移未知字段' })).toThrow('INVALID');
    expect(() => migrateState({ ...legacy, schemaVersion: 99 })).toThrow('INVALID');
  });
  it('拒绝失效的工作区、跨区活动窗口、最小化活动窗口和额外导航字段', () => {
    const state = createState('windows');
    state.session.push({
      id: crypto.randomUUID(),
      appId: 'editor',
      fileId: null,
      route: '',
      workspaceId: 'first',
      bounds: { x: 0, y: 0, width: 800, height: 500 },
      state: 'normal',
      previousState: 'normal',
      beforeMinimized: 'normal'
    });
    expect(() =>
      validateState({ ...state, navigation: { workspaceId: 'missing', activeWindows: { first: 0 } } })
    ).toThrow('INVALID');
    expect(() =>
      validateState({ ...state, navigation: { workspaceId: 'first', activeWindows: { first: 9 } } })
    ).toThrow('INVALID');
    expect(() =>
      validateState({
        ...state,
        navigation: { workspaceId: 'first', activeWindows: { first: null }, token: '额外字段' }
      })
    ).toThrow('INVALID');
    const minimized = {
      ...state,
      session: [{ ...state.session[0], state: 'minimized' }],
      navigation: { workspaceId: 'first', activeWindows: { first: 0 } }
    };
    expect(() => validateState(minimized)).toThrow('INVALID');
    expect(() =>
      validateState({
        ...state,
        workspaces: [...state.workspaces, { id: 'other', name: '另一区' }],
        navigation: { workspaceId: 'other', activeWindows: { first: null, other: 0 } }
      })
    ).toThrow('INVALID');
  });
});
