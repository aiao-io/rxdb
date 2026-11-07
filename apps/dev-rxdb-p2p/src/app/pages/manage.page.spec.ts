import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { P2PWorkspace } from '../p2p/p2p-workspace.service';
import ManagePage from './manage.page';

describe('ManagePage', () => {
  const local = { contentHash: 'local', heldHere: true, manifest: { fileName: '本机.pdf', size: 1024 } };
  const remote = { contentHash: 'remote', heldHere: false, manifest: { fileName: '远端.pdf', size: 2048 } };
  const workspace = {
    files: signal([local, remote]),
    links: signal([
      { connectionId: 'ready', state: 'ready' },
      { connectionId: 'closed', state: 'closed' }
    ]),
    transfers: signal([{ state: 'running' }, { state: 'done' }]),
    revoke: vi.fn(),
    disconnect: vi.fn(),
    saveToDisk: vi.fn()
  };
  let page: ManagePage;
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: P2PWorkspace, useValue: workspace },
        { provide: AuthService, useValue: { session: signal(null) } }
      ]
    });
    page = TestBed.runInInjectionContext(() => new ManagePage());
  });

  it('counts and manages only files held on this device', () => {
    expect(page.localFiles().map(file => file.contentHash)).toEqual(['local']);
    expect(page.localBytes()).toBe(1024);
    expect(page.activeTransfers()).toBe(1);
  });

  it('disconnects ready connections without touching already closed connections', () => {
    page.disconnectAll();
    expect(workspace.disconnect).toHaveBeenCalledExactlyOnceWith('ready');
  });

  it('requires a selected local file before removal and reports failures without claiming success', async () => {
    await page.confirmRemoval();
    expect(workspace.revoke).not.toHaveBeenCalled();
    const selected = page.localFiles()[0]!;
    page.pendingRemoval.set(selected);
    workspace.revoke.mockRejectedValueOnce(new Error('同步失败'));
    await page.confirmRemoval();
    expect(page.error()).toBe('同步失败');
    expect(page.pendingRemoval()).toBe(selected);
    expect(page.busy()).toBe(false);
    workspace.revoke.mockResolvedValueOnce(undefined);
    await page.confirmRemoval();
    expect(page.pendingRemoval()).toBeNull();
    expect(page.notice()).toContain('本机.pdf');
  });
});
