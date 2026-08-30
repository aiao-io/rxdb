/**
 * @fileoverview 页内 connector 的 provider 接缝装配。
 *
 * @remarks
 * 领域是**逐个**接上的，没接上的领域一律**不宣告 descriptor**，由授权层回
 * `provider_unsupported`。这比宣告一个 `kind: 'unavailable'` 更准确：`unavailable` 说的是
 * 「这个能力在本运行时存在但此刻用不了」，而 `database` 在页内是**还没实现 v2 操作**，
 * 面板对这两者的提示语和重试入口都不同。
 *
 * 当前接上的：
 *
 * - `files` — OPFS（US-904 阶段 C2）。
 * - `settings` — 只有恒定拒绝的 `export`（AC#43 的 connector 侧）。
 * - `database` — RxDB（US-904 阶段 D AC#46）；要求**同时**拿到实例入口与实体元数据，见
 *   {@link ConnectorProviderPorts.getEntityMetadata}。
 *
 * @module @aiao/rxdb-devtools/connector-providers
 */

import type { DevToolsProviderDescriptor, DevToolsProviderDomain } from './provider/descriptor.js';
import type { DevToolsProvider } from './provider/types.js';
import { createDevToolsBrowserSettingsProvider } from './browser/settings-provider.js';
import type { DevToolsOpfsFilesProvider } from './browser/opfs-files-provider.js';
import { createDevToolsOpfsFilesProvider } from './browser/opfs-files-provider.js';
import type { DevToolsRxDB, GetEntityMetadataFn } from './connector-types.js';
import type { DevToolsRxdbDatabaseProvider } from './rxdb/database-provider.js';
import { createDevToolsRxdbDatabaseProvider } from './rxdb/database-provider.js';
import type { DevToolsMutationPolicy } from './v2/authorization.js';
import { DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES } from './v2/constants.js';
import type { DevToolsProviderRegistry } from './v2/endpoint.js';

/**
 * 页内 connector 的默认写入开关。
 *
 * @remarks
 * 默认 `'omit'`：`files` 的 `upload` / `create-directory` / `delete` 都是 `full` 档写操作，
 * 「接上 provider」这一步不应该顺带把写路径也打开。owner 要写入必须显式表态。
 */
export const CONNECTOR_MUTATION_POLICY: DevToolsMutationPolicy = 'omit';

/**
 * 探测本页是否具备 OPFS。
 *
 * @remarks
 * 这不是「拿不到就退化成别的存储」的兜底，而是 descriptor 模型要求的**能力申报**：
 * 没有 OPFS 就不宣告 `files` 领域，面板据此不点亮文件页，而不是点亮之后逐个操作失败。
 *
 * @returns 有 OPFS 时返回根目录入口，否则 `undefined`。
 */
export function resolveBrowserOpfsRoot(): (() => Promise<FileSystemDirectoryHandle>) | undefined {
  const storage = globalThis.navigator?.storage;
  if (typeof storage?.getDirectory !== 'function') return undefined;
  return () => storage.getDirectory();
}

/**
 * 用页面自己的下载路径保存一个文件。
 *
 * @remarks
 * 字节不进 JS 堆也不过 wire——object URL 让 Blob 继续由 OPFS 承载。
 * 见 OPFS provider 模块头第 2 条。
 *
 * @param file - 要保存的文件。
 * @param name - 建议的文件名。
 */
export async function saveFileThroughPage(file: File, name: string): Promise<void> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  await Promise.resolve();
}

/** 装配页内 provider 接缝的输入。 */
export interface ConnectorProviderPorts {
  /** OPFS 根目录入口；省略即本页没有 OPFS，`files` 领域不宣告。 */
  getRootDirectory?: () => Promise<FileSystemDirectoryHandle>;
  /** 把一个文件交给页面自己的保存路径；见 OPFS provider 模块头第 2 条。 */
  saveToDisk?: (file: File, name: string) => Promise<void>;
  /** RxDB 接入口；省略即不宣告 `database` 领域。 */
  database?: ConnectorDatabasePorts;
}

/**
 * `database` 领域的接入口；**三项缺一不可**。
 *
 * @remarks
 * 写成一个整体而不是三个各自可选的字段，是为了让「接了一半」在类型上就不存在：
 *
 * - 没有 `getEntityMetadata` 就不知道哪些字段是密文，遮罩表会算成空集，查询结果与事件把
 *   密文列**原样**推给面板；
 * - 没有 `emitEvent` 则 `events` 订阅建得起来、事件却无处可去，面板会一直等一条不会来的帧。
 *
 * 两种情况都必须表现为「不宣告这个领域」，而不是「宣告之后少做一件事」。
 */
export interface ConnectorDatabasePorts {
  /** 取当前 RxDB 实例；返回 `undefined` 表示还没 init（操作回 `provider_unavailable`）。 */
  getRxDB: () => DevToolsRxDB | undefined;
  /** 实体元数据读取函数（通常是 `@aiao/rxdb` 的 `getEntityMetadata`）。 */
  getEntityMetadata: GetEntityMetadataFn;
  /** 把一条已遮罩的 RxDB 事件推给对端；通常接 v2 端点的 `emitEvent`。 */
  emitEvent: (eventType: string, data: unknown) => void;
}

/**
 * 页内装配出来的 registry。
 *
 * @remarks
 * 比 {@link DevToolsProviderRegistry} 多一个 {@link dispose}：`database` provider 会在 RxDB 实例上
 * 挂 25 个事件监听，只拆端点不拆订阅的话，被替换掉的实例会因为监听器还在而无法回收。
 */
export interface ConnectorProviderRegistry extends DevToolsProviderRegistry {
  /** 回收本次装配持有的全部订阅；幂等。 */
  dispose(): void;
}

/**
 * 按本页实际具备的能力装配 provider 接缝。
 *
 * @remarks
 * `provider()` 与 `createChunkSink()` 对未装配的领域**抛错**而不是返回一个「什么都不支持」
 * 的替身：替身会把一处接线错误变成一条看起来正常的协议应答，而这里需要它立刻炸出来。
 * 未装配的领域在授权层就已经被 descriptor 集拦下，抛错在结构上不可达。
 *
 * @param ports - 本页可用的宿主入口。
 * @returns 可直接交给 v2 端点的 registry，外加一个订阅回收入口。
 */
export function createConnectorProviders(ports: ConnectorProviderPorts = {}): ConnectorProviderRegistry {
  const files: DevToolsOpfsFilesProvider | undefined =
    ports.getRootDirectory === undefined
      ? undefined
      : createDevToolsOpfsFilesProvider({
          getRootDirectory: ports.getRootDirectory,
          maxTransferBytes: DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES,
          saveToDisk: ports.saveToDisk
        });

  const database: DevToolsRxdbDatabaseProvider | undefined =
    ports.database === undefined
      ? undefined
      : createDevToolsRxdbDatabaseProvider({ ...ports.database, runtime: 'browser' });

  const providers = new Map<DevToolsProviderDomain, DevToolsProvider>([
    ['settings', createDevToolsBrowserSettingsProvider()]
  ]);
  if (files !== undefined) providers.set('files', files);
  if (database !== undefined) providers.set('database', database);

  // descriptor 顺序跟着领域枚举走，而不是跟着装配顺序：wire 上的顺序必须是可复现的。
  const descriptors: readonly DevToolsProviderDescriptor[] = (['database', 'files', 'settings'] as const)
    .map(domain => providers.get(domain)?.descriptor)
    .filter((descriptor): descriptor is DevToolsProviderDescriptor => descriptor !== undefined);

  return {
    descriptors,
    provider: domain => {
      const provider = providers.get(domain);
      if (provider === undefined) throw new Error(`no in-page devtools provider for domain "${domain}"`);
      return provider;
    },
    createChunkSink: name => {
      if (files === undefined) throw new Error(`no in-page devtools chunk sink for transfer "${name}"`);
      return files.createChunkSink(name);
    },
    // 浏览器 OPFS 的字节不过 wire：它由页面自己保存（见 `opfs-files-provider.ts` 模块头第 2 条），
    // 所以这里恒为「已在源侧交付」。这**不是**「不支持下载」——descriptor 里 `download` 是宣告了的。
    createChunkSource: () => undefined,
    dispose: () => database?.dispose()
  };
}
