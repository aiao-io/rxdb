import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpfsRequest, OpfsResponse } from '../../content/opfs';
import { ToastService } from '../components/toast.component';
import type { OPFSFile } from '../types/devtools.types';
import { OpfsService } from './opfs.service';

class ToastStub {
  readonly success = vi.fn();
  readonly warning = vi.fn();
  readonly error = vi.fn();
}

type ResponseFactory = (request: OpfsRequest) => OpfsResponse | Promise<OpfsResponse>;

function responseFor(request: OpfsRequest, response: Omit<OpfsResponse, 'requestId'>): OpfsResponse {
  return { requestId: request.requestId, ...response };
}

const rootStructure = {
  '.': {
    name: '.',
    kind: 'directory' as const,
    relativePath: '.',
    entries: {
      'z.txt': { name: 'z.txt', kind: 'file' as const, relativePath: './z.txt', size: 9, lastModified: 3 },
      beta: {
        name: 'beta',
        kind: 'directory' as const,
        relativePath: './beta',
        entries: {
          'nested.txt': {
            name: 'nested.txt',
            kind: 'file' as const,
            relativePath: './beta/nested.txt',
            size: 4,
            lastModified: 2
          }
        }
      },
      alpha: { name: 'alpha', kind: 'directory' as const, relativePath: './alpha', entries: {} },
      'a.txt': { name: 'a.txt', kind: 'file' as const, relativePath: './a.txt', size: 1, lastModified: 1 }
    }
  }
};

describe('OpfsService', () => {
  let toast: ToastStub;
  let sendMessage: ReturnType<typeof vi.fn>;
  let responders: ResponseFactory[];
  let service: OpfsService;

  beforeEach(() => {
    toast = new ToastStub();
    responders = [];
    sendMessage = vi.fn(async (_tabId: number, request: OpfsRequest) => {
      const responder = responders.shift();
      if (!responder) throw new Error(`Unexpected request: ${request.message}`);
      return responder(request);
    });
    vi.stubGlobal('chrome', {
      tabs: { sendMessage },
      devtools: { inspectedWindow: { tabId: 17 } }
    } as unknown as typeof chrome);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), OpfsService, { provide: ToastService, useValue: toast }]
    });
    service = TestBed.inject(OpfsService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('loads and sorts root entries with directories first', async () => {
    responders.push(request => responseFor(request, { structure: rootStructure }));

    await service.refresh();

    expect(service.files()).toEqual([
      { name: 'alpha', path: '/alpha', type: 'directory', size: undefined, lastModified: undefined },
      { name: 'beta', path: '/beta', type: 'directory', size: undefined, lastModified: undefined },
      { name: 'a.txt', path: '/a.txt', type: 'file', size: 1, lastModified: 1 },
      { name: 'z.txt', path: '/z.txt', type: 'file', size: 9, lastModified: 3 }
    ]);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.errorKind()).toBeNull();
    expect(sendMessage.mock.calls[0]?.[1]).toEqual({ message: 'getDirectoryStructure', requestId: '17:1' });
  });

  it('navigates into nested paths without changing expansion state elsewhere', async () => {
    responders.push(request => responseFor(request, { structure: rootStructure }));

    service.navigateTo('/beta');
    await vi.waitFor(() => expect(service.loading()).toBe(false));

    expect(service.currentPath()).toBe('/beta');
    expect(service.files()).toEqual([
      { name: 'nested.txt', path: '/beta/nested.txt', type: 'file', size: 4, lastModified: 2 }
    ]);
  });

  it('reports missing structures and connection failures and always clears loading', async () => {
    responders.push(request => responseFor(request, {}));
    await service.refresh();
    expect(service.error()).toBe('OPFS 错误: 无法获取 OPFS 数据');
    expect(service.errorKind()).toBe('unknown');

    responders.push(() => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')));
    await service.refresh();

    expect(service.error()).toBe('请刷新被检查的页面以加载 OPFS 管理功能');
    // P1-5：UI 不能靠「文案里有没有『刷新』」来选分支 —— 那条链是
    // Chrome 英文错误文案 → 中文提示串 → `error()?.includes('刷新')`，
    // 任何一环改字（含 i18n）都会静默改掉 UI 行为。必须有结构化判别位。
    expect(service.errorKind()).toBe('content-script-unavailable');
    expect(service.loading()).toBe(false);
    expect(toast.error).toHaveBeenLastCalledWith('请刷新被检查的页面以加载 OPFS 管理功能');
  });

  it('toggles between list and grid views', () => {
    service.toggleViewMode();
    service.toggleViewMode();

    expect(service.viewMode()).toBe('list');
  });

  it('downloads normalized file paths and reports protocol errors', async () => {
    const file: OPFSFile = { name: 'a.txt', path: '/folder/a.txt', type: 'file' };
    responders.push(request => responseFor(request, { result: 'ok' }));
    await service.download(file);

    expect(sendMessage.mock.calls[0]?.[1]).toEqual({
      message: 'downloadFile',
      data: { relativePath: './folder/a.txt', fileName: 'a.txt' },
      requestId: '17:1'
    });
    expect(toast.success).toHaveBeenCalledWith('文件下载成功');

    responders.push(request => responseFor(request, { error: 'denied' }));
    await service.download(file);
    expect(toast.error).toHaveBeenLastCalledWith('下载失败: denied');
  });

  it.each([
    [{ name: 'a.txt', path: '/a.txt', type: 'file' } satisfies OPFSFile, 'deleteFile'],
    [{ name: 'folder', path: '/folder', type: 'directory' } satisfies OPFSFile, 'deleteDirectory']
  ])('deletes entries and refreshes after success', async (file, expectedMessage) => {
    responders.push(
      request => responseFor(request, { result: 'ok' }),
      request => responseFor(request, { structure: rootStructure })
    );

    await service.delete(file);

    expect(sendMessage.mock.calls[0]?.[1]).toEqual({
      message: expectedMessage,
      data: { path: `.${file.path}` },
      requestId: '17:1'
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('删除成功');
  });

  it('does not refresh after a failed delete', async () => {
    responders.push(request => responseFor(request, { error: 'locked' }));

    await service.delete({ name: 'a.txt', path: '/a.txt', type: 'file' });

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith('删除失败: locked');
  });

  it('rejects oversized uploads before reading or sending the file', async () => {
    const file = new File([new Uint8Array([65, 66])], 'data.bin');
    Object.defineProperty(file, 'size', { value: 51 * 1024 * 1024 });
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

    const result = await service.upload(file);

    expect(result).toBe(false);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('上传失败: 文件超过 50MB 上限: data.bin');
  });

  it('uploads in bounded chunks and refreshes after the stream commits', async () => {
    responders.push(
      request => responseFor(request, { result: 'ok' }),
      request => responseFor(request, { result: 'ok' }),
      request => responseFor(request, { result: 'ok' }),
      request => responseFor(request, { result: 'ok' }),
      request => responseFor(request, { structure: rootStructure })
    );
    const file = new File([new Uint8Array(300_000)], 'data.bin');

    await expect(service.upload(file)).resolves.toBe(true);

    const requests = sendMessage.mock.calls.map(call => call[1] as OpfsRequest);
    expect(requests.map(request => request.message)).toEqual([
      'uploadStart',
      'uploadChunk',
      'uploadChunk',
      'uploadComplete',
      'getDirectoryStructure'
    ]);
    expect(requests[0]?.data).toMatchObject({ fileName: 'data.bin', totalBytes: 300_000 });
    const encodedChunks = requests
      .filter(request => request.message === 'uploadChunk')
      .map(request => request.data?.fileData);
    expect(encodedChunks.every(chunk => typeof chunk === 'string' && chunk.length < 400_000)).toBe(true);
  });

  it('aborts the content-side upload session after a chunk failure', async () => {
    responders.push(
      request => responseFor(request, { result: 'ok' }),
      request => responseFor(request, { error: 'write failed' }),
      request => responseFor(request, { result: 'ok' })
    );

    await expect(service.upload(new File(['data'], 'data.bin'))).resolves.toBe(false);

    expect(sendMessage.mock.calls.map(call => (call[1] as OpfsRequest).message)).toEqual([
      'uploadStart',
      'uploadChunk',
      'uploadAbort'
    ]);
    expect(toast.error).toHaveBeenCalledWith('上传失败: write failed');
  });

  it('returns false when upload fails', async () => {
    responders.push(request => responseFor(request, { error: 'quota exceeded' }));

    const result = await service.upload(new File(['x'], 'data.bin'));

    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('上传失败: quota exceeded');
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('creates a directory and refreshes only after success', async () => {
    responders.push(
      request => responseFor(request, { result: 'ok' }),
      request => responseFor(request, { structure: rootStructure })
    );

    await expect(service.createDirectory('docs')).resolves.toBe(true);
    expect(sendMessage.mock.calls[0]?.[1]).toEqual({
      message: 'createDirectory',
      data: { path: '/', dirName: 'docs' },
      requestId: '17:1'
    });
    expect(toast.success).toHaveBeenCalledWith('创建成功: docs');

    responders.push(request => responseFor(request, { error: 'exists' }));
    await expect(service.createDirectory('docs')).resolves.toBe(false);
    expect(toast.error).toHaveBeenLastCalledWith('创建失败: exists');
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it('rejects mismatched response request ids', async () => {
    responders.push(() => ({ requestId: 'stale', result: 'ok' }));

    await service.download({ name: 'a.txt', path: '/a.txt', type: 'file' });

    expect(toast.error).toHaveBeenCalledWith('下载失败: OPFS 响应 requestId 不匹配');
  });
});
