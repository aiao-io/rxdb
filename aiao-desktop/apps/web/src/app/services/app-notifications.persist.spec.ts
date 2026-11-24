import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { SystemPreference } from '../data/system-preference.entity';
import { TabSync } from '../data/tab-sync';
import { configureServices } from '../testing/angular';
import { stubLocks } from '../testing/browser';
import { FakeDesktopData, FakeRepository } from '../testing/fake-desktop-data';
import { FakeChannelHub, fakeLocks } from '../testing/fake-tab-sync';
import { fakeWindows } from '../testing/fake-windows';
import {
  AppNotification,
  AppNotifications,
  FOCUS_DND_KEY,
  MAX_BANNERS,
  MAX_PERSISTED_ENTRIES,
  NOTIFICATIONS_ENTRIES_KEY,
  NotificationBanner,
  NotificationSource,
  StoredNotification,
  mergeEntries,
  parseEntries,
  pushBanner,
  sequenceAfter,
  serializeEntries
} from './app-notifications';
import { WindowManager } from './window-manager';

const mail: NotificationSource = { id: 'mail', name: 'Mail', icon: 'app-mail' };
const code: NotificationSource = { id: 'vscode', name: 'Aiao Code', icon: 'app-aiao-code' };

const noteOf = (id: string, title: string, app: NotificationSource): AppNotification => ({
  id,
  app,
  title,
  body: '',
  symbol: null,
  image: null,
  dedupeKey: null,
  postedAt: new Date('2026-11-14T09:00:00Z')
});

const storedOf = (id: string, title: string, app: NotificationSource, postedAt: number): StoredNotification => ({
  id,
  app,
  title,
  body: '',
  symbol: null,
  image: null,
  dedupeKey: null,
  postedAt
});

const bannerOf = (id: string, appId: string): NotificationBanner => ({
  id,
  app: { id: appId, name: appId, icon: appId },
  title: '',
  body: ''
});

/** 偏好表的替身表。 */
type PrefTable = FakeRepository<{ id?: string; key: string; value: unknown }>;

/** 让已排队的微任务（读库、防抖、串行写库）都跑完。 */
const settle = async (rounds = 5): Promise<void> => {
  for (let round = 0; round < rounds; round++) await new Promise<void>(resolve => setTimeout(resolve, 0));
};

/** 等过条目的防抖写回（SAVE_DELAY 是 250ms）。 */
const waitForSave = async (): Promise<void> => {
  await new Promise<void>(resolve => setTimeout(resolve, 320));
  await settle();
};

interface SetupOptions {
  /** 库里已存的 `notifications:entries`；不给就是没存过。 */
  readonly storedEntries?: readonly StoredNotification[];
  /** 库里已存的 `focus:dnd`；不给就是没存过。 */
  readonly storedFocus?: boolean;
  /** 跨标签页广播台：传入后本标签页的 TabSync 挂在它开出的通道上。 */
  readonly hub?: FakeChannelHub;
}

function setup(options: SetupOptions = {}) {
  stubLocks();
  const data = new FakeDesktopData();
  if (options.hub) data.tabs = new TabSync({ channel: options.hub.open(), locks: fakeLocks() });
  const table = data.table<{ id?: string; key: string; value: unknown }>(SystemPreference);
  if (options.storedEntries?.length) table.seed([{ key: NOTIFICATIONS_ENTRIES_KEY, value: options.storedEntries }]);
  if (options.storedFocus !== undefined) table.seed([{ key: FOCUS_DND_KEY, value: options.storedFocus }]);
  const { windows } = fakeWindows();
  configureServices([
    AppNotifications,
    Preferences,
    { provide: DesktopData, useValue: data },
    { provide: WindowManager, useValue: windows }
  ]);
  return { notifications: TestBed.inject(AppNotifications), table, windows };
}

const savedRow = (table: PrefTable, key: string): unknown => table.rows.find(row => row.key === key)?.value;

describe('pushBanner：横幅队列的去重与限额', () => {
  it('空队列放入第一条；同一应用只留最新一条（旧的被替换）', () => {
    const first = bannerOf('b1', 'mail');
    expect(pushBanner([], first)).toEqual([first]);
    expect(pushBanner([first], bannerOf('b2', 'mail'))).toEqual([bannerOf('b2', 'mail')]);
  });

  it('不同应用叠加，新的在最前；超过上限挤掉最旧的', () => {
    const queue = [bannerOf('b1', 'a'), bannerOf('b2', 'b'), bannerOf('b3', 'c')];
    expect(pushBanner(queue, bannerOf('b4', 'd'))).toEqual([
      bannerOf('b4', 'd'),
      bannerOf('b1', 'a'),
      bannerOf('b2', 'b')
    ]);
    expect(pushBanner(queue, bannerOf('b4', 'd'))).toHaveLength(MAX_BANNERS);
  });
});

describe('serializeEntries / parseEntries：持久化的序列化', () => {
  it('postedAt 序列化成毫秒数，读回来还原成 Date', () => {
    const entries = [noteOf('n1', 'a', mail), noteOf('n2', 'b', code)];
    const stored = serializeEntries(entries);
    expect(stored.map(item => typeof item.postedAt)).toEqual(['number', 'number']);
    expect(parseEntries(stored)).toEqual(entries);
  });

  it('序列化最多保存 MAX_PERSISTED_ENTRIES 条', () => {
    const entries = Array.from({ length: 55 }, (_, index) => noteOf(`n${index + 1}`, `t${index}`, mail));
    expect(serializeEntries(entries)).toHaveLength(MAX_PERSISTED_ENTRIES);
  });

  it('偏好表里是不可信输入：不是数组、形状不符、时间非法的条目都丢弃', () => {
    expect(parseEntries('nope')).toEqual([]);
    expect(parseEntries(null)).toEqual([]);
    expect(parseEntries([{ id: 1 }])).toEqual([]);
    const good = storedOf('n1', 'a', mail, 1);
    expect(parseEntries([good, { broken: true }, storedOf('n2', 'b', code, 2)])).toHaveLength(2);
    expect(parseEntries([{ ...good, postedAt: Number.NaN }])).toEqual([]);
  });
});

describe('mergeEntries：恢复时的合并', () => {
  const a = noteOf('n1', 'a', mail);
  const b = noteOf('n2', 'b', code);
  const c = noteOf('n3', 'c', mail);

  it('当前（新提交的）在前，存好的接在后面，按 id 去重', () => {
    expect(mergeEntries([a], [a, b])).toEqual([a, b]);
    expect(mergeEntries([a], [b, c])).toEqual([a, b, c]);
    expect(mergeEntries([], [b, a])).toEqual([b, a]);
  });

  it('最多 MAX_PERSISTED_ENTRIES 条', () => {
    const stored = Array.from({ length: 50 }, (_, index) => noteOf(`n${index + 1}`, `t${index}`, mail));
    expect(mergeEntries([noteOf('nX', 'fresh', code)], stored)).toHaveLength(MAX_PERSISTED_ENTRIES);
  });
});

describe('sequenceAfter：找回最大序号', () => {
  it('取最大的 n<N>；非 n 格式的 id 忽略；空列表是 0', () => {
    expect(sequenceAfter([noteOf('n7', 'a', mail), noteOf('n3', 'b', code)])).toBe(7);
    expect(sequenceAfter([noteOf('x-1', 'a', mail)])).toBe(0);
    expect(sequenceAfter([])).toBe(0);
  });
});

describe('AppNotifications：横幅栈', () => {
  it('提交一条通知就有一条横幅入队：与条目同 id、同来源、同标题正文，新的在前', () => {
    const { notifications } = setup();
    const posted = notifications.post(mail, { title: 'Hello', body: 'World' });
    expect(posted).toEqual({ ok: true, id: 'n1' });
    const [banner] = notifications.banners();
    expect(banner).toMatchObject({ id: 'n1', app: mail, title: 'Hello', body: 'World' });
  });

  it('同一应用的新横幅替换旧横幅；不同应用叠加', () => {
    const { notifications } = setup();
    notifications.post(mail, { title: 'one', body: '' });
    notifications.post(code, { title: 'code', body: '' });
    notifications.post(mail, { title: 'two', body: '' });
    expect(notifications.banners().map(banner => banner.title)).toEqual(['two', 'code']);
  });

  it('dismissBanner 只关那一条；bannerOpen 关掉横幅并打开来源应用', () => {
    const { notifications, windows } = setup();
    notifications.post(mail, { title: 'a', body: '' });
    notifications.post(code, { title: 'b', body: '' });
    notifications.dismissBanner('n1');
    expect(notifications.banners().map(banner => banner.id)).toEqual(['n2']);
    notifications.bannerOpen('n2');
    expect(notifications.banners()).toEqual([]);
    expect(windows.open).toHaveBeenCalledExactlyOnceWith('vscode');
  });

  it('clear 清除条目和它的横幅；clearAll 清空两者', () => {
    const { notifications } = setup();
    notifications.post(mail, { title: 'a', body: '' });
    notifications.post(code, { title: 'b', body: '' });
    notifications.clear('n1');
    expect(notifications.entries().map(entry => entry.title)).toEqual(['b']);
    expect(notifications.banners().map(banner => banner.id)).toEqual(['n2']);
    notifications.clearAll();
    expect(notifications.entries()).toEqual([]);
    expect(notifications.banners()).toEqual([]);
  });
});

describe('AppNotifications：专注模式（勿扰）', () => {
  it('开启时新通知仍进通知中心，但不弹横幅；关掉之后恢复弹横幅', () => {
    const { notifications } = setup();
    notifications.setFocusMode(true);
    notifications.post(mail, { title: 'quiet', body: '' });
    expect(notifications.entries().map(entry => entry.title)).toEqual(['quiet']);
    expect(notifications.banners()).toEqual([]);
    notifications.setFocusMode(false);
    notifications.post(mail, { title: 'loud', body: '' });
    expect(notifications.banners().map(banner => banner.title)).toEqual(['loud']);
  });

  it('开关写入 focus:dnd 偏好；启动时从库里恢复', async () => {
    const { notifications, table } = setup();
    notifications.setFocusMode(true);
    await settle();
    expect(savedRow(table, FOCUS_DND_KEY)).toBe(true);
    const restored = setup({ storedFocus: true });
    await settle();
    expect(restored.notifications.focusMode()).toBe(true);
  });
});

describe('AppNotifications：条目持久化', () => {
  it('条目防抖写回偏好表，postedAt 是毫秒数', async () => {
    const { notifications, table } = setup();
    notifications.post(mail, { title: 'saved', body: '' });
    TestBed.tick();
    await waitForSave();
    const saved = savedRow(table, NOTIFICATIONS_ENTRIES_KEY) as StoredNotification[] | undefined;
    expect(saved).toHaveLength(1);
    expect(saved?.[0]).toMatchObject({ id: 'n1', title: 'saved' });
    expect(typeof saved?.[0]?.postedAt).toBe('number');
  });

  it('启动时恢复：顺序不变、时间是 Date，新条目的 id 不与恢复的冲突', async () => {
    const stored = [storedOf('n7', 'old', mail, 1_000), storedOf('n8', 'newer', code, 2_000)];
    const { notifications } = setup({ storedEntries: stored });
    await settle();
    const entries = notifications.entries();
    expect(entries.map(entry => [entry.id, entry.title, entry.postedAt instanceof Date])).toEqual([
      ['n8', 'newer', true],
      ['n7', 'old', true]
    ]);
    expect(notifications.post(mail, { title: 'next', body: '' })).toEqual({ ok: true, id: 'n9' });
  });

  it('恢复不丢库里读完之前的新提交：新提交在前，存好的接在后面', async () => {
    const { notifications } = setup({ storedEntries: [storedOf('n3', 'stored', mail, 1_000)] });
    notifications.post(code, { title: 'fresh', body: '' });
    await settle();
    expect(notifications.entries().map(entry => entry.title)).toEqual(['fresh', 'stored']);
  });

  it('恢复最多 MAX_PERSISTED_ENTRIES 条', async () => {
    const many = Array.from({ length: 55 }, (_, index) => storedOf(`n${index + 1}`, `t${index}`, mail, index));
    const { notifications } = setup({ storedEntries: many });
    await settle();
    expect(notifications.entries()).toHaveLength(MAX_PERSISTED_ENTRIES);
  });

  it('别的标签页写入后采用库里的现状（跨标签页共享）', async () => {
    const hub = new FakeChannelHub();
    const { notifications, table } = setup({ hub });
    await settle();
    expect(notifications.entries()).toEqual([]);
    table.seed([{ key: NOTIFICATIONS_ENTRIES_KEY, value: [storedOf('n5', 'remote', code, 5_000)] }]);
    hub.open().postMessage({ from: 'other', topic: 'preferences' });
    await settle();
    expect(notifications.entries().map(entry => entry.title)).toEqual(['remote']);
  });
});
