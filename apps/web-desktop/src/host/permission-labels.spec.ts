import { describe, expect, it } from 'vitest';
import { capabilities } from '../core/catalog.js';
import { createFile, trashFile } from '../core/files.js';
import { grantPermission } from '../core/permissions.js';
import { createState } from '../core/state.js';
import { capabilityLabel, fileScopeLabel, permissionView } from './permission-labels.js';

describe('DESKTOP-US-401/AC1/3 可理解的能力和文件授权范围', () => {
  it('全部批准能力都有用户可读的中文说明，内部能力代码不作为说明', () => {
    for (const capability of capabilities) {
      expect(capabilityLabel(capability)).toMatch(/\p{Script=Han}/u);
      expect(capabilityLabel(capability)).not.toContain(capability);
    }
  });

  it('未知能力明确拒绝，不把内部代码当成用户说明', () => {
    expect(() => capabilityLabel('unknown')).toThrow('DENIED');
  });

  it('全部文件和默认目录说明准确区分访问范围', () => {
    const state = createState('windows');
    expect(fileScopeLabel(state, '*')).toBe('全部桌面文件与目录');
    expect(fileScopeLabel(state, 'directory:root')).toBe('目录「我的文件」');
  });

  it('相同文件名通过完整虚拟路径区分，说明不包含内部身份且不修改状态', () => {
    const state = createState('windows');
    const first = createFile(state, { name: '文稿', kind: 'directory' });
    const second = createFile(state, { name: '归档', parentId: first.id, kind: 'directory' });
    const root = createFile(state, { name: '说明 🌏.txt' });
    const nested = createFile(state, { name: '说明 🌏.txt', parentId: second.id });
    const before = structuredClone(state);
    expect(fileScopeLabel(state, root.id)).toBe('文件「我的文件/说明 🌏.txt」');
    expect(fileScopeLabel(state, nested.id)).toBe('文件「我的文件/文稿/归档/说明 🌏.txt」');
    expect(fileScopeLabel(state, nested.id)).not.toContain(nested.id);
    expect(state).toEqual(before);
  });

  it('目录身份和目录写入授权均显示真实目录路径', () => {
    const state = createState('windows');
    const directory = createFile(state, { name: '保存目录', kind: 'directory' });
    expect(fileScopeLabel(state, directory.id)).toBe('目录「我的文件/保存目录」');
    expect(fileScopeLabel(state, `directory:${directory.id}`)).toBe('目录「我的文件/保存目录」');
  });

  it('目录授权不能把普通文件伪装成目录', () => {
    const state = createState('windows');
    const file = createFile(state, { name: '普通文件.txt' });
    expect(() => fileScopeLabel(state, `directory:${file.id}`)).toThrow('INVALID');
  });

  it('已经回收的文件不生成新的访问说明', () => {
    const state = createState('windows');
    const file = createFile(state, { name: '已回收.txt' });
    trashFile(state, file.id);
    const before = structuredClone(state);
    expect(() => fileScopeLabel(state, file.id)).toThrow('TRASHED');
    expect(state).toEqual(before);
  });

  it.each(['../private', 'directory:../private'])('不存在或路径形式的身份 %s 明确拒绝', scope => {
    expect(() => fileScopeLabel(createState('windows'), scope)).toThrow('NOT_FOUND');
  });

  it('目录引用缺失时明确暴露数据问题，不生成伪造路径', () => {
    const state = createState('windows');
    const directory = createFile(state, { name: '缺失目录', kind: 'directory' });
    const file = createFile(state, { name: '文件.txt', parentId: directory.id });
    state.files = state.files.filter(value => value.id !== directory.id);
    expect(() => fileScopeLabel(state, file.id)).toThrow('NOT_FOUND');
  });
});

describe('DESKTOP-US-401/AC4 可撤销的授权记录说明', () => {
  const identity = {
    appId: 'editor',
    origin: 'https://desktop.test',
    instanceId: 'one',
    capabilities: ['files', 'clipboard']
  };

  it('保留内部授权身份，显示实际应用、能力和重命名后的完整文件路径', () => {
    const state = createState('windows');
    const directory = createFile(state, { name: '归档', kind: 'directory' });
    const file = createFile(state, { name: '原名.txt', parentId: directory.id });
    const grant = grantPermission(state, identity, 'files', file.id, true);
    file.name = '新名称.txt';
    const before = structuredClone(state);
    expect(permissionView(state, grant)).toEqual({
      ...grant,
      appName: '文本编辑器',
      capabilityName: '文件访问',
      scopeName: '文件「我的文件/归档/新名称.txt」'
    });
    expect(state).toEqual(before);
  });

  it('回收目录中的授权仍显示完整路径和回收状态，允许用户选择撤销', () => {
    const state = createState('windows');
    const directory = createFile(state, { name: '已回收目录', kind: 'directory' });
    const file = createFile(state, { name: '原文.txt', parentId: directory.id });
    const grant = grantPermission(state, identity, 'files', file.id, false);
    trashFile(state, directory.id);
    expect(permissionView(state, grant).scopeName).toBe('文件「我的文件/已回收目录/原文.txt」（已在回收站）');
    expect(() => fileScopeLabel(state, file.id)).toThrow('TRASHED');
  });

  it('文件永久删除后明确显示记录不存在，不阻止其他授权和撤销入口', () => {
    const state = createState('windows');
    const removed = grantPermission(state, identity, 'files', 'removed-file', true);
    expect(permissionView(state, removed).scopeName).toBe('文件或目录已不存在');
    const all = grantPermission(state, identity, 'files', '*', true);
    expect(permissionView(state, all).scopeName).toBe('全部桌面文件与目录');
    const root = grantPermission(state, identity, 'files', 'directory:root', false);
    expect(permissionView(state, root).scopeName).toBe('目录「我的文件」');
  });

  it('非文件授权提供能力和实际操作说明', () => {
    const state = createState('windows');
    const clipboard = grantPermission(state, identity, 'clipboard', 'write', false);
    expect(permissionView(state, clipboard)).toMatchObject({
      appName: '文本编辑器',
      capabilityName: '剪贴板',
      scopeName: '写入剪贴板'
    });
    const settings = grantPermission(state, { ...identity, capabilities: ['settings'] }, 'settings', '*', true);
    expect(permissionView(state, settings).scopeName).toBe('全部相关托管数据');
  });
});

describe('授权记录范围校验', () => {
  it('已授权目录和剪贴板读取、目标应用均使用可理解的说明', () => {
    const state = createState('windows');
    const directory = createFile(state, { name: '工作目录', kind: 'directory' });
    const identity = {
      appId: 'editor',
      origin: 'https://desktop.test',
      instanceId: 'one',
      capabilities: ['files', 'clipboard', 'messages']
    };
    const folder = grantPermission(state, identity, 'files', `directory:${directory.id}`, true);
    expect(permissionView(state, folder).scopeName).toBe('目录「我的文件/工作目录」');
    const clipboard = grantPermission(state, identity, 'clipboard', 'read', false);
    expect(permissionView(state, clipboard).scopeName).toBe('读取剪贴板');
    const message = grantPermission(state, identity, 'messages', 'notes', false);
    expect(permissionView(state, message).scopeName).toBe('应用「速记本」');
  });

  it('无效范围明确暴露问题，不伪造范围描述', () => {
    const state = createState('windows');
    const identity = {
      appId: 'editor',
      origin: 'https://desktop.test',
      instanceId: 'one',
      capabilities: ['clipboard']
    };
    const grant = grantPermission(state, identity, 'clipboard', 'unknown', false);
    expect(() => permissionView(state, grant)).toThrow('INVALID');
  });
});
