import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { DockState, DockView } from './dock-state';

const view = (): DockView => ({
  bounce: vi.fn(),
  stopBounce: vi.fn(),
  rectFor: vi.fn(appId => ({ x: appId.length, y: 2, w: 48, h: 48 }))
});

function setup(): DockState {
  configureServices([DockState]);
  return TestBed.inject(DockState);
}

describe('DockState', () => {
  it('Dock 组件还没挂上时，弹跳与定位都报错而不是悄悄忽略', () => {
    const dock = setup();
    expect(() => dock.bounce('notes')).toThrow('Dock view is not attached');
    expect(() => dock.stopBounce('notes')).toThrow('Dock view is not attached');
    expect(() => dock.rectFor('notes')).toThrow('Dock view is not attached');
  });

  it('挂上之后，弹跳、停止弹跳与图标位置都转交给 Dock 组件', () => {
    const dock = setup();
    const current = view();
    dock.attach(current);

    dock.bounce('notes');
    dock.stopBounce('notes');
    expect(current.bounce).toHaveBeenCalledExactlyOnceWith('notes');
    expect(current.stopBounce).toHaveBeenCalledExactlyOnceWith('notes');
    expect(dock.rectFor('notes')).toEqual({ x: 5, y: 2, w: 48, h: 48 });
  });

  it('重新挂载（比如 Dock 重建）后以最新的视图为准', () => {
    const dock = setup();
    const first = view();
    const second = view();
    dock.attach(first);
    dock.attach(second);
    dock.bounce('mail');
    expect(first.bounce).not.toHaveBeenCalled();
    expect(second.bounce).toHaveBeenCalledExactlyOnceWith('mail');
  });
});
