import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseStateService } from '../services/database-state.service';
import { PortService } from '../services/port.service';
import { ThemeService } from '../services/theme.service';
import type { DbInfo } from '../types/devtools.types';
import { SettingsPage } from './settings.page';

const scriptMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  createRequestId: vi.fn((prefix: string) => `${prefix}-request`),
  serialize: vi.fn(() => 'serialized-code')
}));

vi.mock('../scripts', async importOriginal => {
  const actual = await importOriginal<typeof import('../scripts')>();
  return {
    ...actual,
    executeInInspectedWindow: scriptMocks.execute,
    createScriptRequestId: scriptMocks.createRequestId,
    serializeFunctionWithResult: scriptMocks.serialize
  };
});

class ThemeStub {
  readonly theme = signal<'light' | 'dark' | 'system'>('system');
  readonly resolvedTheme = signal<'light' | 'dark'>('light');
  readonly setTheme = vi.fn((theme: 'light' | 'dark' | 'system') => this.theme.set(theme));
}

class PortStub {
  readonly subscribe = vi.fn();
}

class DatabaseStub {
  readonly dbInfo = signal<DbInfo | null>({ dbName: 'demo', entities: [], version: '1' });
}

describe('SettingsPage', () => {
  let theme: ThemeStub;
  let page: SettingsPage;
  let reload: ReturnType<typeof vi.fn>;
  let confirmMock: ReturnType<typeof vi.fn>;
  let database: DatabaseStub;

  beforeEach(() => {
    theme = new ThemeStub();
    database = new DatabaseStub();
    reload = vi.fn();
    confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    vi.stubGlobal('chrome', {
      devtools: { inspectedWindow: { reload, eval: vi.fn() } }
    } as unknown as typeof chrome);
    TestBed.configureTestingModule({
      providers: [
        SettingsPage,
        { provide: ThemeService, useValue: theme },
        { provide: PortService, useClass: PortStub },
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

  it('downloads the database and reports result errors', async () => {
    scriptMocks.execute.mockResolvedValueOnce({ success: false, error: 'download failed' });

    page.handleDownloadDatabase();
    expect(page.downloadLoading()).toBe(true);
    await vi.waitFor(() => expect(page.downloadLoading()).toBe(false));

    expect(page.error()).toBe('download failed');
    expect(scriptMocks.createRequestId).toHaveBeenCalledWith('download');
    expect(scriptMocks.serialize).toHaveBeenCalledWith(expect.any(Function), 'download-request', ['demo']);
    expect(scriptMocks.execute).toHaveBeenCalledWith(
      expect.any(PortStub),
      expect.objectContaining({ reload }),
      'serialized-code',
      'download-request'
    );
  });

  it('reports rejected download executions', async () => {
    scriptMocks.execute.mockRejectedValueOnce(new Error('bridge failed'));
    page.handleDownloadDatabase();
    await vi.waitFor(() => expect(page.downloadLoading()).toBe(false));
    expect(page.error()).toBe('bridge failed');
  });

  it('没有数据库信息时不启动下载并给出诊断', () => {
    database.dbInfo.set(null);

    page.handleDownloadDatabase();

    expect(scriptMocks.execute).not.toHaveBeenCalled();
    expect(page.downloadLoading()).toBe(false);
    expect(page.error()).toBe('未获取到数据库信息，请先刷新数据库连接');
  });

  it('does not clear data when confirmation is rejected', () => {
    confirmMock.mockReturnValueOnce(false);
    page.handleClearDatabase();
    expect(scriptMocks.execute).not.toHaveBeenCalled();
    expect(page.clearLoading()).toBe(false);
  });

  it('collects partial clear failures without reloading', async () => {
    scriptMocks.execute.mockResolvedValueOnce({
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
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads only after all critical stores clear successfully', async () => {
    scriptMocks.execute.mockResolvedValueOnce({
      rxdb: { success: true },
      opfs: { success: true },
      indexedDB: { success: true },
      localStorage: { success: true }
    });

    page.handleClearDatabase();
    await vi.waitFor(() => expect(page.clearLoading()).toBe(false));

    expect(page.error()).toBeNull();
    expect(reload).toHaveBeenCalledWith({});
  });

  it('reports rejected clear executions', async () => {
    scriptMocks.execute.mockRejectedValueOnce('failed');
    page.handleClearDatabase();
    await vi.waitFor(() => expect(page.clearLoading()).toBe(false));
    expect(page.error()).toBe('清理失败');
  });
});
