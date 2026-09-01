import { isDevToolsProviderDescriptor } from '@aiao/rxdb-devtools';
import { describe, expect, it } from 'vitest';
import { createWaSqliteDevToolsPorts, mapWaSqliteBackendToProviders } from './tauri-vfs-providers';

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

/**
 * US-905 AC#6 的接线侧：上面那份映射必须**决定运行时真的宣告了什么**，
 * 而不是只有 spec 在调。判据仍然只有一条——宣告了什么。
 */
describe('createWaSqliteDevToolsPorts', () => {
  /** OPFS 根目录入口的替身；descriptor 装配阶段不会调用它。 */
  const opfsRoot = (): Promise<FileSystemDirectoryHandle> => Promise.resolve({} as FileSystemDirectoryHandle);

  it('OPFS 后端：接上 files 领域，settings 用映射出来的 opfs descriptor', () => {
    const ports = createWaSqliteDevToolsPorts('OPFSCoopSyncVFS', opfsRoot);

    expect(ports?.runtime).toBe('tauri');
    expect(ports?.getRootDirectory).toBe(opfsRoot);
    expect(ports?.settings?.descriptor).toEqual(mapWaSqliteBackendToProviders('OPFSCoopSyncVFS').settings);
  });

  it('IDB 后端：不宣告 files 领域，settings 换成 idb descriptor', () => {
    const ports = createWaSqliteDevToolsPorts('IDBBatchAtomicVFS', opfsRoot);

    // files 是 unavailable：宿主入口必须一并撤掉，否则装配层会照样点亮文件页。
    expect(ports?.getRootDirectory).toBeUndefined();
    expect(ports?.settings?.descriptor.kind).toBe('idb');
  });

  it('页面没有 OPFS 时即使后端选了 OPFS 也不宣告 files', () => {
    // 这一支不该发生（后端判定本来就来自 OPFS 探测），但真发生了必须缺声明而不是给个假入口。
    const ports = createWaSqliteDevToolsPorts('OPFSCoopSyncVFS', undefined);

    expect(ports?.getRootDirectory).toBeUndefined();
  });

  it('unavailable：不装配任何 ports，连接器根本不该建起来', () => {
    expect(createWaSqliteDevToolsPorts('unavailable', opfsRoot)).toBeUndefined();
  });
});
