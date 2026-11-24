import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { configureServices } from '../testing/angular';
import { SystemState } from './system-state';

function setup(): SystemState {
  configureServices([SystemState]);
  return TestBed.inject(SystemState);
}

describe('SystemState', () => {
  it('出厂状态：浅色外观、多彩强调色、Wi-Fi 与蓝牙开启、Dock 放大开启', () => {
    const system = setup();
    expect(system).toMatchObject({ user: 'Steve Jobs', host: 'macbook' });
    expect(system.theme()).toBe('light');
    expect(system.appearance()).toBe('light');
    expect(system.accent()).toBe('multi');
    expect(system.highlight()).toBe('accent');
    expect(system.wallpaper()).toBe('tahoe');
    expect(system.wifi()).toBe(true);
    expect(system.bluetooth()).toBe(true);
    expect(system.dockMagOn()).toBe(true);
    expect(system.muted()).toBe(false);
    expect(system.boot).toBeLessThanOrEqual(Date.now());
  });

  it('音量拖到 0 即静音，拖回非零自动取消静音', () => {
    const system = setup();
    system.setVolume(0);
    expect(system.volume()).toBe(0);
    expect(system.muted()).toBe(true);

    system.setVolume(0.4);
    expect(system.volume()).toBe(0.4);
    expect(system.muted()).toBe(false);
  });

  it('亮度限制在 0.25 到 1 之间', () => {
    const system = setup();
    system.setBrightness(0.5);
    expect(system.brightness()).toBe(0.5);
    system.setBrightness(0);
    expect(system.brightness()).toBe(0.25);
    system.setBrightness(3);
    expect(system.brightness()).toBe(1);
  });
});

describe('SystemState 的 Dock 外观信号（DOCKSTATE）', () => {
  it('新增五个信号都有 macOS 的默认值', () => {
    const system = setup();
    expect(system.dockPosition()).toBe('bottom');
    expect(system.dockAutoHide()).toBe(false);
    expect(system.minimizeEffect()).toBe('genie');
    expect(system.dockAnimateOpen()).toBe(true);
    expect(system.dockShowIndicators()).toBe(true);
  });

  it('dockPosition 只接受 bottom / left / right 三种位置', () => {
    const system = setup();
    system.dockPosition.set('left');
    expect(system.dockPosition()).toBe('left');
    system.dockPosition.set('right');
    expect(system.dockPosition()).toBe('right');
    system.dockPosition.set('bottom');
    expect(system.dockPosition()).toBe('bottom');
  });

  it('minimizeEffect 在 genie 与 scale 之间切换', () => {
    const system = setup();
    system.minimizeEffect.set('scale');
    expect(system.minimizeEffect()).toBe('scale');
    system.minimizeEffect.set('genie');
    expect(system.minimizeEffect()).toBe('genie');
  });
});
