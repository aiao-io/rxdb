import { describe, expect, it } from 'vitest';
import { checkPermission, grantPermission, revokePermission } from './permissions.js';
import { createState } from './state.js';

describe('DESKTOP-US-401 默认拒绝与授权生命周期', () => {
  const identity = { appId: 'editor', origin: 'https://desktop.test', instanceId: 'one', capabilities: ['files'] };
  it('默认拒绝，拒绝未声明能力', () => {
    const state = createState('windows');
    expect(checkPermission(state, identity, 'files', 'a')).toBe(false);
    expect(() => grantPermission(state, identity, 'clipboard', '*', true)).toThrow('DENIED');
    expect(state.grants).toEqual([]);
  });
  it('会话授权不复用于下一实例，不扩展文件范围', () => {
    const state = createState('windows');
    grantPermission(state, identity, 'files', 'a', false);
    expect(checkPermission(state, identity, 'files', 'a')).toBe(true);
    expect(checkPermission(state, identity, 'files', 'b')).toBe(false);
    expect(checkPermission(state, { ...identity, instanceId: 'two' }, 'files', 'a')).toBe(false);
  });
  it('持久授权绑定批准来源，撤销立即生效', () => {
    const state = createState('windows');
    const grant = grantPermission(state, identity, 'files', '*', true);
    expect(checkPermission(state, { ...identity, instanceId: 'two' }, 'files', 'a')).toBe(true);
    expect(checkPermission(state, { ...identity, origin: 'https://other.test' }, 'files', 'a')).toBe(false);
    revokePermission(state, grant.id);
    expect(checkPermission(state, identity, 'files', 'a')).toBe(false);
  });
});
