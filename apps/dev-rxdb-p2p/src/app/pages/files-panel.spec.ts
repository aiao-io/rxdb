import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_UPLOAD_BYTES } from '../../../shared/limits';
import { P2PWorkspace, type SharedFileView } from '../p2p/p2p-workspace.service';
import { FilesPanel } from './files-panel';

const sharedFile = (name: string, heldHere = false, onlineSources = 1): SharedFileView => ({
  contentHash: name,
  manifest: {
    id: name,
    holderId: 'holder',
    updatedAt: 1,
    contentHash: name,
    fileName: name,
    size: 4,
    chunkSize: 4,
    chunkHashes: ['chunk']
  },
  holders: [],
  holderViews: [],
  serverCopy: false,
  heldHere,
  onlineSources
});

const selection = (file: File): Event => {
  const event = new Event('change');
  Object.defineProperty(event, 'target', { value: { files: [file], value: file.name } });
  return event;
};

describe('FilesPanel', () => {
  const workspace = {
    files: signal<readonly SharedFileView[]>([]),
    downloadingHashes: signal<ReadonlySet<string>>(new Set()),
    share: vi.fn(async () => undefined),
    generateTestFile: vi.fn(async () => undefined),
    download: vi.fn(async () => undefined),
    saveToDisk: vi.fn(async () => undefined),
    revoke: vi.fn(async () => undefined),
    report: vi.fn(async () => ({ created: true }))
  };
  let panel: FilesPanel;

  beforeEach(() => {
    vi.clearAllMocks();
    workspace.files.set([]);
    workspace.downloadingHashes.set(new Set());
    TestBed.configureTestingModule({ providers: [{ provide: P2PWorkspace, useValue: workspace }] });
    panel = TestBed.runInInjectionContext(() => new FilesPanel());
  });

  it('includes the encrypted copy in the visible report action', async () => {
    const file = sharedFile('report.bin');
    const sourceUrl = `/api/files/enc/${'e'.repeat(64)}`;
    const target = { ...file, manifest: { ...file.manifest, sourceUrl }, serverCopy: true };
    await panel.submitReport(target, 'malware');
    expect(workspace.report).toHaveBeenCalledExactlyOnceWith({ contentHash: file.contentHash, sourceUrl }, 'malware');
  });

  // 没进后台的举报不能显示成「已举报」：用户会以为治理流程已经接手，也就不会再报一次。
  it('keeps a failed report retryable instead of marking the file as reported', async () => {
    const file = sharedFile('report.bin');
    panel.startReport(file);
    workspace.report.mockRejectedValueOnce(new Error('举报服务暂不可用（502）'));

    await panel.submitReport(file, 'malware');

    expect(panel.error()).toBe('举报服务暂不可用（502）');
    expect(panel.notice()).toBeNull();
    expect(panel.reported()).not.toBe(file.contentHash);
    expect(panel.reporting()).toBe(file.contentHash);

    await panel.submitReport(file, 'malware');

    expect(panel.error()).toBeNull();
    expect(panel.reported()).toBe(file.contentHash);
    expect(panel.reporting()).toBeNull();
  });

  it('combines case-insensitive filename search with download availability and local filters', () => {
    workspace.files.set([sharedFile('Photo.jpg'), sharedFile('Notes.txt', true), sharedFile('Offline.pdf', false, 0)]);
    panel.query.set('PHOTO');
    expect(panel.visibleFiles().map(file => file.contentHash)).toEqual(['Photo.jpg']);
    panel.query.set('');
    panel.scope.set('available');
    expect(panel.visibleFiles().map(file => file.contentHash)).toEqual(['Photo.jpg']);
    panel.scope.set('local');
    expect(panel.visibleFiles().map(file => file.contentHash)).toEqual(['Notes.txt']);
  });

  it('rejects oversized server copies explicitly instead of silently skipping the requested upload', async () => {
    const file = new File(['bytes'], 'large.bin');
    Object.defineProperty(file, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    panel.upload.set(true);

    await panel.shareSelected(selection(file));

    expect(workspace.share).not.toHaveBeenCalled();
    expect(panel.error()).toContain('关闭');
    expect(panel.busy()).toBe(false);
  });

  it('clears an earlier error and reports a successful share', async () => {
    panel.error.set('earlier failure');
    await panel.shareSelected(selection(new File(['bytes'], 'Notes.txt')));
    expect(workspace.share).toHaveBeenCalledWith(expect.objectContaining({ name: 'Notes.txt' }), false);
    expect(panel.error()).toBeNull();
    expect(panel.notice()).toContain('Notes.txt');
    expect(panel.busy()).toBe(false);
  });

  it('requires explicit confirmation before removing a local copy and lets the user cancel', async () => {
    const file = sharedFile('Notes.txt', true);
    panel.revoke(file);
    expect(workspace.revoke).not.toHaveBeenCalled();
    expect(panel.pendingRemoval()).toBe(file);
    panel.pendingRemoval.set(null);
    expect(workspace.revoke).not.toHaveBeenCalled();
    panel.revoke(file);
    await panel.confirmRemoval();
    expect(workspace.revoke).toHaveBeenCalledWith(file.contentHash);
    expect(panel.pendingRemoval()).toBeNull();
  });

  it('shares a generated example with the chosen server-copy setting', async () => {
    panel.upload.set(true);
    await panel.generate(16);
    expect(workspace.generateTestFile).toHaveBeenCalledExactlyOnceWith(16, true);
    expect(panel.notice()).toContain('示例文件已共享');
    expect(panel.busy()).toBe(false);
  });

  it('saves a local file without blocking other actions and explains where to find it', async () => {
    const file = sharedFile('Notes.txt', true);
    await panel.save(file);
    expect(workspace.saveToDisk).toHaveBeenCalledExactlyOnceWith(file.contentHash, file.manifest.fileName);
    expect(panel.notice()).toContain('浏览器下载目录');
    expect(panel.busy()).toBe(false);
  });

  it('reports failed operations and leaves the selected removal available for retry', async () => {
    const file = sharedFile('Notes.txt', true);
    panel.revoke(file);
    workspace.revoke.mockRejectedValueOnce(new Error('文件仍在使用'));
    await panel.confirmRemoval();
    expect(panel.error()).toBe('文件仍在使用');
    expect(panel.notice()).toBeNull();
    expect(panel.pendingRemoval()).toBe(file);
    expect(panel.busy()).toBe(false);

    workspace.revoke.mockResolvedValueOnce(undefined);
    await panel.confirmRemoval();
    expect(panel.error()).toBeNull();
    expect(panel.pendingRemoval()).toBeNull();
    expect(panel.notice()).toContain('本机副本已移除');
  });

  it('starts an available download without claiming that a failed transfer succeeded', async () => {
    const file = sharedFile('Photo.jpg');
    workspace.download.mockRejectedValueOnce(new Error('来源设备断开'));
    await panel.download(file);
    expect(workspace.download).toHaveBeenCalledExactlyOnceWith(file.contentHash);
    expect(panel.error()).toBe('来源设备断开');
    expect(panel.notice()).toBeNull();
    expect(panel.busy()).toBe(false);
  });

  it('does not submit another download while the same file is downloading', async () => {
    const file = sharedFile('Photo.jpg');
    workspace.downloadingHashes.set(new Set([file.contentHash]));
    await panel.download(file);
    expect(workspace.download).not.toHaveBeenCalled();
    expect(panel.downloadLabel(file)).toBe('下载中…');
  });
});
