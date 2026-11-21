import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { DockState, DockView } from './dock-state';

const view = (): DockView => ({
  bounce: vi.fn(),
  stopBounce: vi.fn(),
  focusApp: vi.fn(),
  rectFor: vi.fn(appId => ({ x: appId.length, y: 2, w: 48, h: 48 })),
  setPointerX: vi.fn()
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
    expect(() => dock.focusApp('notes')).toThrow('Dock view is not attached');
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

  it('把桌面拖动中的指针位置转交给 Dock 的放大逻辑', () => {
    const dock = setup();
    const current = view();
    dock.attach(current);

    dock.setPointerX(320);
    dock.setPointerX(null);

    expect(current.setPointerX).toHaveBeenNthCalledWith(1, 320);
    expect(current.setPointerX).toHaveBeenNthCalledWith(2, null);
  });

  it('按屏幕命中结果判断 Dock 与废纸篓，并维护废纸篓拖放状态', () => {
    const dom = configureServices([DockState]);
    const dock = TestBed.inject(DockState);
    const element = {
      closest: vi.fn((selector: string) =>
        selector === '#dock' || selector === '#dock .di[data-app="trash"]' ? {} : null
      )
    } as unknown as Element;
    Object.assign(dom.document, { elementsFromPoint: vi.fn(() => [element]) });

    expect(dock.isDockAt(10, 20)).toBe(true);
    expect(dock.isTrashAt(10, 20)).toBe(true);
    dock.setTrashDropActive(true);
    expect(dock.trashDropActive()).toBe(true);
    dock.setTrashDropActive(false);
    expect(dock.trashDropActive()).toBe(false);
  });

  it('键盘焦点交给某个应用的 Dock 图标，也转交给 Dock 组件（ADESK-US-108）', () => {
    const dock = setup();
    const current = view();
    dock.attach(current);
    dock.focusApp('notes');
    expect(current.focusApp).toHaveBeenCalledExactlyOnceWith('notes');
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
