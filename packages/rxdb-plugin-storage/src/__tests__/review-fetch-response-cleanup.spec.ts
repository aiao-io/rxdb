// @vitest-environment node

import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
