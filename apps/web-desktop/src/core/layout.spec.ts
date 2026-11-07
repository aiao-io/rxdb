import { describe, expect, it } from 'vitest';
import { migrateState } from './layout.js';
import { validateState } from './session.js';
import { createState } from './state.js';

describe('DESKTOP-US-501 v3 窗口还原状态升级', () => {
  function legacySession(state: string) {
    return {
      ...createState('windows'),
      schemaVersion: 3,
      session: [
        {
          appId: 'editor',
          fileId: null,
          route: '/documents/saved?line=2#L2',
          workspaceId: 'first',
          bounds: { x: 90, y: 48, width: 800, height: 520 },
          state
        }
      ]
    };
  }

  it.each(['normal', 'left', 'right', 'maximized', 'minimized'])(
    '升级 %s 保留已有字段，缺失的前态明确初始化为普通窗口',
    state => {
      const legacy = legacySession(state);
      const original = structuredClone(legacy);
      const upgraded = migrateState(legacy);
      expect(upgraded.schemaVersion).toBe(4);
      expect(upgraded.session[0]).toEqual({
        ...original.session[0],
        previousState: 'normal',
        beforeMinimized: 'normal'
      });
      expect(legacy).toEqual(original);
    }
  );

  it('当前版本缺少还原前态或包含非法前态时拒绝恢复', () => {
    const upgraded = migrateState(legacySession('minimized'));
    const without = structuredClone(upgraded) as unknown as { session: Record<string, unknown>[] };
    delete without.session[0]['beforeMinimized'];
    expect(() => validateState(without)).toThrow('INVALID');
    expect(() =>
      validateState({ ...upgraded, session: [{ ...upgraded.session[0], previousState: 'maximized' }] })
    ).toThrow('INVALID');
    expect(() =>
      validateState({ ...upgraded, session: [{ ...upgraded.session[0], beforeMinimized: 'minimized' }] })
    ).toThrow('INVALID');
  });

  it('损坏的旧会话拒绝升级且不修改原始输入', () => {
    const legacy = { ...legacySession('minimized'), session: [null] };
    const original = structuredClone(legacy);
    expect(() => migrateState(legacy)).toThrow('INVALID');
    expect(legacy).toEqual(original);
  });
});
