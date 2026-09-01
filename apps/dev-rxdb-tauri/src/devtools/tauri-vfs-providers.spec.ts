import { isDevToolsProviderDescriptor } from '@aiao/rxdb-devtools';
import { describe, expect, it } from 'vitest';
import { mapWaSqliteBackendToProviders } from './tauri-vfs-providers';

/**
 * US-905 AC#6：wa-sqlite 按运行时真实选中的 VFS 决定三领域 provider kind，
 * 不得按 adapter 名 / URL / 平台猜测。断言分三层：kind 正确、descriptor 合法、runtime 只显示。
 */
describe('mapWaSqliteBackendToProviders', () => {
  /** 三份 descriptor 都必须逐份通过共享 guard，否则「声明了」与「合法声明」是两回事。 */
  const assertAllValid = (backend: Parameters<typeof mapWaSqliteBackendToProviders>[0]): void => {
    const providers = mapWaSqliteBackendToProviders(backend);
    expect(isDevToolsProviderDescriptor(providers.database), 'database descriptor 不合法').toBe(true);
    expect(isDevToolsProviderDescriptor(providers.files), 'files descriptor 不合法').toBe(true);
    expect(isDevToolsProviderDescriptor(providers.settings), 'settings descriptor 不合法').toBe(true);
  };

  /** 三个 runtime 字段都必须恒为 `tauri`——runtime 只用于显示，不能决定行为。 */
  const assertRuntimeIsTauri = (backend: Parameters<typeof mapWaSqliteBackendToProviders>[0]): void => {
    const providers = mapWaSqliteBackendToProviders(backend);
    expect(providers.database.runtime).toBe('tauri');
    expect(providers.files.runtime).toBe('tauri');
    expect(providers.settings.runtime).toBe('tauri');
  };

  it('OPFSCoopSyncVFS：database=rxdb、files=opfs、settings=opfs', () => {
    const providers = mapWaSqliteBackendToProviders('OPFSCoopSyncVFS');
    expect(providers.database.kind).toBe('rxdb');
    expect(providers.files.kind).toBe('opfs');
    expect(providers.settings.kind).toBe('opfs');
    // files 声明了 download/upload，传输上限必须大于 0（descriptor guard 的硬约束）。
    expect(providers.files.limits.maxTransferBytes).toBeGreaterThan(0);
    assertAllValid('OPFSCoopSyncVFS');
    assertRuntimeIsTauri('OPFSCoopSyncVFS');
  });

  it('IDBBatchAtomicVFS：database=rxdb、files=unavailable、settings=idb', () => {
    const providers = mapWaSqliteBackendToProviders('IDBBatchAtomicVFS');
    expect(providers.database.kind).toBe('rxdb');
    expect(providers.files.kind).toBe('unavailable');
    expect(providers.settings.kind).toBe('idb');
    // unavailable 必须无操作、带结构化 reason，且不带传输上限。
    expect(providers.files.operations).toEqual([]);
    expect(providers.files.reason).toBe('runtime_unsupported');
    expect(providers.files.limits.maxTransferBytes).toBe(0);
    assertAllValid('IDBBatchAtomicVFS');
    assertRuntimeIsTauri('IDBBatchAtomicVFS');
  });

  it('unavailable：三领域全部结构化 unavailable，且不创建 fallback 语义', () => {
    const providers = mapWaSqliteBackendToProviders('unavailable');
    expect(providers.database.kind).toBe('unavailable');
    expect(providers.files.kind).toBe('unavailable');
    expect(providers.settings.kind).toBe('unavailable');
    for (const descriptor of [providers.database, providers.files, providers.settings]) {
      expect(descriptor.operations).toEqual([]);
      expect(descriptor.reason).toBe('runtime_unsupported');
    }
    assertAllValid('unavailable');
    assertRuntimeIsTauri('unavailable');
  });

  /** 行为只由 kind 决定：同一种 kind 的 descriptor 字段（除 domain）必须逐字一致。 */
  it('相同 kind 在不同后端下产出相同的操作与限额，runtime 不参与分叉', () => {
    const opfs = mapWaSqliteBackendToProviders('OPFSCoopSyncVFS');
    const idb = mapWaSqliteBackendToProviders('IDBBatchAtomicVFS');

    // 两个后端的 database 都是 rxdb：操作与限额必须一致。
    expect(opfs.database.operations).toEqual(idb.database.operations);
    expect(opfs.database.limits).toEqual(idb.database.limits);

    // 两个后端的 settings 都是 export-only：限额一致，只是 kind 不同。
    expect(opfs.settings.operations).toEqual(idb.settings.operations);
    expect(opfs.settings.operations).toEqual(['export']);
  });
});
