import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { ApprovedCatalog, ApprovedRelease, Installations } from '../data/approved-catalog';
import { configureServices } from '../testing/angular';
import { AppInstallationFlow } from './app-installation-flow';
import { ApplicationTransitions } from './application-transitions';
import { FileSystem } from './file-system';
import { InstalledApplications } from './installed-applications';
import { WindowManager } from './window-manager';

const release: ApprovedRelease = {
  id: 'catalog:editor',
  name: 'Approved Editor',
  bundleId: 'io.example.editor',
  version: '2.0.0',
  url: 'https://apps.example/releases/2.0.0/editor/',
  summary: 'Edit text.',
  capabilities: ['window'],
  allow: [],
  readyTimeout: 10000
};
const newer = {
  ...release,
  version: '10.0.0',
  url: 'https://apps.example/releases/10.0.0/editor/',
  capabilities: ['window', 'filesystem:read']
} as const;

function setup() {
  const catalog = signal<ApprovedCatalog>({ releases: [newer, release], problems: [] });
  const state = signal<Installations>({ version: 1, apps: [] });
  const installed = {
    catalog,
    state,
    failure: signal(''),
    refresh: vi.fn(async () => undefined),
    apply: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined)
  };
  const windows = { closeApp: vi.fn(async (id: string) => id.length > 0), open: vi.fn() };
  const files = { projectApplications: vi.fn(async () => undefined) };
  configureServices([
    AppInstallationFlow,
    {
      provide: ApplicationTransitions,
      useValue: {
        change: async (ids: string[], action: () => Promise<void>) => {
          for (const id of ids) if (!(await windows.closeApp(id))) return false;
          await action();
          return true;
        }
      }
    },
    { provide: InstalledApplications, useValue: installed },
    { provide: FileSystem, useValue: files },
    { provide: WindowManager, useValue: windows }
  ]);
  return { flow: TestBed.inject(AppInstallationFlow), installed, windows, files };
}

describe('应用商店交互流程', () => {
  it('显示数值最高版本、当前版本及获批回退项；安装请求先确认，取消不写入', () => {
    const { flow, installed } = setup();
    expect(flow.items()[0].latest.version).toBe('10.0.0');
    flow.request(release.id, '10.0.0');
    expect(flow.pending()).toMatchObject({ kind: 'release', action: 'Install', previous: null, release: newer });
    expect(installed.apply).not.toHaveBeenCalled();
    flow.cancel();
    expect(flow.pending()).toBeNull();
    installed.state.set({ version: 1, apps: [{ id: release.id, version: '10.0.0', previous: '2.0.0' }] });
    expect(flow.items()[0].rollback?.version).toBe('2.0.0');
    flow.request(release.id, '2.0.0');
    expect(flow.pending()).toMatchObject({ action: 'Roll Back', previous: '10.0.0' });
  });

  it('确认后关闭协商，取消保留安装；成功调用文件投影，版本确认值防止跨页覆盖', async () => {
    const { flow, installed, windows } = setup();
    installed.state.set({ version: 1, apps: [{ id: release.id, version: '2.0.0', previous: null }] });
    flow.request(release.id, '10.0.0');
    windows.closeApp.mockResolvedValueOnce(false);
    await flow.confirm();
    expect(installed.apply).not.toHaveBeenCalled();
    expect(flow.status()).toContain('cancelled');
    flow.request(release.id, '10.0.0');
    await flow.confirm();
    expect(installed.apply).toHaveBeenCalledWith(release.id, '10.0.0', expect.any(Function), '2.0.0');
    expect(flow.pending()).toBeNull();
    expect(flow.status()).toContain('10.0.0');
  });

  it('失败保留可重试确认；重复提交只执行一次；清空记录也需要显式确认', async () => {
    const { flow, installed } = setup();
    installed.apply.mockRejectedValueOnce(new Error('quota'));
    flow.request(release.id, '10.0.0');
    const first = flow.confirm();
    await flow.confirm();
    await first;
    expect(installed.apply).toHaveBeenCalledTimes(1);
    expect(flow.error()).toBe('quota');
    expect(flow.pending()).not.toBeNull();
    await flow.confirm();
    expect(flow.error()).toBe('');
    flow.requestReset();
    expect(installed.reset).not.toHaveBeenCalled();
    await flow.confirm();
    expect(installed.reset).toHaveBeenCalledOnce();
    expect(flow.pending()).toBeNull();
  });

  it('目录离线错误可重试；未知版本拒绝确认；卸载提示保留文件，打开只针对已安装项', async () => {
    const { flow, installed, windows } = setup();
    installed.refresh.mockRejectedValueOnce(new Error('offline'));
    await flow.refresh();
    expect(flow.error()).toBe('offline');
    await flow.refresh();
    expect(flow.error()).toBe('');
    flow.request(release.id, '3.0.0');
    expect(flow.pending()).toBeNull();
    expect(flow.error()).toContain('approved');
    flow.open(release.id);
    expect(windows.open).not.toHaveBeenCalled();
    installed.state.set({ version: 1, apps: [{ id: release.id, version: '2.0.0', previous: null }] });
    flow.open(release.id);
    expect(windows.open).toHaveBeenCalledWith(release.id);
    flow.request(release.id, null);
    expect(flow.pending()).toMatchObject({ action: 'Uninstall', release: null });
    await flow.confirm();
    expect(installed.apply).toHaveBeenCalledWith(release.id, null, expect.any(Function), '2.0.0');
  });

  it('安装进行中取消：协商期间中止，不写盘，请求保留在面板可重试', async () => {
    const { flow, installed, windows } = setup();
    installed.state.set({ version: 1, apps: [{ id: release.id, version: '2.0.0', previous: null }] });
    flow.request(release.id, '10.0.0');
    let releaseNegotiation: ((value: boolean) => void) | undefined;
    windows.closeApp.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseNegotiation = resolve;
        })
    );
    const confirming = flow.confirm();
    expect(flow.busy()).toBe(true);
    flow.cancel();
    expect(flow.status()).toBe('Cancelling…');
    releaseNegotiation?.(true);
    await confirming;
    expect(installed.apply).not.toHaveBeenCalled();
    expect(flow.status()).toContain('cancelled');
    expect(flow.pending()).toBeNull();

    /* 取消后面板关闭：从商店重新请求再走完整流程并成功。 */
    flow.request(release.id, '10.0.0');
    await flow.confirm();
    expect(installed.apply).toHaveBeenCalledWith(release.id, '10.0.0', expect.any(Function), '2.0.0');
    expect(flow.pending()).toBeNull();
  });

  it('提交一旦开始就原子完成：提交进行中的取消不再打断写盘', async () => {
    const { flow, installed } = setup();
    installed.state.set({ version: 1, apps: [{ id: release.id, version: '2.0.0', previous: null }] });
    flow.request(release.id, '10.0.0');
    let commitStarted: (() => void) | undefined;
    installed.apply.mockImplementationOnce(async () => {
      commitStarted?.();
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    const started = new Promise<void>(resolve => {
      commitStarted = resolve;
    });
    const confirming = flow.confirm();
    await started;
    flow.cancel();
    await confirming;
    expect(installed.apply).toHaveBeenCalledTimes(1);
    expect(flow.pending()).toBeNull();
    expect(flow.status()).toContain('10.0.0');
  });
});
