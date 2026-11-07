import { describe, expect, it } from 'vitest';
import { builtins, installApp, uninstallApp, validateManifest } from './catalog.js';
import { isJson } from './session.js';
import { createState } from './state.js';

describe('DESKTOP-US-201/202/205 受控目录', () => {
  it('挂起协议按应用声明，整个目录可通过 JSON 服务响应', () => {
    expect(isJson(builtins)).toBe(true);
    expect(builtins.find(app => app.id === 'notes')).not.toHaveProperty('suspension');
    for (const app of builtins.filter(app => app.id !== 'notes')) expect(app.suspension).toBe(1);
    expect(() => validateManifest({ ...builtins[0], suspension: 2 })).toThrow('INVALID');
  });
  it('包含真实文件、编辑器、设置，严格校验必填字段', () => {
    expect(builtins.map(app => app.id)).toEqual(expect.arrayContaining(['files', 'editor', 'settings']));
    const manifest = builtins[0];
    expect(validateManifest(manifest)).toEqual(manifest);
    expect(() => validateManifest({ ...manifest, protocol: 2 })).toThrow('INVALID');
    expect(() => validateManifest({ ...manifest, id: '' })).toThrow('INVALID');
    expect(() => validateManifest({ ...manifest, entry: ['javascript', 'alert(1)'].join(':') })).toThrow('INVALID');
    expect(() => validateManifest({ ...manifest, capabilities: ['unknown'] })).toThrow('INVALID');
  });
  it('安装幂等、拒绝任意 URL 和未知身份，不产生半安装状态', () => {
    const state = createState('windows');
    installApp(state, 'editor');
    installApp(state, 'editor');
    expect(state.installations.filter(app => app.appId === 'editor')).toHaveLength(1);
    const before = structuredClone(state);
    expect(() => installApp(state, 'https://evil.test/app')).toThrow('DENIED');
    expect(state).toEqual(before);
  });
  it('系统组件不能卸载，卸载编辑器保留共享文件及可选私有数据', () => {
    const state = createState('macos');
    expect(() => uninstallApp(state, 'files', true)).toThrow('DENIED');
    state.appData.push({ appId: 'editor', schemaVersion: 1, key: 'preference', value: 'dark' });
    uninstallApp(state, 'editor', false);
    expect(state.appData).toHaveLength(1);
    installApp(state, 'editor');
    uninstallApp(state, 'editor', true);
    expect(state.appData).toEqual([]);
  });
  it('目录有可选的独立笔记应用，确认安装前没有启动记录', () => {
    const state = createState('windows');
    expect(state.installations.some(app => app.appId === 'notes')).toBe(false);
    const optional = builtins.find(app => app.id === 'notes');
    expect(optional).toMatchObject({ entry: 'notes.html', system: false, instances: 'multiple' });
    installApp(state, 'notes');
    installApp(state, 'notes');
    expect(state.installations.filter(app => app.appId === 'notes')).toHaveLength(1);
  });
});
