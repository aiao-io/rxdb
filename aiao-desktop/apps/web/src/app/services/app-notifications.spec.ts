import { DESKTOP_LIMITS } from '@aiao/orbit/desktop';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { AppNotifications, NotificationSource } from './app-notifications';

const mail: NotificationSource = { id: 'mail', name: 'Mail', icon: 'app-mail' };
const code: NotificationSource = { id: 'vscode', name: 'Aiao Code', icon: 'app-aiao-code' };

function setup(): AppNotifications {
  configureServices([AppNotifications]);
  return TestBed.inject(AppNotifications);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T09:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AppNotifications：条目归属与显示', () => {
  it('条目归属调用方应用，名称与图标取自登记表；新的在前；每条有自己的标识与提交时间', () => {
    const notifications = setup();
    const first = notifications.post(mail, { title: 'Hello', body: 'World' });
    vi.advanceTimersByTime(1_000);
    const second = notifications.post(code, { title: 'Build', body: 'done' });
    expect(first).toEqual({ ok: true, id: 'n1' });
    expect(second).toEqual({ ok: true, id: 'n2' });
    const [newest, oldest] = notifications.entries();
    expect(newest).toMatchObject({ id: 'n2', app: { id: 'vscode', name: 'Aiao Code', icon: 'app-aiao-code' } });
    expect(oldest).toMatchObject({ id: 'n1', app: { id: 'mail', name: 'Mail', icon: 'app-mail' }, title: 'Hello' });
    expect(newest!.postedAt.getTime() - oldest!.postedAt.getTime()).toBe(1_000);
  });

  it('通知自己的图片分成登记图标与内联图片两种，没有就都是 null', () => {
    const notifications = setup();
    notifications.post(mail, { title: 'a', body: '' });
    notifications.post(mail, { title: 'b', body: '', icon: 'app-notes' });
    notifications.post(mail, { title: 'c', body: '', icon: 'data:image/png;base64,AAAA' });
    const [image, symbol, none] = notifications.entries();
    expect([none!.symbol, none!.image]).toEqual([null, null]);
    expect([symbol!.symbol, symbol!.image]).toEqual(['app-notes', null]);
    expect([image!.symbol, image!.image]).toEqual([null, 'data:image/png;base64,AAAA']);
  });

  it('状态只在内存里：新的服务实例（刷新页面、别的标签页）是空的', () => {
    setup().post(mail, { title: 'a', body: 'b' });
    expect(setup().entries()).toEqual([]);
  });
});

describe('AppNotifications：去重键', () => {
  it('同一应用相同的去重键覆盖旧条目（新内容、排最前、新标识），不叠加', () => {
    const notifications = setup();
    notifications.post(mail, { title: 'one', body: '1', dedupeKey: 'inbox' });
    notifications.post(mail, { title: 'other', body: 'x' });
    notifications.post(mail, { title: 'two', body: '2', dedupeKey: 'inbox' });
    expect(notifications.entries().map(entry => entry.title)).toEqual(['two', 'other']);
    expect(notifications.entries()[0]!.id).toBe('n3');
  });

  it('不同应用相同的去重键互不覆盖；没有去重键的通知从不被覆盖', () => {
    const notifications = setup();
    notifications.post(mail, { title: 'mail', body: '', dedupeKey: 'k' });
    notifications.post(code, { title: 'code', body: '', dedupeKey: 'k' });
    notifications.post(mail, { title: 'plain 1', body: '' });
    notifications.post(mail, { title: 'plain 2', body: '' });
    expect(notifications.entries().map(entry => entry.title)).toEqual(['plain 2', 'plain 1', 'code', 'mail']);
  });
});

describe('AppNotifications：频率上限与保留条数', () => {
  it('限额是协议常量：与 Orbit 的 DESKTOP_LIMITS.notification 一致（首屏里的通知中心不引入 Orbit 的运行时代码）', () => {
    const notifications = setup();
    const { perMinute, windowMs, entriesPerApp } = DESKTOP_LIMITS.notification;
    for (let index = 0; index < perMinute; index++)
      expect(notifications.post(mail, { title: `n${index}`, body: '' }).ok).toBe(true);
    expect(notifications.post(mail, { title: 'over', body: '' })).toEqual({ ok: false, reason: 'rate-limited' });
    vi.advanceTimersByTime(windowMs - 1);
    expect(notifications.post(mail, { title: 'still over', body: '' }).ok).toBe(false);
    vi.advanceTimersByTime(1);
    expect(notifications.post(mail, { title: 'after window', body: '' }).ok).toBe(true);
    /* 保留条数：每分钟只能提交 perMinute 条，隔分钟提交到超过保留条数，旧的被挤掉。 */
    for (let minute = 0; minute < 3; minute++) {
      vi.advanceTimersByTime(windowMs);
      for (let index = 0; index < perMinute; index++)
        notifications.post(mail, { title: `m${minute}-${index}`, body: '' });
    }
    expect(notifications.entries().filter(entry => entry.app.id === 'mail')).toHaveLength(entriesPerApp);
    expect(notifications.entries()[0]!.title).toBe('m2-9');
  });

  it('被拒绝的提交不占限额也不进通知中心；一个应用超限不影响别的应用', () => {
    const notifications = setup();
    for (let index = 0; index < 10; index++) notifications.post(mail, { title: `n${index}`, body: '' });
    for (let index = 0; index < 5; index++)
      expect(notifications.post(mail, { title: 'over', body: '' }).ok).toBe(false);
    expect(notifications.entries()).toHaveLength(10);
    expect(notifications.post(code, { title: 'fine', body: '' }).ok).toBe(true);
    vi.advanceTimersByTime(60_000);
    /* 一分钟前的 10 条都滑出了窗口；被拒绝的 5 次不算，所以又能提交满 10 条。 */
    for (let index = 0; index < 10; index++)
      expect(notifications.post(mail, { title: `again ${index}`, body: '' }).ok).toBe(true);
  });

  it('保留条数按应用算：一个应用被挤掉旧条目，别的应用的条目原样保留', () => {
    const notifications = setup();
    notifications.post(code, { title: 'keep me', body: '' });
    for (let minute = 0; minute < 5; minute++) {
      vi.advanceTimersByTime(60_000);
      for (let index = 0; index < 10; index++) notifications.post(mail, { title: `${minute}.${index}`, body: '' });
    }
    expect(notifications.entries().filter(entry => entry.app.id === 'vscode')).toHaveLength(1);
    expect(notifications.entries().filter(entry => entry.app.id === 'mail')).toHaveLength(20);
  });
});

describe('AppNotifications：用户清除', () => {
  it('清除一条只清那一条；清除全部清空；清除的条目不会回来', () => {
    const notifications = setup();
    notifications.post(mail, { title: 'a', body: '' });
    notifications.post(code, { title: 'b', body: '' });
    notifications.post(mail, { title: 'c', body: '' });
    notifications.clear('n2');
    expect(notifications.entries().map(entry => entry.title)).toEqual(['c', 'a']);
    notifications.clear('nope');
    expect(notifications.entries()).toHaveLength(2);
    notifications.clearAll();
    expect(notifications.entries()).toEqual([]);
    notifications.post(mail, { title: 'd', body: '' });
    expect(notifications.entries().map(entry => entry.title)).toEqual(['d']);
  });
});
