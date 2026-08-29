import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpfsRequest, OpfsResponse } from '@modules/rxdb-devtools-panel/wire';
import { OpfsChannelService } from './opfs-channel.service';

describe('OpfsChannelService', () => {
  let sendMessage: ReturnType<typeof vi.fn>;
  let service: OpfsChannelService;

  beforeEach(() => {
    sendMessage = vi.fn(async (_tabId: number, request: OpfsRequest): Promise<OpfsResponse> => ({
      requestId: request.requestId,
      result: 'ok'
    }));
    vi.stubGlobal('chrome', {
      tabs: { sendMessage },
      devtools: { inspectedWindow: { tabId: 17 } }
    } as unknown as typeof chrome);
    TestBed.configureTestingModule({ providers: [OpfsChannelService] });
    service = TestBed.inject(OpfsChannelService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  // 同一个扩展可能同时开着多个面板；纯自增序号会让两个面板铸出同名会话 id。
  it('addresses the inspected tab and mints tab-scoped request ids', async () => {
    await service.request({ message: 'getDirectoryStructure' });
    await service.request({ message: 'deleteFile', data: { path: './a.txt' } });

    expect(sendMessage.mock.calls[0]).toEqual([17, { message: 'getDirectoryStructure', requestId: '17:1' }]);
    expect(sendMessage.mock.calls[1]).toEqual([
      17,
      { message: 'deleteFile', data: { path: './a.txt' }, requestId: '17:2' }
    ]);
  });

  it('mints tab-scoped upload session ids from an independent sequence', () => {
    expect([service.createUploadId(), service.createUploadId()]).toEqual(['17:upload:1', '17:upload:2']);
  });

  it('rejects mismatched response request ids', async () => {
    sendMessage.mockResolvedValueOnce({ requestId: 'stale', result: 'ok' } satisfies OpfsResponse);

    await expect(service.request({ message: 'downloadFile' })).rejects.toThrow('OPFS 响应 requestId 不匹配');
  });
});
