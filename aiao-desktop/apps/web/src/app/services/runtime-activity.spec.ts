import '@angular/compiler';

import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { testApps } from '../testing/desktop-apps';
import { DesktopWindow } from './desktop-window';
import { RuntimeActivity } from './runtime-activity';
import { Session } from './session';
import { WindowManager } from './window-manager';

function setup() {
  const document = Object.assign(new EventTarget(), { hidden: false });
  const session = { locked: signal(false), sleep: signal('awake'), boot: signal<unknown>(null) };
  const wm = { windows: signal<DesktopWindow[]>([]), focused: signal<DesktopWindow | null>(null) };
  const remove = vi.spyOn(document, 'removeEventListener');
  configureServices([
    RuntimeActivity,
    { provide: DOCUMENT, useValue: document },
    { provide: Session, useValue: session },
    { provide: WindowManager, useValue: wm }
  ]);
  const app = testApps().notes;
  const win = new DesktopWindow('note-1', app, {}, { left: 0, top: 0, width: 400, height: 300 });
  win.state.set('ready');
  wm.windows.set([win]);
  wm.focused.set(win);
  return { activity: TestBed.inject(RuntimeActivity), document, session, wm, win, remove };
}

describe('RuntimeActivity', () => {
  it('窗口保持可见时，失去焦点不意味着暂停', () => {
    const { activity, wm, win } = setup();
    expect(activity.visible(win)).toBe(true);
    expect(activity.rows()[0]).toMatchObject({
      id: win.id,
      title: win.title(),
      state: 'Ready',
      visibility: 'Foreground',
      resources: 'Managed by app',
      source: 'Built-in app'
    });
    wm.focused.set(null);
    expect(activity.visible(win)).toBe(true);
    expect(activity.rows()[0].visibility).toBe('Background');
  });

  it('最小化、动画后隐藏与关闭都禁止受控循环继续', () => {
    const { activity, win } = setup();
    for (const state of [win.minimized, win.hidden, win.closing]) {
      state.set(true);
      expect(activity.visible(win)).toBe(false);
      state.set(false);
      expect(activity.visible(win)).toBe(true);
    }
    win.minimized.set(true);
    expect(activity.rows()[0].visibility).toBe('Minimized');
    win.state.set('closed');
    expect(activity.visible(win)).toBe(false);
  });

  it('锁屏、睡眠、开机和浏览器页面隐藏独立阻止运行', () => {
    const { activity, document, session, win } = setup();
    session.locked.set(true);
    expect(activity.visible(win)).toBe(false);
    expect(activity.rows()[0].visibility).toBe('Desktop hidden');
    session.locked.set(false);
    session.sleep.set('asleep');
    expect(activity.visible(win)).toBe(false);
    session.sleep.set('waking');
    expect(activity.visible(win)).toBe(false);
    session.sleep.set('awake');
    session.boot.set({ id: 1 });
    expect(activity.visible(win)).toBe(false);
    session.boot.set(null);
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(activity.visible(win)).toBe(false);
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(activity.visible(win)).toBe(true);
  });

  it('行反映实际标题、装载/失败、资源回报和窗口移除', () => {
    const { activity, wm, win } = setup();
    win.title.set('Unsaved draft');
    win.state.set('loading');
    expect(activity.rows()[0]).toMatchObject({ title: 'Unsaved draft', state: 'Loading' });
    win.state.set('failed');
    win.failure.set('Unable to load app');
    expect(activity.rows()[0]).toMatchObject({ state: 'Failed', failure: 'Unable to load app' });
    for (const [state, label] of [
      ['pending', 'Starting'],
      ['running', 'Rendering'],
      ['paused', 'Rendering and audio paused'],
      ['failed', 'Pause or resume failed']
    ] as const) {
      win.resourceState.set(state);
      expect(activity.rows()[0].resources).toBe(label);
    }
    win.resourceFailure.set('Audio unavailable');
    expect(activity.rows()[0].failure).toBe('Audio unavailable');
    wm.windows.set([]);
    expect(activity.rows()).toEqual([]);
  });

  it('销毁时清除全局可见性监听', () => {
    const { remove } = setup();
    TestBed.resetTestingModule();
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
