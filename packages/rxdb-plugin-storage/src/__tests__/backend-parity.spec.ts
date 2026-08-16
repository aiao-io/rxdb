// @vitest-environment node
/**
 * @fileoverview 把共享的 storage 行为套件跑在包内两个后端上（US-504 AC#2）。
 *
 * @remarks
 * 用例体在 `storage-backend-parity.suite.ts` 里，本文件只负责「怎么把后端装起来」。
 * 拆开是因为第三个后端（Tauri 的 Rust 宿主）在另一个项目里，跨项目复用要求套件可导出，
 * 而 `.spec.ts` 会被 `tsconfig.lib.json` 排除在构建之外（US-505 AC#2）。
 *
 * 桌面一侧接的是真实 host + 真实临时目录（不是断言 mock），因此这里同时也是
 * 「host 协议 → 原生文件」这条链路的集成测试。
 *
 * @module rxdb-plugin-storage/__tests__/backend-parity
 */

import { DESKTOP_ADAPTER_NAME, type DesktopHostTransport } from '@aiao/rxdb-adapter-desktop';
import { createDesktopFileHost, type DesktopFileHost } from '@aiao/rxdb-adapter-desktop/host';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { createDesktopStorageFilesystem } from '../desktop.js';
import { createOpfsStorageFilesystem } from '../filesystem/opfs-filesystem.js';
import { MemoryDirectoryHandle } from './fixtures/memory-storage.js';
import { isTemporaryStorageName, storageBackendParitySuite, type ParityBackend } from './storage-backend-parity.suite.js';

/** 递归收集内存目录树里的全部条目名。 */
const collectMemoryNames = (directory: MemoryDirectoryHandle): string[] => {
  const names = [...directory.files.keys()];
  for (const [name, child] of directory.directories) {
    names.push(name, ...collectMemoryNames(child));
  }
  return names;
};

/** 递归收集磁盘目录树里的全部条目名。 */
const collectDiskNames = async (directory: string): Promise<string[]> => {
  const names: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    names.push(entry.name);
    if (entry.isDirectory()) names.push(...(await collectDiskNames(join(directory, entry.name))));
  }
  return names;
};

const createOpfsBackend = (): ParityBackend => {
  let rootHandle = new MemoryDirectoryHandle();

  return {
    name: 'opfs',
    localAdapterName: 'sqlite',
    async setup() {
      rootHandle = new MemoryDirectoryHandle();
      Object.defineProperty(globalThis, 'navigator', {
        value: { storage: { getDirectory: vi.fn(async () => rootHandle) } },
        configurable: true
      });
      return {};
    },
    async teardown() {
      // 内存句柄随 rootHandle 一起被下一次 setup 丢掉，没有需要归还的资源。
    },
    createRawFilesystem() {
      return createOpfsStorageFilesystem('files', { localAdapterName: 'sqlite' });
    },
    async temporaryNames() {
      return collectMemoryNames(rootHandle).filter(isTemporaryStorageName).sort();
    }
  };
};

const createDesktopBackend = (): ParityBackend => {
  let workspace = '';
  let host: DesktopFileHost | null = null;
  let transport: DesktopHostTransport | null = null;

  return {
    name: 'desktop',
    localAdapterName: DESKTOP_ADAPTER_NAME,
    async setup() {
      workspace = await mkdtemp(join(tmpdir(), 'rxdb-parity-'));
      const created = createDesktopFileHost({ resolveStorageRoot: () => join(workspace, 'rxdb-files') });
      host = created;
      // 直连 host：renderer 侧后端接的是真实文件系统，不是断言 mock。
      transport = { request: payload => created.handle(payload), subscribe: () => () => undefined };
      return { filesystem: createDesktopStorageFilesystem({ transport }) };
    },
    async teardown() {
      host?.closeAll();
      host = null;
      transport = null;
      await rm(workspace, { recursive: true, force: true });
    },
    createRawFilesystem() {
      if (!transport) throw new Error('desktop backend not set up');
      return createDesktopStorageFilesystem({ transport })('files', { localAdapterName: DESKTOP_ADAPTER_NAME });
    },
    async temporaryNames() {
      return (await collectDiskNames(workspace)).filter(isTemporaryStorageName).sort();
    }
  };
};

storageBackendParitySuite(createOpfsBackend());
storageBackendParitySuite(createDesktopBackend());
