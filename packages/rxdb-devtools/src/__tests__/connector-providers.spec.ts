/**
 * 页内 provider 装配（US-904 阶段 D AC#46 的 connector 侧）。
 *
 * @remarks
 * 装配层唯一的判据是**宣告了什么**：descriptor 集就是面板点亮按钮的依据，所以
 * 「接上了 database」和「没接上」必须在这里可分辨，而不是等到某次 invoke 才发现。
 *
 * 有意不测 `provider('database')` 的业务行为——那是 `rxdb/database-provider.spec.ts` 的事。
 * 这里只测接线：领域出不出现、事件回调有没有接到、未装配的领域会不会返回替身。
 */

import type { EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { createConnectorProviders } from '../connector-providers.js';
import type { DevToolsEntityMetadata, GetEntityMetadataFn } from '../connector-types.js';
import { createDevToolsElectronSettingsProvider } from '../native/settings-provider.js';
import { createMockRxDB, listenerCount, type MockRxDB } from './fixtures/mock-rxdb.js';
import { createFakeNativeFilesystem } from './native/fake-native-filesystem.js';

class Article {}

const ARTICLE = Article as unknown as EntityType;

const METADATA = new Map<EntityType, DevToolsEntityMetadata>([[ARTICLE, { name: 'Article', namespace: 'public' }]]);

const getEntityMetadata: GetEntityMetadataFn = entity => METADATA.get(entity);

function mockRxDB(): MockRxDB {
  return createMockRxDB({ config: { dbName: 'devtools', entities: [ARTICLE] } });
}

function domainsOf(ports: Parameters<typeof createConnectorProviders>[0]): readonly string[] {
  return createConnectorProviders(ports).descriptors.map(descriptor => descriptor.domain);
}

describe('页内 provider 装配', () => {
  it('没给 RxDB 入口时不宣告 database', () => {
    // 「接了一半」在类型上就不存在（三项是一个整体），所以这里只有接与不接两种形态。
    expect(domainsOf({})).not.toContain('database');
  });

  it('给了入口时宣告 database，且顺序仍按领域枚举', () => {
    const descriptors = createConnectorProviders({
      database: { getRxDB: () => mockRxDB(), getEntityMetadata, emitEvent: () => undefined }
    }).descriptors;

    // 顺序跟着领域枚举走而不是装配顺序：wire 上的顺序必须可复现。
    expect(descriptors.map(descriptor => descriptor.domain)).toEqual(['database', 'settings']);
    expect(descriptors[0]).toMatchObject({ kind: 'rxdb', runtime: 'browser', limits: { maxTransferBytes: 0 } });
  });

  it('把 provider 推上来的事件交给装配时给的回调', async () => {
    const rxdb = mockRxDB();
    const emitted: { eventType: string; data: unknown }[] = [];
    const providers = createConnectorProviders({
      database: {
        getRxDB: () => rxdb,
        getEntityMetadata,
        emitEvent: (eventType, data) => emitted.push({ eventType, data })
      }
    });

    await providers.provider('database').invoke('events', {});
    rxdb.emit('ENTITY_LOCAL_CREATE', {
      type: 'ENTITY_LOCAL_CREATE',
      entities: [{ entity: 'Article', namespace: 'public', data: { id: 'a1' } }]
    });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.eventType).toBe('ENTITY_LOCAL_CREATE');
  });

  it('dispose 摘掉 database provider 挂在实例上的全部监听', async () => {
    const rxdb = mockRxDB();
    const providers = createConnectorProviders({
      database: { getRxDB: () => rxdb, getEntityMetadata, emitEvent: () => undefined }
    });

    await providers.provider('database').invoke('events', {});
    expect(listenerCount(rxdb)).toBeGreaterThan(0);

    providers.dispose();
    // 只拆端点不拆订阅的话，被换掉的实例会因为监听器还在而无法回收。
    expect(listenerCount(rxdb)).toBe(0);
  });

  it('未装配的领域仍然抛错，不返回「什么都不支持」的替身', () => {
    const providers = createConnectorProviders({});

    expect(() => providers.provider('database')).toThrowError(/database/);
  });
});

describe('页内 provider 装配 — 原生后端（阶段 D）', () => {
  it('给了 nativeFiles 时 files 走 native-files，不再是 OPFS', () => {
    const providers = createConnectorProviders({
      nativeFiles: { filesystem: createFakeNativeFilesystem(), maxTransferBytes: 64 }
    });

    expect(providers.descriptors.find(descriptor => descriptor.domain === 'files')).toMatchObject({
      kind: 'native-files',
      runtime: 'electron'
    });
  });

  it('native files 的下载字节走 wire：createChunkSource 委托给 native provider', async () => {
    const filesystem = createFakeNativeFilesystem();
    filesystem.seedFile(['db', 'main.sqlite'], 4);
    const providers = createConnectorProviders({
      nativeFiles: { filesystem, maxTransferBytes: 64 }
    });

    await providers.provider('files').invoke('download', { path: 'db/main.sqlite', requestId: 'r-1' });
    const source = providers.createChunkSource('r-1');

    expect(source?.totalBytes).toBe(4);
  });

  it('settings 领域用注入的 provider，不落回浏览器 opfs', () => {
    const providers = createConnectorProviders({ settings: createDevToolsElectronSettingsProvider() });

    expect(providers.provider('settings').descriptor).toMatchObject({ kind: 'sqlite', runtime: 'electron' });
  });

  it('runtime 进本层构造的每个 descriptor，不只是 database', () => {
    const providers = createConnectorProviders({
      database: { getRxDB: () => mockRxDB(), getEntityMetadata, emitEvent: () => undefined },
      // OPFS 不是浏览器专有：Tauri / Electron 的 webview 里同样能落在 OPFS 上。
      getRootDirectory: () => Promise.resolve({} as FileSystemDirectoryHandle),
      runtime: 'tauri'
    });

    // 同一套 descriptor 里 database 报 tauri、files 报 browser，面板就说不清「这是哪个宿主」。
    // （settings 不在此列：它整份由宿主注入，runtime 跟着注入的 descriptor 走。）
    const byDomain = new Map(providers.descriptors.map(descriptor => [descriptor.domain, descriptor.runtime]));
    expect(byDomain.get('database')).toBe('tauri');
    expect(byDomain.get('files')).toBe('tauri');
  });

  it('不给 runtime 时 OPFS files 仍报 browser', () => {
    const providers = createConnectorProviders({
      getRootDirectory: () => Promise.resolve({} as FileSystemDirectoryHandle)
    });

    expect(providers.descriptors.find(descriptor => descriptor.domain === 'files')).toMatchObject({
      kind: 'opfs',
      runtime: 'browser'
    });
  });

  it('给了 nativeFiles 也不给 OPFS 时仍不宣告 database 之外的领域', () => {
    const providers = createConnectorProviders({
      nativeFiles: { filesystem: createFakeNativeFilesystem(), maxTransferBytes: 64 }
    });

    expect(providers.descriptors.map(descriptor => descriptor.domain)).toEqual(['files', 'settings']);
  });
});
