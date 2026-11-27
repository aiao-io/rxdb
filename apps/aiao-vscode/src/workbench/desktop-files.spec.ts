import {
  DESKTOP_LIMITS,
  DesktopError,
  type DesktopCapability,
  type DesktopFilesystemClient
} from '@aiao/orbit/desktop';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopFiles } from './desktop-files.js';

function fixture(capabilities: readonly DesktopCapability[] = ['filesystem:read', 'filesystem:write']) {
  const filesystem = {
    open: vi.fn<DesktopFilesystemClient['open']>(async () => ({
      name: 'note.txt',
      mime: 'text/plain',
      size: 3,
      bytes: new Uint8Array([0, 1, 255]),
      handle: 'never-reuse',
      version: 'original'
    })),
    save: vi.fn<DesktopFilesystemClient['save']>(async () => ({ name: 'copied.txt', handle: 'new', version: 'new' }))
  };
  return { filesystem, files: createDesktopFiles({ capabilities, filesystem }) };
}

describe('桌面显式文件复制', () => {
  it('读取只暴露副本，不将写回凭证交给工作台', async () => {
    const { files, filesystem } = fixture();
    expect(await files.open(['.txt'])).toEqual({ name: 'note.txt', bytes: new Uint8Array([0, 1, 255]) });
    expect(filesystem.open).toHaveBeenCalledWith({ accept: ['.txt'] });
    expect(files.maxBytes).toBe(524_288);
  });

  it('每次保存不带凭证，交给用户重新选目标；发送前冻结字节', async () => {
    const { files, filesystem } = fixture();
    const bytes = new Uint8Array([2, 3]);
    const pending = files.save('data.bin', bytes);
    bytes[0] = 9;
    expect(await pending).toBe('copied.txt');
    expect(filesystem.save).toHaveBeenCalledWith({ suggestedName: 'data.bin', bytes: new Uint8Array([2, 3]) });
    await files.save('data.bin', bytes);
    expect(filesystem.save.mock.calls[1]?.[0].handle).toBeUndefined();
  });

  it('读写能力分开授权，拒绝时不请求宿主', async () => {
    const { files, filesystem } = fixture(['filesystem:read']);
    expect(files.canRead).toBe(true);
    expect(files.canWrite).toBe(false);
    await expect(files.save('x', new Uint8Array())).rejects.toThrow('写入');
    expect(filesystem.save).not.toHaveBeenCalled();
    const denied = fixture([]);
    await expect(denied.files.open()).rejects.toThrow('读取');
    expect(denied.filesystem.open).not.toHaveBeenCalled();
  });

  it('512 KiB 边界允许，超出时在打开保存面板前拒绝', async () => {
    const { files, filesystem } = fixture();
    await files.save('fits.bin', new Uint8Array(DESKTOP_LIMITS.filesystem.bytes));
    await expect(files.save('large.bin', new Uint8Array(DESKTOP_LIMITS.filesystem.bytes + 1))).rejects.toThrow(
      '512 KiB'
    );
    expect(filesystem.save).toHaveBeenCalledTimes(1);
  });

  it('用户取消返回空结果，其他宿主错误保留', async () => {
    const { files, filesystem } = fixture();
    filesystem.open.mockRejectedValueOnce(new DesktopError('USER_CANCELLED', 'cancel'));
    filesystem.save.mockRejectedValueOnce(new DesktopError('USER_CANCELLED', 'cancel'));
    expect(await files.open()).toBeNull();
    expect(await files.save('x', new Uint8Array())).toBeNull();
    const closed = new DesktopError('WINDOW_CLOSED', 'window closed');
    filesystem.open.mockRejectedValueOnce(closed);
    await expect(files.open()).rejects.toBe(closed);
    const io = new Error('Disk full');
    filesystem.save.mockRejectedValueOnce(io);
    await expect(files.save('x', new Uint8Array())).rejects.toBe(io);
  });
});
