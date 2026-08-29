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
 * - `database` — **未接**；面板的数据库能力仍走 v1 消息，随阶段 C2 后续增量迁移。
 *
 * @module @aiao/rxdb-devtools/connector-providers
 */

import type { DevToolsProviderDescriptor, DevToolsProviderDomain } from './provider/descriptor.js';
import type { DevToolsProvider } from './provider/types.js';
import { createDevToolsBrowserSettingsProvider } from './browser/settings-provider.js';
import type { DevToolsOpfsFilesProvider } from './browser/opfs-files-provider.js';
import { createDevToolsOpfsFilesProvider } from './browser/opfs-files-provider.js';
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
 * @returns 可直接交给 v2 端点的 registry。
 */
export function createConnectorProviders(ports: ConnectorProviderPorts = {}): DevToolsProviderRegistry {
  const files: DevToolsOpfsFilesProvider | undefined =
    ports.getRootDirectory === undefined
      ? undefined
      : createDevToolsOpfsFilesProvider({
          getRootDirectory: ports.getRootDirectory,
          maxTransferBytes: DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES,
          saveToDisk: ports.saveToDisk
        });

  const providers = new Map<DevToolsProviderDomain, DevToolsProvider>([
    ['settings', createDevToolsBrowserSettingsProvider()]
  ]);
  if (files !== undefined) providers.set('files', files);

  // descriptor 顺序跟着领域枚举走，而不是跟着装配顺序：wire 上的顺序必须是可复现的。
  const descriptors: readonly DevToolsProviderDescriptor[] = (['files', 'settings'] as const)
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
    }
  };
}
