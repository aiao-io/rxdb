import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { createWindowManagerStub } from '../testing/stubs';
import { AppLauncher } from './app-launcher';
import { DockState } from './dock-state';
import { Overlays } from './overlays';
import { WindowManager } from './window-manager';

function setup() {
  const wm = createWindowManagerStub();
  const dock = { bounce: vi.fn() };
  const overlays = { toggleLaunchpad: vi.fn() };
  configureServices([
    AppLauncher,
    { provide: WindowManager, useValue: wm },
    { provide: DockState, useValue: dock },
    { provide: Overlays, useValue: overlays }
  ]);
  return { launcher: TestBed.inject(AppLauncher), wm, dock, overlays };
}

const windowOf = (id: string, minimized = false) => ({ id, minimized: () => minimized });

describe('AppLauncher', () => {
  it('启动台是系统入口：切换启动台，不开窗口', () => {
    const { launcher, wm, overlays } = setup();
    launcher.activate('launchpad');
    expect(overlays.toggleLaunchpad).toHaveBeenCalledTimes(1);
    expect(wm.open).not.toHaveBeenCalled();
  });

  it('废纸篓是系统入口：用 Finder 打开 Trash', () => {
    const { launcher, wm } = setup();
    launcher.activate('trash');
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('finder', { path: ['Trash'] });
  });

  it('应用还没打开：Dock 弹跳并打开窗口', () => {
    const { launcher, wm, dock } = setup();
    launcher.activate('notes');
    expect(dock.bounce).toHaveBeenCalledExactlyOnceWith('notes');
    expect(wm.open).toHaveBeenCalledExactlyOnceWith('notes');
    expect(wm.focus).not.toHaveBeenCalled();
  });

  it('应用已经打开：把最后打开的窗口调到前台，不再弹跳也不新开', () => {
    const { launcher, wm, dock } = setup();
    wm.byApp.mockReturnValue([windowOf('w1'), windowOf('w2')]);
    launcher.activate('finder');
    expect(wm.focus).toHaveBeenCalledExactlyOnceWith('w2');
    expect(wm.open).not.toHaveBeenCalled();
    expect(dock.bounce).not.toHaveBeenCalled();
  });

  it('有最小化的窗口时优先从 Dock 还原它', () => {
    const { launcher, wm } = setup();
    wm.byApp.mockReturnValue([windowOf('w1', true), windowOf('w2')]);
    launcher.activate('finder');
    expect(wm.unminimize).toHaveBeenCalledExactlyOnceWith('w1');
    expect(wm.focus).not.toHaveBeenCalled();
  });
});
