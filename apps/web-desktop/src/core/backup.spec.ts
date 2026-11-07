import { describe, expect, it } from 'vitest';
import { exportBackup, validateBackup } from './backup.js';
import { digest } from './bytes.js';
import { createFile } from './files.js';
import { createState } from './state.js';

describe('DESKTOP-US-503 备份格式与完整性', () => {
  it('二进制保真且排除权限、通知及未保存状态', async () => {
    const state = createState('windows');
    const file = createFile(state, { name: '原始.bin', bytes: 'AP8AgA==', mime: 'application/octet-stream' });
    state.grants.push({
      id: 'g',
      appId: 'editor',
      origin: 'https://test',
      capability: 'files',
      scope: '*',
      instanceId: null
    });
    const backup = await exportBackup(state);
    const restored = await validateBackup(backup);
    expect(restored.files[0]).toMatchObject({ id: file.id, bytes: file.bytes });
    expect(restored.grants).toEqual([]);
    expect(JSON.stringify(backup)).not.toContain('https://test');
  });
  it('拒绝损坏字节、错误版本、非法目录与重复身份，不修改原状态', async () => {
    const state = createState('macos');
    createFile(state, { name: 'a.txt', bytes: 'QQ==' });
    const backup = await exportBackup(state);
    const damaged = structuredClone(backup);
    damaged.data.files[0].bytes = 'Qg==';
    await expect(validateBackup(damaged)).rejects.toThrow('INTEGRITY');
    await expect(validateBackup({ ...backup, schemaVersion: 99 })).rejects.toThrow('INVALID');
    await expect(validateBackup({ text: '<script>evil()</script>' })).rejects.toThrow('INVALID');
    expect(state.files[0].bytes).toBe('QQ==');
  });
  it('超过声明上限时拒绝生成或导入', async () => {
    const state = createState('windows');
    createFile(state, { name: 'a.bin', bytes: 'AAAA' });
    await expect(exportBackup(state, 1)).rejects.toThrow('LIMIT');
    const backup = await exportBackup(state);
    await expect(validateBackup(backup, 1)).rejects.toThrow('LIMIT');
  });
  it('v1 备份先按原始数据核验摘要，再升级导航；损坏旧备份不能借迁移通过', async () => {
    const backup = await exportBackup(createState('windows'));
    const data = { ...backup.data, schemaVersion: 1 } as Record<string, unknown>;
    delete data['navigation'];
    const checksum = await digest(new TextEncoder().encode(JSON.stringify(data)));
    const restored = await validateBackup({ ...backup, data, checksum });
    expect(restored.schemaVersion).toBe(4);
    expect(restored.navigation).toEqual({ workspaceId: 'first', activeWindows: { first: null } });
    await expect(validateBackup({ ...backup, data, checksum: 'broken' })).rejects.toThrow('INTEGRITY');
  });
});
