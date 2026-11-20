import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { SystemPreference } from '../data/system-preference.entity';
import { configureServices } from '../testing/angular';
import { stubLocks } from '../testing/browser';
import { FakeDesktopData } from '../testing/fake-desktop-data';
import { FakeLifecycle } from '../testing/fake-tab-sync';
import {
  ACTIVE_TAB_LEASE_TTL,
  BROWSER_SESSION_LIFECYCLE,
  BrowserSessionRestore,
  TAB_STORAGE
} from './browser-session-restore';
import { WindowRecord, activeTabKey, windowLayoutKey } from './window-layout-model';

const TAB = 'tab-aaaa-0001';
const OTHER_TAB = 'tab-bbbb-0002';
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);

const storage = (tabId = TAB) => ({
  getItem: (key: string) => (key === 'aiao-desktop:tab-id' ? tabId : null),
  setItem: vi.fn()
});

const record = (appId: WindowRecord['appId'] = 'notes'): WindowRecord => ({
  appId,
  name: appId,
  box: { left: 100, top: 80, width: 600, height: 400 },
  minimized: false,
  zoomed: false,
  options: {}
});

function setup(rows: readonly { readonly key: string; readonly value: unknown }[] = []) {
  stubLocks();
  const data = new FakeDesktopData();
  const table = data.table<{ id?: string; key: string; value: unknown }>(SystemPreference);
  table.seed(rows);
  const lifecycle = new FakeLifecycle();
  configureServices([
    BrowserSessionRestore,
    Preferences,
    { provide: DesktopData, useValue: data },
    { provide: TAB_STORAGE, useValue: storage() },
    { provide: BROWSER_SESSION_LIFECYCLE, useValue: lifecycle }
  ]);
  return { data, table, lifecycle, restore: TestBed.inject(BrowserSessionRestore) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BrowserSessionRestore', () => {
  it('没有其他活跃标签页时领取最近工作区快照', async () => {
    const resume = { version: 1, updatedAt: NOW - 100, activeAt: NOW - 100, sourceTabId: OTHER_TAB, windows: [record()] };
    const ctx = setup([{ key: 'windows:resume', value: resume }]);

    await expect(ctx.restore.prepare(false)).resolves.toMatchObject({
      available: true,
      tabId: TAB,
      resume,
      canPublish: true
    });
    expect(ctx.table.rows.find(row => row.key === activeTabKey(TAB))?.value).toMatchObject({ tabId: TAB });
  });

  it('当前标签页已有布局时优先当前布局，不领取共享快照', async () => {
    const resume = { version: 1, updatedAt: NOW, activeAt: NOW, sourceTabId: OTHER_TAB, windows: [record()] };
    const ctx = setup([
      { key: windowLayoutKey(TAB), value: { version: 1, updatedAt: NOW, windows: [] } },
      { key: 'windows:resume', value: resume }
    ]);

    await expect(ctx.restore.prepare(true)).resolves.toMatchObject({ resume: undefined, canPublish: true });
  });

  it('存在其他活跃标签页时新标签页不重复领取共享快照', async () => {
    const resume = { version: 1, updatedAt: NOW, activeAt: NOW, sourceTabId: OTHER_TAB, windows: [record()] };
    const ctx = setup([
      { key: activeTabKey(OTHER_TAB), value: { version: 1, tabId: OTHER_TAB, updatedAt: NOW, lastActiveAt: NOW } },
      { key: 'windows:resume', value: resume }
    ]);

    await expect(ctx.restore.prepare(false)).resolves.toMatchObject({
      resume: undefined,
      canPublish: false
    });
  });

  it('过期租约不阻挡新的浏览器会话恢复', async () => {
    const resume = { version: 1, updatedAt: NOW, activeAt: NOW, sourceTabId: OTHER_TAB, windows: [record()] };
    const ctx = setup([
      {
        key: activeTabKey(OTHER_TAB),
        value: { version: 1, tabId: OTHER_TAB, updatedAt: NOW - ACTIVE_TAB_LEASE_TTL - 1, lastActiveAt: NOW }
      },
      { key: 'windows:resume', value: resume }
    ]);

    await expect(ctx.restore.prepare(false)).resolves.toMatchObject({ resume, canPublish: true });
  });

  it('保存快照是一个完整的单行值，并且较旧的活跃来源不能覆盖较新的快照', async () => {
    const ctx = setup([
      {
        key: 'windows:resume',
        value: { version: 1, updatedAt: NOW, activeAt: NOW + 100, sourceTabId: OTHER_TAB, windows: [record('calculator')] }
      }
    ]);
    await ctx.restore.prepare(false);
    await ctx.restore.saveResume([record('notes')]);

    expect(ctx.table.rows.find(row => row.key === 'windows:resume')?.value).toMatchObject({
      sourceTabId: OTHER_TAB,
      windows: [{ appId: 'calculator' }]
    });
  });

  it('关闭流程先提交最后一份窗口快照，再释放标签页租约', async () => {
    const ctx = setup();
    await ctx.restore.prepare(false);
    const saving = ctx.restore.saveResume([record('notes')]);
    const closing = ctx.restore.close();
    await Promise.all([saving, closing]);

    expect(ctx.table.rows.find(row => row.key === 'windows:resume')?.value).toMatchObject({
      sourceTabId: TAB,
      windows: [{ appId: 'notes' }]
    });
    expect(ctx.table.rows.find(row => row.key === activeTabKey(TAB))?.value).toMatchObject({ released: true });
  });

  it('页面关闭时释放租约，恢复到前台时重新标记活跃来源', async () => {
    const ctx = setup();
    await ctx.restore.prepare(false);

    ctx.lifecycle.fire('focus');
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.table.rows.find(row => row.key === activeTabKey(TAB))?.value).toMatchObject({
      lastActiveAt: NOW
    });

    ctx.lifecycle.fire('pagehide');
    await ctx.restore.close();
    expect(ctx.table.rows.find(row => row.key === activeTabKey(TAB))?.value).toMatchObject({ released: true });
  });
});
