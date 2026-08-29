import type {
  DevToolsPanelEndpoint,
  DevToolsPanelRequestResult,
  DevToolsPanelUploadRequest,
  DevToolsPanelUploadResult
} from '@aiao/rxdb-devtools';
import { describe, expect, it, vi } from 'vitest';
import { createDevToolsV2FileChannel } from './v2-file-channel';

interface RecordedRequest {
  readonly domain: string;
  readonly operation: string;
  readonly params: unknown;
}

/** 只实现信道用得到的两个方法；其余成员一旦被碰到就应当让用例失败，而不是悄悄返回空。 */
function stubEndpoint(handlers: {
  request?: (operation: string, params: unknown) => DevToolsPanelRequestResult;
  upload?: (request: DevToolsPanelUploadRequest) => Promise<DevToolsPanelUploadResult>;
}): { endpoint: DevToolsPanelEndpoint; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const endpoint = {
    request: (domain: string, operation: string, params: unknown) => {
      requests.push({ domain, operation, params });
      return Promise.resolve(handlers.request?.(operation, params) ?? { outcome: 'ok', result: {} });
    },
    upload: (request: DevToolsPanelUploadRequest) =>
      handlers.upload?.(request) ?? Promise.resolve<DevToolsPanelUploadResult>({ outcome: 'sent' })
  } as unknown as DevToolsPanelEndpoint;
  return { endpoint, requests };
}

describe('createDevToolsV2FileChannel', () => {
  it('maps the five verbs onto the files domain', async () => {
    const { endpoint, requests } = stubEndpoint({});
    const channel = createDevToolsV2FileChannel(() => endpoint);

    await channel.download('/a.txt');
    await channel.remove('/a.txt');
    await channel.createDirectory('/docs');

    expect(requests).toEqual([
      { domain: 'files', operation: 'download', params: { path: '/a.txt' } },
      { domain: 'files', operation: 'delete', params: { path: '/a.txt' } },
      { domain: 'files', operation: 'create-directory', params: { path: '/docs' } }
    ]);
  });

  it('takes only the top layer of the subtree the provider returns', async () => {
    // 这份字面量就是 `opfs-files-provider` 的 `list` 出参形状（那一侧另有 spec 钉住）。
    // provider 交子树是 OPFS 的历史包袱，面板一次只渲染一层，嵌套在这里被丢掉。
    const { endpoint } = stubEndpoint({
      request: () => ({
        outcome: 'ok',
        result: {
          path: '',
          entries: [
            { name: 'a.txt', kind: 'file', path: 'a.txt', size: 3, lastModified: 7 },
            { name: 'sub', kind: 'directory', path: 'sub', entries: [{ name: 'deep.txt', kind: 'file', path: 'sub/deep.txt', size: 1, lastModified: 8 }] }
          ]
        }
      })
    });

    const result = await createDevToolsV2FileChannel(() => endpoint).list('/');

    expect(result).toEqual({
      outcome: 'ok',
      value: [
        { name: 'a.txt', kind: 'file', path: 'a.txt', size: 3, lastModified: 7 },
        { name: 'sub', kind: 'directory', path: 'sub' }
      ]
    });
  });

  it('invalidates the whole listing when any item is malformed', async () => {
    // 不做「跳过坏项继续渲染」的容错：那会把一次协议不兼容表现成「目录里少了几个文件」。
    const { endpoint } = stubEndpoint({
      request: () => ({
        outcome: 'ok',
        result: { entries: [{ name: 'a.txt', kind: 'file', path: 'a.txt', size: 3, lastModified: 7 }, { name: 'b', kind: 'socket', path: 'b' }] }
      })
    });

    const result = await createDevToolsV2FileChannel(() => endpoint).list('/');

    expect(result).toEqual({ outcome: 'failed', error: { code: 'invalid_message', retryable: false } });
  });

  it('propagates provider errors untouched', async () => {
    const { endpoint } = stubEndpoint({
      request: () => ({ outcome: 'failed', error: { code: 'permission_denied', retryable: false } })
    });

    const result = await createDevToolsV2FileChannel(() => endpoint).remove('/a.txt');

    expect(result).toEqual({ outcome: 'failed', error: { code: 'permission_denied', retryable: false } });
  });

  it('reads upload bytes on demand and never materialises the whole file', async () => {
    const file = new File([new Uint8Array(64)], 'data.bin');
    const wholeFile = vi.spyOn(file, 'arrayBuffer');
    let seen: DevToolsPanelUploadRequest | null = null;
    const { endpoint } = stubEndpoint({
      upload: request => {
        seen = request;
        return Promise.resolve({ outcome: 'sent' });
      }
    });

    const result = await createDevToolsV2FileChannel(() => endpoint).upload('/docs', file);

    expect(result).toEqual({ outcome: 'ok', value: 'sent' });
    expect(wholeFile).not.toHaveBeenCalled();
    const request = seen as unknown as DevToolsPanelUploadRequest;
    expect(request.source.totalBytes).toBe(64);
    expect((await request.source.read(0, 16)).byteLength).toBe(16);
    // transferId 由端点铸造，params 必须把同一个 ID 带给 provider —— provider 的
    // `createChunkSink(transferId)` 只拿得到这个 ID，它认路径的唯一机会就在这里。
    expect(request.params('trf:1')).toEqual({ transferId: 'trf:1', path: '/docs', name: 'data.bin', size: 64 });
  });

  it('fails every verb with session_closed while no endpoint exists', async () => {
    const channel = createDevToolsV2FileChannel(() => null);
    const offline = { outcome: 'failed', error: { code: 'session_closed', retryable: false } };

    expect(await channel.list('/')).toEqual(offline);
    expect(await channel.download('/a.txt')).toEqual(offline);
    expect(await channel.remove('/a.txt')).toEqual(offline);
    expect(await channel.createDirectory('/docs')).toEqual(offline);
    expect(await channel.upload('/', new File(['x'], 'a.txt'))).toEqual(offline);
  });
});
