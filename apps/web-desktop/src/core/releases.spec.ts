import { describe, expect, it } from 'vitest';
import { migrateState } from './layout.js';
import {
  getRelease,
  latestRelease,
  requiredPermissionChanges,
  rollbackRelease,
  switchRelease,
  validateReleaseData
} from './releases.js';
import { validateState } from './session.js';
import { createState } from './state.js';

const first = 'a'.repeat(64);
const second = 'b'.repeat(64);

describe('DESKTOP-US-204 应用独立版本与资源固定', () => {
  it('受控版本有变更记录、精确能力与数据兼容声明，拒绝未知版本', () => {
    const old = getRelease('editor', '1.0.0');
    const next = latestRelease('editor');
    expect(next.definition.version).toBe('1.1.0');
    expect(next.changes).not.toHaveLength(0);
    expect(requiredPermissionChanges(old, next)).toEqual(['clipboard']);
    expect(old.definition.capabilities).not.toContain('clipboard');
    expect(() => getRelease('editor', '99.0.0')).toThrow('NOT_FOUND');
    expect(() => getRelease('unknown', '1.0.0')).toThrow();
  });
  it('只切换已验证的完整资源指纹，回退恢复对应资源且不删除私有数据', () => {
    const state = createState('windows');
    const current = state.installations.find(app => app.appId === 'editor')!;
    current.resourceVersion = first;
    state.appData.push({ appId: 'editor', schemaVersion: 1, key: 'document', value: '保留' });
    const originalData = structuredClone(state.appData);
    const expected = structuredClone(current);
    switchRelease(state, 'editor', '1.1.0', second, expected);
    expect(state.installations.find(app => app.appId === 'editor')).toEqual({
      appId: 'editor',
      version: '1.1.0',
      resourceVersion: second,
      previousVersion: '1.0.0',
      previousResourceVersion: first
    });
    rollbackRelease(state, 'editor', structuredClone(state.installations.find(app => app.appId === 'editor')!));
    expect(state.installations.find(app => app.appId === 'editor')).toEqual(expected);
    expect(state.appData).toEqual(originalData);
    expect(() => rollbackRelease(state, 'editor', expected)).toThrow('NOT_FOUND');
  });
  it('并发切换、未固定旧资源、非法资源指纹不改变安装与私有数据', () => {
    const state = createState('macos');
    const current = state.installations.find(app => app.appId === 'editor')!;
    expect(() => switchRelease(state, 'editor', '1.1.0', second, structuredClone(current))).toThrow('NOT_READY');
    current.resourceVersion = first;
    const before = structuredClone(state);
    expect(() => switchRelease(state, 'editor', '1.1.0', '', structuredClone(current))).toThrow('INVALID');
    expect(() => switchRelease(state, 'editor', '1.1.0', second, { ...current, resourceVersion: second })).toThrow(
      'CONFLICT'
    );
    expect(state).toEqual(before);
  });
  it('没有可验证恢复方案时拒绝不可逆迁移，不写入或删除旧数据', () => {
    const state = createState('windows');
    state.appData.push({ appId: 'editor', schemaVersion: 1, key: 'document', value: '旧数据' });
    const release = getRelease('editor', '1.1.0');
    const before = structuredClone(state);
    expect(() =>
      validateReleaseData(state, { ...release, data: { reads: [1], writes: 2, migration: 'irreversible' } })
    ).toThrow('INCOMPATIBLE');
    expect(() =>
      validateReleaseData(state, { ...release, data: { reads: [2], writes: 2, migration: 'none' } })
    ).toThrow('INCOMPATIBLE');
    expect(state).toEqual(before);
  });
  it('v2 记录显式升级资源字段，不修改旧输入或伪造已准备资源', () => {
    const legacy = { ...createState('windows'), schemaVersion: 2 } as Record<string, unknown>;
    const installations = legacy['installations'] as Record<string, unknown>[];
    for (const item of installations) {
      delete item['resourceVersion'];
      delete item['previousResourceVersion'];
    }
    const before = structuredClone(legacy);
    const upgraded = migrateState(legacy);
    expect(upgraded.schemaVersion).toBe(4);
    expect(
      upgraded.installations.every(app => app.resourceVersion === null && app.previousResourceVersion === null)
    ).toBe(true);
    expect(legacy).toEqual(before);
    expect(() =>
      validateState({ ...upgraded, installations: [{ ...upgraded.installations[0], resourceVersion: '../unsafe' }] })
    ).toThrow('INVALID');
  });
  it('备份与持久输入拒绝未安装的固定入口和不成对的回退资源', () => {
    const state = createState('windows');
    expect(() => validateState({ ...state, profile: { ...state.profile, pinned: ['notes'] } })).toThrow('INVALID');
    expect(() => validateState({ ...state, profile: { ...state.profile, shortcuts: ['unknown'] } })).toThrow('INVALID');
    expect(() =>
      validateState({
        ...state,
        installations: state.installations.map(app => ({ ...app, previousResourceVersion: first }))
      })
    ).toThrow('INVALID');
  });
});
