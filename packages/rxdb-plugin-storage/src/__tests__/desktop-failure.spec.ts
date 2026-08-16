// @vitest-environment node
/**
 * @fileoverview host 报错时 storage 服务层的错误码与补偿语义（US-504 AC#6）。
 *
 * @remarks
 * `desktop-filesystem.spec.ts` 验的是接缝自己把 host 错误翻成了什么；这里验的是**再往上一层**：
 * 同一个失败穿过 service 的写-提交-补偿流程之后，调用方看到的是不是同一个稳定错误码，
 * 以及失败的那一步有没有把数据留在「meta 说有、文件没了」这类中间态上。
 *
 * 故障是注入在传输层上的（按请求 kind 拦截），host 与磁盘都是真的 —— 这样补偿路径上
 * 真正发出去的那些请求（writeAbort / remove）走的仍是真实实现，不会被替身放水。
 *
 * @module rxdb-plugin-storage/__tests__/desktop-failure
 */

import {
  DESKTOP_ADAPTER_NAME,
  type DesktopHostTransport,
  type RxDBAdapterDesktopErrorCode
} from '@aiao/rxdb-adapter-desktop';
import { createDesktopFileHost, type DesktopFileHost } from '@aiao/rxdb-adapter-desktop/host';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopStorageFilesystem } from '../desktop.js';
import { StorageBackendError } from '../errors.js';
import { ObjectUrlRegistry } from '../object-url.js';
import type { RxdbFileStorage } from '../storage.service.js';
import { createService, FakeStorageFileMeta } from './fixtures/memory-storage.js';

/** 一条注入的故障：命中该 kind 的请求一律以 host 错误应答作答。 */
interface InjectedFault {
  /** 要拦截的协议请求 kind，例如 `file.writeCommit`。 */
  readonly kind: string;
  /** host 侧错误码；**不是** storage 的后端错误码 —— 翻译由被测代码负责。 */
  readonly code: RxDBAdapterDesktopErrorCode;
  /** host 侧错误描述。 */
  readonly message: string;
}

let workspace: string;
let host: DesktopFileHost;
let service: RxdbFileStorage;
let faults: InjectedFault[];

/** 递归收集磁盘目录树里的全部条目名。 */
const collectDiskNames = async (directory: string): Promise<string[]> => {
  const names: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    names.push(entry.name);
    if (entry.isDirectory()) names.push(...(await collectDiskNames(join(directory, entry.name))));
  }
  return names;
};

/** 存储根下残留的临时条目；补偿走完后应当为空。 */
const temporaryNames = async (): Promise<string[]> =>
  (await collectDiskNames(workspace))
    .filter(name => name.includes('.rxdb-storage-') || name.endsWith('.rxdb-tmp'))
    .sort();

/** 捕获 rejected 的错误对象本身；`rejects.toThrow` 只比对消息，断言不到 `code`。 */
const captureRejection = async (task: Promise<unknown>): Promise<unknown> => {
  try {
    await task;
    return null;
  } catch (error) {
    return error;
  }
};

const textFile = (name: string, content: string): File => new File([content], name, { type: 'text/plain' });

beforeEach(async () => {
  FakeStorageFileMeta.reset();
  faults = [];
  workspace = await mkdtemp(join(tmpdir(), 'rxdb-desktop-fail-'));
  host = createDesktopFileHost({ resolveStorageRoot: () => join(workspace, 'rxdb-files') });
  const transport: DesktopHostTransport = {
    request: async payload => {
      const fault = faults.find(candidate => candidate.kind === payload.kind);
      if (!fault) return host.handle(payload);
      return { kind: 'error', code: fault.code, message: fault.message };
    },
    subscribe: () => () => undefined
  };
  service = createService(
    { filesystem: createDesktopStorageFilesystem({ transport }) },
    new ObjectUrlRegistry(() => 'blob:x', vi.fn()),
    FakeStorageFileMeta,
    DESKTOP_ADAPTER_NAME
  ).service;
});

afterEach(async () => {
  await service.destroy();
  host.closeAll();
  await rm(workspace, { recursive: true, force: true });
});

describe('host 失败时的服务层语义（AC#6）', () => {
  it('提交阶段磁盘满：以 disk_full 拒绝，不建 metadata，不留半写文件', async () => {
    faults.push({ kind: 'file.writeCommit', code: 'disk_full', message: 'ENOSPC: no space left on device' });

    const error = await captureRejection(service.upload(textFile('doc.txt', 'v1')));

    expect(error).toBeInstanceOf(StorageBackendError);
    expect(error).toMatchObject({ code: 'disk_full' });
    // 「写失败了但 meta 建好了」会让后续 read 永远 404，比直接失败更难查。
    await expect(service.list()).resolves.toEqual([]);
    await expect(service.listEntries()).resolves.toEqual([]);
    await expect(temporaryNames()).resolves.toEqual([]);
  });

  it('覆盖写失败：旧内容、旧 metadata 与 contentVersion 一并保持不变', async () => {
    const meta = await service.upload(textFile('doc.txt', 'v1'));
    faults.push({ kind: 'file.writeCommit', code: 'disk_full', message: 'ENOSPC: no space left on device' });

    await expect(service.upload(textFile('doc.txt', 'v2'), { overwrite: true })).rejects.toMatchObject({
      code: 'disk_full'
    });

    faults.length = 0;
    const current = await service.getMeta(meta.id);
    expect(current).toMatchObject({ id: meta.id, contentVersion: 1, size: 2 });
    await expect((await service.read(meta.id)).text()).resolves.toBe('v1');
    await expect(temporaryNames()).resolves.toEqual([]);
  });

  it('权限不足：原样透出 permission_denied 与 host 的原始描述，不降级成通用错误', async () => {
    faults.push({ kind: 'file.writeBegin', code: 'permission_denied', message: 'EACCES: permission denied' });

    const error = await captureRejection(service.upload(textFile('doc.txt', 'v1')));

    // 降级成 backend_internal_error 或裸 Error，调用方就无法区分「换个路径重试」与「这台机器没权限」。
    expect(error).toMatchObject({
      code: 'permission_denied',
      detail: expect.objectContaining({ code: 'permission_denied', message: 'EACCES: permission denied' })
    });
    await expect(service.list()).resolves.toEqual([]);
  });

  it('删除时文件删不掉：metadata 补偿回来，不留「meta 没了文件还在」', async () => {
    const meta = await service.upload(textFile('doc.txt', 'v1'));
    faults.push({ kind: 'file.remove', code: 'permission_denied', message: 'EACCES: permission denied' });

    await expect(service.delete(meta.id)).rejects.toMatchObject({ code: 'permission_denied' });

    faults.length = 0;
    expect(await service.getMeta(meta.id)).toMatchObject({ id: meta.id, opfsPath: 'doc.txt' });
    await expect((await service.read(meta.id)).text()).resolves.toBe('v1');
  });

  it('host 整体不可用：init 即失败，不静默退回浏览器存储', async () => {
    faults.push({ kind: 'file.open', code: 'host_unavailable', message: 'host is gone' });

    // 静默退回 OPFS 会让文件与 SQLite 库分处两个备份域 —— 正是 US-504 要消灭的状态。
    await expect(service.init()).rejects.toMatchObject({ code: 'backend_unavailable' });
    await expect(service.upload(textFile('doc.txt', 'v1'))).rejects.toMatchObject({ code: 'backend_unavailable' });
    await expect(temporaryNames()).resolves.toEqual([]);
  });
});
