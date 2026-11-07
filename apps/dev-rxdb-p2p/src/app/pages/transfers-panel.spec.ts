import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P2PWorkspace } from '../p2p/p2p-workspace.service';
import type { TransferView } from '../p2p/transfer-progress';
import { TransfersPanel } from './transfers-panel';

const transfer = (id: string, state: TransferView['state']): TransferView => ({
  id,
  contentHash: `hash-${id}`,
  fileName: `${id}.pdf`,
  size: 100,
  state,
  route: 'p2p',
  bytes: state === 'done' ? 100 : 25,
  chunks: ['电脑', null],
  rejected: 0,
  sources: ['电脑'],
  error: state === 'failed' ? '设备离线' : null,
  startedAt: 1000,
  finishedAt: state === 'running' ? null : 2000
});

describe('下载结果交互', () => {
  const workspace = {
    transfers: signal<readonly TransferView[]>([]),
    downloadingHashes: signal<ReadonlySet<string>>(new Set()),
    saveToDisk: vi.fn<(hash: string, name: string) => Promise<void>>(),
    download: vi.fn<(hash: string) => Promise<void>>(),
    cancel: vi.fn<(id: string) => void>(),
    clearFinishedTransfers: vi.fn<() => void>()
  };

  beforeEach(async () => {
    workspace.transfers.set([]);
    workspace.downloadingHashes.set(new Set());
    workspace.saveToDisk.mockReset().mockResolvedValue();
    workspace.download.mockReset().mockResolvedValue();
    workspace.cancel.mockReset();
    workspace.clearFinishedTransfers.mockReset();
    await TestBed.configureTestingModule({
      imports: [TransfersPanel],
      providers: [{ provide: P2PWorkspace, useValue: workspace }]
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('下载完成后可保存，保存失败留在页面而不是未处理拒绝', async () => {
    workspace.transfers.set([transfer('手册', 'done')]);
    workspace.saveToDisk.mockRejectedValue(new Error('本机副本已移除'));
    const fixture = TestBed.createComponent(TransfersPanel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector<HTMLButtonElement>('[data-testid="transfer-save"]');
    expect(button?.textContent).toContain('保存到下载目录');
    button?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(workspace.saveToDisk).toHaveBeenCalledWith('hash-手册', '手册.pdf');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('本机副本已移除');
    expect(button?.disabled).toBe(false);
  });

  it('同一文件重试期间只禁用它自己的操作，其他下载仍可取消', async () => {
    workspace.transfers.set([transfer('失败', 'failed'), transfer('进行中', 'running')]);
    let finishDownload: () => void = () => undefined;
    workspace.download.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishDownload = resolve;
        })
    );
    const fixture = TestBed.createComponent(TransfersPanel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const retry = root.querySelector<HTMLButtonElement>('[data-testid="transfer-retry"]');
    retry?.click();
    fixture.detectChanges();
    expect(workspace.download).toHaveBeenCalledWith('hash-失败');
    expect(retry?.disabled).toBe(true);
    const cancel = root.querySelector<HTMLButtonElement>('[data-testid="transfer-cancel"]');
    expect(cancel?.disabled).toBe(false);
    cancel?.click();
    expect(workspace.cancel).toHaveBeenCalledWith('进行中');
    finishDownload();
    await fixture.whenStable();
  });

  it('显示百分比并将块图折叠，清理记录明确保留文件', () => {
    workspace.transfers.set([transfer('进行中', 'running'), transfer('完成', 'done')]);
    const fixture = TestBed.createComponent(TransfersPanel);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="transfer"]')?.textContent).toContain('25%');
    expect(root.querySelector('details')?.open).toBe(false);
    expect(root.textContent).toContain('不会删除文件');
    const button = root.querySelector<HTMLButtonElement>('[data-testid="clear-transfers"]');
    button?.click();
    expect(workspace.clearFinishedTransfers).toHaveBeenCalledOnce();
  });
});
