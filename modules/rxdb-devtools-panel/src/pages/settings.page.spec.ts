import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseStateService } from '../services/database-state.service';
import { ThemeService } from '../services/theme.service';
import { createFakePanelHost, FakeDevToolsHostAccess } from '../testing';
import type { DbInfo } from '../types/devtools.types';
import { SettingsPage } from './settings.page';

const scriptMocks = vi.hoisted(() => ({
  createRequestId: vi.fn((prefix: string) => `${prefix}-request`),
  serialize: vi.fn(() => 'serialized-code')
}));

vi.mock('../scripts', async importOriginal => {
  const actual = await importOriginal<typeof import('../scripts')>();
  return {
    ...actual,
    createScriptRequestId: scriptMocks.createRequestId,
    serializeFunctionWithResult: scriptMocks.serialize
  };
});

class ThemeStub {
  readonly theme = signal<'light' | 'dark' | 'system'>('system');
  readonly resolvedTheme = signal<'light' | 'dark'>('light');
  readonly setTheme = vi.fn((theme: 'light' | 'dark' | 'system') => this.theme.set(theme));
}

class DatabaseStub {
  readonly dbInfo = signal<DbInfo | null>({ dbName: 'demo', entities: [], version: '1' });
}

describe('SettingsPage', () => {
  let theme: ThemeStub;
  let page: SettingsPage;
  let hostAccess: FakeDevToolsHostAccess;
  let confirmMock: ReturnType<typeof vi.fn>;
  let database: DatabaseStub;

  beforeEach(() => {
    theme = new ThemeStub();
    database = new DatabaseStub();
    confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const host = createFakePanelHost('9.9.9-test');
    hostAccess = host.hostAccess;
    TestBed.configureTestingModule({
      providers: [
        SettingsPage,
        ...host.providers,
        { provide: ThemeService, useValue: theme },
        { provide: DatabaseStateService, useValue: database }
      ]
    });
    page = TestBed.inject(SettingsPage);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('delegates theme changes', () => {
    page.setTheme('dark');
    expect(theme.setTheme).toHaveBeenCalledWith('dark');
    expect(page.theme()).toBe('dark');
    expect(page.themeOptions.map(option => option.value)).toEqual(['light', 'dark', 'system']);
  });

  // 关于页的版本号来自宿主注入，而不是面板自己的 package.json（见 P2-13）。
  it('shows the version the host injected', () => {
    expect(page.version).toBe('9.9.9-test');
  });

  it('downloads the database and reports result errors', async () => {
    hostAccess.respondWith({ success: false, error: 'download failed' });

    page.handleDownloadDatabase();
    expect(page.downloadLoading()).toBe(true);
    await vi.waitFor(() => expect(page.downloadLoading()).toBe(false));

    expect(page.error()).toBe('download failed');
    expect(scriptMocks.createRequestId).toHaveBeenCalledWith('download');
    expect(scriptMocks.serialize).toHaveBeenCalledWith(expect.any(Function), 'download-request', ['demo']);
    expect(hostAccess.evaluations).toEqual([{ code: 'serialized-code', requestId: 'download-request' }]);
  });

  it('reports rejected download executions', async () => {
    hostAccess.respondWith(() => {
      throw new Error('bridge failed');
    });
    page.handleDownloadDatabase();
    await vi.waitFor(() => expect(page.downloadLoading()).toBe(false));
    expect(page.error()).toBe('bridge failed');
  });

  it('没有数据库信息时不启动下载并给出诊断', () => {
    database.dbInfo.set(null);

    page.handleDownloadDatabase();

    expect(hostAccess.evaluations).toEqual([]);
    expect(page.downloadLoading()).toBe(false);
    expect(page.error()).toBe('未获取到数据库信息，请先刷新数据库连接');
  });

  it('does not clear data when confirmation is rejected', () => {
    confirmMock.mockReturnValueOnce(false);
    page.handleClearDatabase();
    expect(hostAccess.evaluations).toEqual([]);
    expect(page.clearLoading()).toBe(false);
  });

  it('collects partial clear failures without reloading', async () => {
    hostAccess.respondWith({
      rxdb: { success: false, error: 'rxdb failed' },
      opfs: { success: false, error: 'opfs failed' },
      indexedDB: { success: false, error: 'idb failed' },
      localStorage: { success: false, error: 'storage failed' }
    });

    page.handleClearDatabase();
    await vi.waitFor(() => expect(page.clearLoading()).toBe(false));

    expect(page.error()).toBe(
      'RxDB: rxdb failed; OPFS: opfs failed; IndexedDB: idb failed; localStorage: storage failed'
    );
    expect(hostAccess.reloadCount).toBe(0);
  });

  it('reloads only after all critical stores clear successfully', async () => {
    hostAccess.respondWith({
      rxdb: { success: true },
      opfs: { success: true },
      indexedDB: { success: true },
      localStorage: { success: true }
    });

    page.handleClearDatabase();
    await vi.waitFor(() => expect(page.clearLoading()).toBe(false));

    expect(page.error()).toBeNull();
    expect(hostAccess.reloadCount).toBe(1);
  });

  // 非 Error 的拒绝值没有 message 可读，页面必须落到自己的中文文案而不是显示 "undefined"。
  it('reports rejected clear executions', async () => {
    hostAccess.respondWith(() => {
      throw 'failed';
    });
    page.handleClearDatabase();
    await vi.waitFor(() => expect(page.clearLoading()).toBe(false));
    expect(page.error()).toBe('清理失败');
  });
});
