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

  // AC#43：数据库导出按钮永久禁用，UI 上没有可点的入口。
  it('AC#43 MUST keep the database export action disabled', () => {
    expect(page.databaseExportDisabled).toBe(true);
  });

  // AC#43：即使有人绕过禁用状态强制发出命令，答案也是固定的 `export_unsupported`。
  // 断言拿的是**计数**而不是沉默——`evaluations` 为空是可数的证据，
  // 「页面看起来没反应」不是（见 US-904「拒绝是可数的，沉默不是」）。
  it('AC#43 MUST answer export_unsupported for a forced command with zero host reads', () => {
    page.requestDatabaseExport();

    expect(page.exportRefusal()).toBe('export_unsupported');
    expect(hostAccess.evaluations).toEqual([]);
    expect(scriptMocks.createRequestId).not.toHaveBeenCalled();
    expect(scriptMocks.serialize).not.toHaveBeenCalled();
  });

  // 拒绝与「数据库还没连上」无关：两种状态下答案必须一致，
  // 否则 dbInfo 一旦为空就会退化成一条可以被误读为「稍后再试」的诊断。
  it('AC#43 MUST refuse identically when no database info is available', () => {
    database.dbInfo.set(null);

    page.requestDatabaseExport();

    expect(page.exportRefusal()).toBe('export_unsupported');
    expect(hostAccess.evaluations).toEqual([]);
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
