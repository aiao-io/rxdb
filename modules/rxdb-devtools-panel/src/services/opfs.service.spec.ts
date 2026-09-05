import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../components/toast.component';
import { FakeDevToolsFileChannel } from '../testing';
import { DEVTOOLS_FILE_CHANNEL, type DevToolsFileEntry, type DevToolsFileResult } from '../transport';
import type { OPFSFile } from '../types/devtools.types';
import { OpfsService } from './opfs.service';

class ToastStub {
  readonly success = vi.fn();
  readonly warning = vi.fn();
  readonly error = vi.fn();
}

const ROOT_ENTRIES: readonly DevToolsFileEntry[] = [
  { name: 'z.txt', kind: 'file', path: 'z.txt', size: 9, lastModified: 3 },
  { name: 'beta', kind: 'directory', path: 'beta' },
  { name: 'alpha', kind: 'directory', path: 'alpha' },
  { name: 'a.txt', kind: 'file', path: 'a.txt', size: 1, lastModified: 1 }
];

describe('OpfsService', () => {
  let toast: ToastStub;
  let fileChannel: FakeDevToolsFileChannel;
  let service: OpfsService;

  beforeEach(() => {
    toast = new ToastStub();
    fileChannel = new FakeDevToolsFileChannel();
    fileChannel.seed('/', ROOT_ENTRIES);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        OpfsService,
        { provide: ToastService, useValue: toast },
        { provide: DEVTOOLS_FILE_CHANNEL, useValue: fileChannel }
      ]
    });
    service = TestBed.inject(OpfsService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('loads and sorts entries with directories first', async () => {
    await service.refresh();

    expect(service.files()).toEqual([
      { name: 'alpha', path: '/alpha', type: 'directory' },
      { name: 'beta', path: '/beta', type: 'directory' },
      { name: 'a.txt', path: '/a.txt', type: 'file', size: 1, lastModified: 1 },
      { name: 'z.txt', path: '/z.txt', type: 'file', size: 9, lastModified: 3 }
    ]);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.errorKind()).toBeNull();
    expect(fileChannel.calls).toEqual([{ op: 'list', path: '/' }]);
  });

  it('lists only the requested layer when navigating into a subdirectory', async () => {
    fileChannel.seed('/beta', [
      { name: 'nested.txt', kind: 'file', path: 'beta/nested.txt', size: 4, lastModified: 2 }
    ]);

    service.navigateTo('/beta');
    await vi.waitFor(() => expect(service.loading()).toBe(false));

    expect(service.currentPath()).toBe('/beta');
    expect(service.files()).toEqual([
      { name: 'nested.txt', path: '/beta/nested.txt', type: 'file', size: 4, lastModified: 2 }
    ]);
    expect(fileChannel.calls).toEqual([{ op: 'list', path: '/beta' }]);
  });

  it('branches on the error code, not on the message text', async () => {
    fileChannel.failNext('session_closed');
    await service.refresh();

    expect(service.errorKind()).toBe('content-script-unavailable');
    expect(service.error()).toBe('请刷新被检查的页面以加载 OPFS 管理功能');
    expect(service.files()).toEqual([]);
    expect(service.loading()).toBe(false);
    expect(toast.error).toHaveBeenLastCalledWith('请刷新被检查的页面以加载 OPFS 管理功能');
  });

  it('keeps operation-scoped failures off the refresh hint', async () => {
    // P1-5：UI 不能靠「文案里有没有『刷新』」来选分支 —— 那条链原本是
    // Chrome 英文错误文案 → 中文提示串 → `error()?.includes('刷新')`，
    // 任何一环改字（含 i18n）都会静默改掉 UI 行为。现在分支只看错误码，
    // 而「路径非法」刷新页面也不会变好，必须落在另一个 kind 上。
    fileChannel.failNext('invalid_path');
    await service.refresh();

    expect(service.errorKind()).toBe('unknown');
    expect(service.error()).toBe('OPFS 错误: 路径非法');
    expect(service.loading()).toBe(false);
  });

  it('toggles between list and grid views', () => {
    service.toggleViewMode();
    service.toggleViewMode();

    expect(service.viewMode()).toBe('list');
  });

  it('hands downloads to the host and reports failures', async () => {
    const file: OPFSFile = { name: 'a.txt', path: '/folder/a.txt', type: 'file' };
    await service.download(file);

    expect(fileChannel.calls).toEqual([{ op: 'download', path: '/folder/a.txt' }]);
    expect(toast.success).toHaveBeenCalledWith('文件下载成功');

    fileChannel.failNext('permission_denied');
    await service.download(file);
    expect(toast.error).toHaveBeenLastCalledWith('下载失败: 没有访问该路径的权限');
  });

  it('deletes files and directories through one verb and refreshes after success', async () => {
    await service.delete({ name: 'folder', path: '/folder', type: 'directory' });

    expect(fileChannel.calls).toEqual([
      { op: 'remove', path: '/folder' },
      { op: 'list', path: '/' }
    ]);
    expect(toast.success).toHaveBeenCalledWith('删除成功');
  });

  it('does not refresh after a failed delete', async () => {
    fileChannel.failNext('resource_not_found');

    await service.delete({ name: 'a.txt', path: '/a.txt', type: 'file' });

    expect(fileChannel.calls).toEqual([{ op: 'remove', path: '/a.txt' }]);
    expect(toast.error).toHaveBeenCalledWith('删除失败: 目标不存在');
  });

  it('confirms an upload by observing the listing, not by trusting the ack', async () => {
    const file = new File([new Uint8Array(8)], 'data.bin');

    await expect(service.upload(file)).resolves.toBe(true);

    expect(fileChannel.calls).toEqual([
      { op: 'upload', path: '/', name: 'data.bin' },
      { op: 'list', path: '/' }
    ]);
    expect(service.files().some(entry => entry.name === 'data.bin')).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('上传成功: data.bin');
  });

  it('reports an unconfirmed upload when the file never appears', async () => {
    // 冻结的 v2 wire 上，`TRANSFER_COMPLETE` 成功时不产生任何帧，所以 `'sent'` 只保证
    // 「字节已发出」。provider 若在提交阶段悄悄丢掉它，唯一能拆穿的证据就是重列一次目录。
    vi.spyOn(fileChannel, 'upload').mockResolvedValue({ outcome: 'ok', value: 'sent' });

    await expect(service.upload(new File(['x'], 'data.bin'))).resolves.toBe(false);

    expect(toast.error).toHaveBeenCalledWith('上传未确认: data.bin');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('surfaces the negotiated transfer limit instead of hard-coding one', async () => {
    // 上限由协商出的 `maxTransferBytes` 决定，面板不再自带一个 50MB 常量：
    // 写死的上限在原生文件后端（阶段 D）上必然是错的。
    fileChannel.failNext('transfer_size_exceeded');

    await expect(service.upload(new File(['x'], 'huge.bin'))).resolves.toBe(false);

    expect(toast.error).toHaveBeenCalledWith('上传失败: 超过协商的单次传输上限');
    expect(fileChannel.calls).toEqual([{ op: 'upload', path: '/', name: 'huge.bin' }]);
  });

  it('creates a directory and refreshes only after success', async () => {
    await expect(service.createDirectory('docs')).resolves.toBe(true);
    expect(fileChannel.calls).toEqual([
      { op: 'createDirectory', path: '/docs' },
      { op: 'list', path: '/' }
    ]);
    expect(toast.success).toHaveBeenCalledWith('创建成功: docs');

    fileChannel.failNext('resource_conflict');
    await expect(service.createDirectory('docs')).resolves.toBe(false);
    expect(toast.error).toHaveBeenLastCalledWith('创建失败: 同名条目已存在');
    expect(fileChannel.calls).toHaveLength(3);
  });

  describe('out-of-order listings', () => {
    type Listing = DevToolsFileResult<readonly DevToolsFileEntry[]>;
    /** 按路径挂起的 `list()`，由测试决定谁先回来——传输层并发 32、允许乱序，这不是假设出来的场景。 */
    let pending: Map<string, (listing: Listing) => void>;

    const settle = (path: string, entries: readonly DevToolsFileEntry[]): void => {
      const resolve = pending.get(path);
      if (resolve === undefined) throw new Error(`no pending list() for ${path}`);
      resolve({ outcome: 'ok', value: entries });
    };

    beforeEach(() => {
      pending = new Map();
      vi.spyOn(fileChannel, 'list').mockImplementation(
        path =>
          new Promise<Listing>(resolve => {
            pending.set(path, resolve);
          })
      );
    });

    it('discards a late listing for a path the user has already left', async () => {
      service.currentPath.set('/a');
      const first = service.refresh();
      service.currentPath.set('/b');
      const second = service.refresh();

      settle('/b', [{ name: 'b.txt', kind: 'file', path: 'b/b.txt' }]);
      await second;
      settle('/a', [{ name: 'a.txt', kind: 'file', path: 'a/a.txt' }]);
      await first;

      // 用户此刻站在 /b：files() 若持有 /a 的内容，接下来的删除/下载就会打在已经离开的目录上。
      expect(service.currentPath()).toBe('/b');
      expect(service.files()).toEqual([{ name: 'b.txt', path: '/b/b.txt', type: 'file' }]);
      expect(service.loading()).toBe(false);
    });

    it('keeps loading while the newest listing is still in flight, even after an older one settles', async () => {
      service.currentPath.set('/a');
      const first = service.refresh();
      service.currentPath.set('/b');
      const second = service.refresh();

      settle('/a', [{ name: 'a.txt', kind: 'file', path: 'a/a.txt' }]);
      await first;
      expect(service.files()).toEqual([]);
      expect(service.loading()).toBe(true);

      settle('/b', [{ name: 'b.txt', kind: 'file', path: 'b/b.txt' }]);
      await second;
      expect(service.files()).toEqual([{ name: 'b.txt', path: '/b/b.txt', type: 'file' }]);
      expect(service.loading()).toBe(false);
    });
  });

  it('confirms an upload against the directory it was sent to, not the directory the user is looking at now', async () => {
    fileChannel.seed('/docs', []);
    service.currentPath.set('/docs');
    let release!: () => void;
    const send = fileChannel.upload.bind(fileChannel);
    // 调用记录在发起时就落下（与真信道一致），落盘则等到 release() 之后才可观测。
    vi.spyOn(fileChannel, 'upload').mockImplementation(async (path, file) => {
      const result = send(path, file);
      await new Promise<void>(resolve => {
        release = resolve;
      });
      return result;
    });

    const uploading = service.upload(new File(['x'], 'data.bin'));
    // 字节还在传输时用户回到了根目录。
    service.navigateTo('/');
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    release();

    await expect(uploading).resolves.toBe(true);
    expect(toast.success).toHaveBeenCalledWith('上传成功: data.bin');
    // 确认看的是 /docs 的清单；根目录的视图不能被 /docs 的内容顶掉。
    expect(fileChannel.calls).toEqual([
      { op: 'upload', path: '/docs', name: 'data.bin' },
      { op: 'list', path: '/' },
      { op: 'list', path: '/docs' }
    ]);
    expect(service.currentPath()).toBe('/');
    expect(service.files().map(entry => entry.name)).toEqual(['alpha', 'beta', 'a.txt', 'z.txt']);
  });
});
