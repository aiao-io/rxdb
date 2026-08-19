/**
 * Rust 文件宿主的 storage 行为一致性（US-505 AC#2）。
 *
 * @remarks
 * 与 OPFS、Electron 两个后端跑的是同一份套件、同一份断言，只换了后端装配方式——这是
 * 「Tauri 路径下 storage 的对外行为与其它后端一致」这句话的全部证据。套件本身在
 * `@aiao/rxdb-plugin-storage/testing`，本文件只负责「怎么把 Rust 宿主装成一个后端」。
 *
 * 被测对象是**真的 Rust 进程 + 真实临时目录**：请求经 `createTauriHostTransport` 编码后
 * 走 stdin 进程边界，与生产路径上除了最外层那根管子之外完全同源。
 *
 * 每条用例起一个独立宿主进程：文件宿主的锁表与会话表都是进程内状态，共用一个进程时
 * 上一条用例遗留的锁会以「随机超时」的形式砸到下一条上，而那种失败读不出真正的原因。
 *
 * @vitest-environment happy-dom
 */

import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';
import {
  isTemporaryStorageName,
  storageBackendParitySuite,
  type ParityBackend
} from '@aiao/rxdb-plugin-storage/testing';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect } from 'vitest';
import { TAURI_ADAPTER_NAME } from '../src/index.js';
import { createRustHostTransport } from './rust-host-transport.js';

/** 每个宿主进程退出时留下的诊断信号，攒到 afterAll 一次性断言。 */
interface HostDiagnostics {
  readonly stderr: string;
  readonly deliveryErrors: readonly unknown[];
}

const diagnostics: HostDiagnostics[] = [];

/** 递归收集磁盘目录树里的全部条目名。 */
const collectDiskNames = async (directory: string): Promise<string[]> => {
  const names: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    names.push(entry.name);
    if (entry.isDirectory()) names.push(...(await collectDiskNames(join(directory, entry.name))));
  }
  return names;
};

const createRustBackend = (): ParityBackend => {
  let workspace = '';
  let host: ReturnType<typeof createRustHostTransport> | null = null;

  /** 取当前宿主；没起来说明调用发生在 setup 之外，静默造一个只会让故障挪到别处。 */
  const requireHost = (): NonNullable<typeof host> => {
    if (!host) throw new Error('the rust storage backend is not set up');
    return host;
  };

  return {
    name: 'tauri-rust-host',
    localAdapterName: TAURI_ADAPTER_NAME,
    async setup() {
      workspace = await mkdtemp(join(tmpdir(), 'rxdb-tauri-parity-'));
      host = createRustHostTransport(workspace);
      return { filesystem: createDesktopStorageFilesystem({ transport: host.transport }) };
    },
    async teardown() {
      const running = requireHost();
      // 先把诊断读走再杀进程：`stop()` 之后 stderr 就不再有新内容，但也没人再看得到它。
      diagnostics.push({ stderr: running.process.stderr(), deliveryErrors: running.deliveryErrors() });
      running.process.stop();
      host = null;
      await rm(workspace, { recursive: true, force: true });
    },
    createRawFilesystem() {
      return createDesktopStorageFilesystem({ transport: requireHost().transport })('files', {
        localAdapterName: TAURI_ADAPTER_NAME
      });
    },
    async temporaryNames() {
      return (await collectDiskNames(workspace)).filter(isTemporaryStorageName).sort();
    }
  };
};

afterAll(() => {
  // 宿主 panic 与事件通道故障都不会让任何一条用例变红——它们只在 stderr 上留痕。
  // 不在这里断言，「全绿」就可能是「全绿且宿主一路在报错」。
  expect(diagnostics.filter(entry => entry.stderr !== '')).toEqual([]);
  expect(diagnostics.flatMap(entry => entry.deliveryErrors)).toEqual([]);
});

storageBackendParitySuite(createRustBackend());
