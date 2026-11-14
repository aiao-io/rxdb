import { TestBed } from '@angular/core/testing';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from './app/bom-demo.service';
import { BOM_WORKSPACE_CONFIG } from './config';

const { createDatabase } = vi.hoisted(() => ({ createDatabase: vi.fn() }));
vi.mock('./database', () => ({ createBomDatabase: createDatabase }));
vi.mock('@aiao/rxdb-devtools', () => ({ getDevToolsConnector: () => ({ init: vi.fn(), disconnect: vi.fn() }) }));

const database = (name: string) => {
  const bytes = new TextEncoder().encode(`backup:${name}`);
  const adapter = {
    restore: vi.fn().mockResolvedValue({}),
    dropStorage: vi.fn().mockResolvedValue(undefined),
    rawQuery: vi.fn(async (sql: string) => ({
      rows: sql.includes('FROM "bom$item"') ? [['user-item', name, 'pcs']] : []
    })),
    backup: vi.fn(async (stream: WritableStream<Uint8Array>) => {
      const writer = stream.getWriter();
      await writer.write(bytes);
      await writer.close();
      return { sha256: 'digest', bytes: bytes.length };
    })
  };
  return {
    adapter,
    getAdapter: vi.fn().mockResolvedValue(adapter),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    bom: { whereUsedInstance: vi.fn().mockResolvedValue({ matches: [] }) }
  };
};
const setup = () => {
  const original = database('original');
  const candidate = database('candidate');
  createDatabase.mockReset().mockReturnValueOnce(original).mockReturnValue(candidate);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BOM_WORKSPACE_CONFIG,
        useValue: {
          databaseName: 'isolated-bom',
          overviewPath: '/domain',
          workbenchPath: '/',
          label: '测试'
        }
      }
    ]
  });
  const service = TestBed.inject(BomDemoService);
  return { service, original, candidate };
};
const archive = () => new NodeBlob(['archive']) as unknown as Blob;
afterEach(() => TestBed.resetTestingModule());

describe('领域备份与独立库切换', () => {
  it('非演示数据库可读取，不隐式创建 PCBA 演示修订', async () => {
    const { service } = setup();
    await service.connectExisting();
    expect(service.databaseName()).toBe('isolated-bom');
    expect(service.itemNos().get('user-item')).toBe('original');
    expect(service.ready()).toBe(true);
    expect(service.connected()).toBe(true);
  });
  it('完整备份使用当前 adapter 的归档流与校验和', async () => {
    const { service, original } = setup();
    await service.connectExisting();
    const result = await service.backup();
    expect(result.sha256).toBe('digest');
    expect(result.blob.size).toBe(result.bytes);
    expect(original.adapter.backup).toHaveBeenCalledOnce();
  });
  it('恢复到全新库，切换后保留原库且可回退', async () => {
    const { service, original, candidate } = setup();
    await service.connectExisting();
    const name = await service.restoreBackup(archive());
    expect(name).toMatch(/^bom-r-/);
    expect(new TextEncoder().encode(name).byteLength).toBeLessThanOrEqual(40);
    expect(service.itemNos().get('user-item')).toBe('candidate');
    expect(service.previousDatabase()).toBe('isolated-bom');
    expect(service.databaseName()).toBe(name);
    expect(window.localStorage.getItem('bom:active-database:isolated-bom')).toBe(name);
    expect(original.adapter.dropStorage).not.toHaveBeenCalled();
    expect(original.disconnectAll).toHaveBeenCalledOnce();
    createDatabase.mockReturnValue(original);
    await service.rollbackDatabase();
    expect(service.databaseName()).toBe('isolated-bom');
    expect(service.previousDatabase()).toBe(name);
    expect(service.itemNos().get('user-item')).toBe('original');
    expect(candidate.disconnectAll).toHaveBeenCalledOnce();
  });
  it('损坏归档拒绝后不切换、不断开原库', async () => {
    const { service, original, candidate } = setup();
    await service.connectExisting();
    candidate.adapter.restore.mockRejectedValueOnce(new Error('checksum mismatch'));
    await expect(service.restoreBackup(archive())).rejects.toThrow('checksum');
    expect(service.databaseName()).toBe('isolated-bom');
    expect(service.ready()).toBe(true);
    expect(original.disconnectAll).not.toHaveBeenCalled();
    expect(candidate.disconnectAll).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('bom:active-database:isolated-bom')).toBeNull();
    expect(service.migrating()).toBe(false);
  });
  it('候选库初始化失败恢复原库状态', async () => {
    const { service, original, candidate } = setup();
    await service.connectExisting();
    candidate.bom.whereUsedInstance.mockRejectedValueOnce(new Error('candidate unreadable'));
    await expect(service.restoreBackup(archive())).rejects.toThrow('candidate unreadable');
    expect(service.databaseName()).toBe('isolated-bom');
    expect(service.itemNos().get('user-item')).toBe('original');
    expect(service.ready()).toBe(true);
    expect(original.disconnectAll).not.toHaveBeenCalled();
  });
  it('迁移互斥阻止重置、导出和第二次迁移', async () => {
    const { service, candidate } = setup();
    await service.connectExisting();
    let release: () => void = () => undefined;
    candidate.adapter.restore.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({});
        })
    );
    const migration = service.restoreBackup(archive());
    await expect(service.backup()).rejects.toThrow('正在迁移');
    await expect(service.resetAndSeed()).rejects.toThrow('正在迁移');
    await expect(service.restoreBackup(archive())).rejects.toThrow('正在迁移');
    await vi.waitFor(() => expect(candidate.adapter.restore).toHaveBeenCalled());
    release();
    await migration;
    expect(service.migrating()).toBe(false);
  });
  it('刷新采用上次通过校验的库身份', async () => {
    window.localStorage.setItem('bom:active-database:isolated-bom', 'isolated-bom-restored');
    window.localStorage.setItem('bom:active-database:isolated-bom:previous', 'isolated-bom');
    const { service } = setup();
    await service.connectExisting();
    expect(createDatabase).toHaveBeenCalledWith('isolated-bom-restored');
    expect(service.previousDatabase()).toBe('isolated-bom');
  });
  it('没有保留库时拒绝回退', async () => {
    const { service } = setup();
    await service.connectExisting();
    await expect(service.rollbackDatabase()).rejects.toThrow('没有可回退');
    expect(service.migrating()).toBe(false);
  });
});
