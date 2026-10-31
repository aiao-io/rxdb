import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interceptDownload, saveDownload } from '../platform/tauri/local-backend';
const port = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => port);

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => {
  port.invoke.mockReset();
  vi.unstubAllGlobals();
});
describe('原生文件导出', () => {
  it('直接从已验证本机 Blob 导出，不重新 fetch WebKit 自定义 scheme 的 blob URL', async () => {
    port.invoke.mockImplementation(async command => (command === 'media_begin_save' ? 'token' : undefined));
    const request = vi.fn().mockRejectedValue(new Error('WebKit blob scheme unavailable'));
    vi.stubGlobal('fetch', request);
    const source = vi.fn().mockResolvedValue(new Blob(['original']));
    const event = new Event('click', { cancelable: true });
    await interceptDownload(event, 'blob:tauri://localhost/image', 'image.png', source);
    expect(event.defaultPrevented).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(source).toHaveBeenCalledOnce();
    expect(port.invoke).toHaveBeenLastCalledWith('media_finish_save', { token: 'token' });
  });
  it('取消不写入；分块写入失败会中止，不提交临时文件', async () => {
    port.invoke.mockResolvedValueOnce(null);
    expect(await saveDownload(new Blob(['original']), 'image.png')).toBe(false);
    expect(port.invoke).toHaveBeenCalledTimes(1);
    port.invoke.mockReset();
    port.invoke.mockImplementation(async command => {
      if (command === 'media_begin_save') return 'token';
      if (command === 'media_write_save') throw new Error('disk full');
      return undefined;
    });
    await expect(saveDownload(new Blob(['original']), 'image.png')).rejects.toThrow('disk full');
    expect(port.invoke).toHaveBeenLastCalledWith('media_abort_save', { token: 'token' });
    expect(port.invoke.mock.calls.some(([command]) => command === 'media_finish_save')).toBe(false);
  });
});
