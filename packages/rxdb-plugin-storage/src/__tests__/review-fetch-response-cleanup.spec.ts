// @vitest-environment node

import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpfsStorageFilesystem } from '../filesystem/opfs-filesystem.js';
import type { StorageFileWriter, StorageFilesystemFactory } from '../filesystem/storage-filesystem.js';
import { streamReadableToFile, type StorageFileOpsHost } from '../storage.ops.js';
import { FakeStorageFileMeta, MemoryDirectoryHandle, createService } from './fixtures/memory-storage.js';

async function openResponse(status: number, contentType: boolean, complete: boolean) {
  const state = { closed: false, chunks: 0 };
  const server = createServer((_request, response) => {
    response.statusCode = status;
    if (contentType) response.setHeader('Content-Type', 'text/plain');
    response.on('close', () => {
      state.closed = true;
    });
    if (complete) {
      response.end('normal body');
      return;
    }
    response.write('unconsumed body');
    const pump = setInterval(() => {
      state.chunks += 1;
      response.write('x'.repeat(128));
    }, 10);
    response.once('close', () => clearInterval(pump));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('review server has no TCP address');
  return {
    url: `http://127.0.0.1:${address.port}/body`,
    state,
    async close(): Promise<void> {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
  };
}

const nativeFetch = globalThis.fetch;
const responses: Response[] = [];

beforeEach(() => {
  responses.length = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args: Parameters<typeof fetch>) => {
    const response = await nativeFetch(...args);
    responses.push(response);
    return response;
  });
  FakeStorageFileMeta.reset();
  const root = new MemoryDirectoryHandle();
  vi.stubGlobal('navigator', {
    onLine: true,
    storage: { getDirectory: async () => root }
  });
});

afterEach(() => {
  responses.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('评审：fetch 在响应头阶段拒绝时必须关闭响应体', () => {
  it.each([
    [404, true, 'StorageFetchError'],
    [200, false, 'StorageMimeTypeMissingError']
  ] as const)('HTTP %i / MIME %s 的早期拒绝不能留下后台下载', async (status, contentType, name) => {
    const remote = await openResponse(status, contentType, false);
    const controller = new AbortController();
    const { service } = createService();
    try {
      await expect(service.fetch('remote.txt', { url: remote.url, signal: controller.signal })).rejects.toMatchObject({
        name
      });
      await service.destroy();
      try {
        await vi.waitFor(() => expect(remote.state.closed).toBe(true), { timeout: 300, interval: 10 });
      } finally {
        console.log(
          'REVIEW_FETCH_BODY ' +
            JSON.stringify({
              status,
              contentType,
              observedResponses: responses.length,
              bodyLocked: responses[0]?.body?.locked,
              ...remote.state
            })
        );
      }
    } finally {
      controller.abort();
      await remote.close();
      await service.destroy();
    }
  });

  it('对照：正常响应消费完毕后关闭，并写入正确文件内容', async () => {
    const remote = await openResponse(200, true, true);
    const { service } = createService();
    try {
      const file = await service.fetch('normal.txt', { url: remote.url });
      expect(await file.text()).toBe('normal body');
      await vi.waitFor(() => expect(remote.state.closed).toBe(true));
    } finally {
      await remote.close();
      await service.destroy();
    }
  });
});

/** 浏览器 OPFS 后端，只把 `openWrite` 换成恒失败：配额耗尽 / 无权限 / 句柄被占时就是这个形状 */
const failingOpenWrite =
  (error: Error): StorageFilesystemFactory =>
  (rootDir, context) => {
    const base = createOpfsStorageFilesystem(rootDir, context);
    return new Proxy(base, {
      get(target, property) {
        if (property === 'openWrite') return () => Promise.reject(error);
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };

/** 只有写句柄的宿主：`streamReadableToFile` 只碰 `filesystem.openWrite` */
const writeOnlyHost = (openWrite: () => Promise<StorageFileWriter>): StorageFileOpsHost =>
  ({ filesystem: { openWrite } }) as unknown as StorageFileOpsHost;

const quotaExceeded = (): DOMException => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

describe('评审：写流初始化失败时同样要取消已收到的响应体', () => {
  it('响应头已通过、临时文件打不开写流：fetch 以原错拒绝，正文下载随之中止', async () => {
    const remote = await openResponse(200, true, false);
    const quota = quotaExceeded();
    const { service } = createService({ filesystem: failingOpenWrite(quota) });
    try {
      await expect(service.fetch('remote.txt', { url: remote.url })).rejects.toBe(quota);
      await vi.waitFor(() => expect(remote.state.closed).toBe(true), { timeout: 300, interval: 10 });
    } finally {
      await remote.close();
      await service.destroy();
    }
  });

  it('没有输入流：写一个空文件并提交', async () => {
    const writer = { write: vi.fn(async () => undefined), close: vi.fn(async () => undefined), abort: vi.fn() };

    await expect(streamReadableToFile(writeOnlyHost(async () => writer), null, 'empty.bin')).resolves.toBe(0);
    expect(writer.write).toHaveBeenCalledWith(new Blob([]));
    expect(writer.close).toHaveBeenCalledTimes(1);
    expect(writer.abort).not.toHaveBeenCalled();
  });

  it('写句柄打不开：未消费的输入流以原错取消，原错原样抛出', async () => {
    const quota = quotaExceeded();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });

    await expect(streamReadableToFile(writeOnlyHost(() => Promise.reject(quota)), stream, 'tmp.bin')).rejects.toBe(
      quota
    );
    expect(cancel).toHaveBeenCalledWith(quota);
  });

  it('取消输入流本身失败也不顶替原错', async () => {
    const quota = quotaExceeded();
    const stream = new ReadableStream<Uint8Array>({
      cancel: () => Promise.reject(new Error('cancel failed'))
    });

    await expect(streamReadableToFile(writeOnlyHost(() => Promise.reject(quota)), stream, 'tmp.bin')).rejects.toBe(
      quota
    );
  });

  it('输入流已被别处锁住、取读者失败：已打开的写句柄被 abort 释放，原错原样抛出，别人的流不替它取消', async () => {
    const writer = { write: vi.fn(), close: vi.fn(), abort: vi.fn(async () => undefined) };
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const owner = stream.getReader();

    const thrown = await streamReadableToFile(
      writeOnlyHost(async () => writer),
      stream,
      'tmp.bin'
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(TypeError);
    expect(writer.abort).toHaveBeenCalledWith(thrown);
    expect(writer.close).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    owner.releaseLock();
  });
});
